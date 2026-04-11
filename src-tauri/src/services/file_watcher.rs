//! 文件监听服务
//! 使用 notify crate 监听文件系统变更，带 100ms 去抖动

use crate::types::models::FileChangeEvent;
use notify::{
    event::{ModifyKind, RenameMode},
    EventKind, RecommendedWatcher, RecursiveMode, Watcher,
};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// 需要忽略的目录名称
const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    ".DS_Store",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "__pycache__",
    ".cache",
    ".idea",
    ".vscode",
];

/// 文件监听管理器
pub struct FileWatcherManager {
    watchers: Mutex<HashMap<String, WatcherHandle>>,
}

/// Watcher 句柄，用于存储和管理
struct WatcherHandle {
    _watcher: RecommendedWatcher,
    /// 用于通知停止去抖线程
    _stop_tx: mpsc::Sender<()>,
}

impl FileWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    /// 开始监听目录
    pub fn watch(&self, app: AppHandle, path: &str) -> Result<(), String> {
        let path_str = path.to_string();

        // 检查是否已在监听
        {
            let watchers = self.watchers.lock().map_err(|e| e.to_string())?;
            if watchers.contains_key(path) {
                return Ok(());
            }
        }

        // 用于事件去抖动的通道
        let (event_tx, event_rx) = mpsc::channel::<notify::Event>();
        // 用于停止去抖线程的通道
        let (stop_tx, stop_rx) = mpsc::channel::<()>();

        // 创建 watcher
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                let _ = event_tx.send(event);
            }
        })
        .map_err(|e| format!("创建文件监听器失败: {}", e))?;

        // 开始递归监听
        watcher
            .watch(Path::new(path), RecursiveMode::Recursive)
            .map_err(|e| format!("监听目录失败: {}", e))?;

        // 启动去抖动处理线程
        let app_clone = app.clone();
        std::thread::spawn(move || {
            Self::debounce_loop(app_clone, event_rx, stop_rx);
        });

        // 存储 watcher
        let handle = WatcherHandle {
            _watcher: watcher,
            _stop_tx: stop_tx,
        };

        self.watchers
            .lock()
            .map_err(|e| e.to_string())?
            .insert(path_str.clone(), handle);

        log::info!("开始监听目录: {}", path_str);
        Ok(())
    }

    /// 去抖动处理循环
    fn debounce_loop(
        app: AppHandle,
        event_rx: mpsc::Receiver<notify::Event>,
        stop_rx: mpsc::Receiver<()>,
    ) {
        // 使用 HashMap 合并同路径事件，实现去抖动
        let pending: Arc<Mutex<HashMap<String, String>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let debounce_duration = Duration::from_millis(100);
        let mut last_flush = Instant::now();

        loop {
            // 检查是否需要停止
            if stop_rx.try_recv().is_ok() {
                break;
            }

            // 非阻塞接收事件，超时 50ms
            match event_rx.recv_timeout(Duration::from_millis(50)) {
                Ok(event) => {
                    // 过滤忽略的目录
                    for path in &event.paths {
                        if Self::should_ignore(path) {
                            continue;
                        }

                        let kind = Self::event_kind_to_string(&event.kind);
                        let path_str = path.to_string_lossy().to_string();

                        if let Ok(mut map) = pending.lock() {
                            map.insert(path_str, kind);
                        }
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // 超时，检查是否需要刷新
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    // 发送端已断开，退出循环
                    break;
                }
            }

            // 如果距离上次刷新超过 100ms 且有待处理事件，则刷新
            if last_flush.elapsed() >= debounce_duration {
                let events_to_send: Vec<FileChangeEvent> = {
                    if let Ok(mut map) = pending.lock() {
                        let events: Vec<FileChangeEvent> = map
                            .drain()
                            .map(|(path, kind)| FileChangeEvent { path, kind })
                            .collect();
                        events
                    } else {
                        vec![]
                    }
                };

                for event in events_to_send {
                    if let Err(e) = app.emit("file-changed", &event) {
                        log::error!("发送文件变更事件失败: {}", e);
                    }
                }

                last_flush = Instant::now();
            }
        }
    }

    /// 判断路径是否应被忽略
    fn should_ignore(path: &Path) -> bool {
        for component in path.components() {
            if let std::path::Component::Normal(name) = component {
                let name_str = name.to_string_lossy();
                if IGNORED_DIRS.contains(&name_str.as_ref()) {
                    return true;
                }
            }
        }
        false
    }

    /// 将 notify EventKind 转换为简单字符串
    fn event_kind_to_string(kind: &EventKind) -> String {
        match kind {
            EventKind::Create(_) => "create".to_string(),
            EventKind::Modify(modify_kind) => match modify_kind {
                ModifyKind::Name(RenameMode::From)
                | ModifyKind::Name(RenameMode::To)
                | ModifyKind::Name(RenameMode::Both) => "rename".to_string(),
                _ => "modify".to_string(),
            },
            EventKind::Remove(_) => "remove".to_string(),
            _ => "modify".to_string(),
        }
    }

    /// 停止监听目录
    pub fn unwatch(&self, path: &str) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;
        if watchers.remove(path).is_some() {
            log::info!("停止监听目录: {}", path);
        }
        Ok(())
    }

    /// 停止所有监听
    pub fn unwatch_all(&self) {
        if let Ok(mut watchers) = self.watchers.lock() {
            let count = watchers.len();
            watchers.clear();
            log::info!("已停止所有文件监听 ({}个)", count);
        }
    }
}

impl Default for FileWatcherManager {
    fn default() -> Self {
        Self::new()
    }
}
