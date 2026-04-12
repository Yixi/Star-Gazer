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
///
/// **引用计数**：同一个 path 可能被多次 `watch`（比如 Sidebar 的
/// HiddenProjectGitSync 和 ProjectBody 都对 active project 调 watchDir）。
/// 没有计数的话后一次 watch 会 noop，但其中任何一个先 unwatch 就会把整个
/// 底层 watcher 销毁，导致还在订阅的组件收不到任何事件。
/// 现在每次 watch 累加 refcount，unwatch 递减，归 0 才真正 drop。
pub struct FileWatcherManager {
    watchers: Mutex<HashMap<String, WatcherHandle>>,
}

/// Watcher 句柄，用于存储和管理
struct WatcherHandle {
    _watcher: RecommendedWatcher,
    /// 用于通知停止去抖线程
    _stop_tx: mpsc::Sender<()>,
    /// 活跃订阅者数量 — 每次 watch 加 1，unwatch 减 1，0 时 drop 整个 handle
    refcount: usize,
}

impl FileWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    /// 开始监听目录（支持引用计数）
    ///
    /// 已有 watcher 则只把 refcount + 1；没有才创建新的 notify watcher。
    pub fn watch(&self, app: AppHandle, path: &str) -> Result<(), String> {
        let path_str = path.to_string();

        // 已在监听 → refcount + 1 直接返回
        {
            let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;
            if let Some(handle) = watchers.get_mut(path) {
                handle.refcount += 1;
                log::debug!(
                    "watch 已存在: {} (refcount={})",
                    path_str,
                    handle.refcount
                );
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

        // 存储 watcher，refcount 从 1 开始
        let handle = WatcherHandle {
            _watcher: watcher,
            _stop_tx: stop_tx,
            refcount: 1,
        };

        self.watchers
            .lock()
            .map_err(|e| e.to_string())?
            .insert(path_str.clone(), handle);

        log::info!("开始监听目录: {} (refcount=1)", path_str);
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
        /// pending map 上限，防止 npm install 这种风暴场景内存无限增长
        /// 超过后立刻 flush，清空 map 保底。
        const MAX_PENDING: usize = 2048;
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
                            // 超上限立即强制 flush 一次，保底内存安全
                            if map.len() >= MAX_PENDING {
                                last_flush = Instant::now()
                                    .checked_sub(debounce_duration)
                                    .unwrap_or_else(Instant::now);
                            }
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
    ///
    /// 特殊情况：虽然 `.git` 整个目录在 IGNORED_DIRS 里，但**我们需要一部分
    /// `.git` 内部信号**才能检测到 commit / 切分支 / stage 变化：
    ///
    /// - `.git/HEAD`   — 切分支 / commit / reset 时会改
    /// - `.git/index`  — git add / rm / 任何 staging 操作会改
    /// - `.git/refs/*` — branch / tag 的创建、删除、推送
    ///
    /// 这三类路径放行，其他 `.git` 内部文件（objects / logs / lfs 等噪音）
    /// 继续过滤。路径放行后会触发前端 `refreshGitStatus()`，从而在 UI 上
    /// 反映最新的 git 状态。
    fn should_ignore(path: &Path) -> bool {
        let path_str = path.to_string_lossy();

        // 先做 .git 内部白名单判定
        let in_dot_git = path_str.contains("/.git/") || path_str.ends_with("/.git");
        if in_dot_git {
            // refs/ 下任意文件放行
            if path_str.contains("/.git/refs/") {
                return false;
            }
            // HEAD / index 放行（精确匹配文件名）
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name == "HEAD" || name == "index" {
                    return false;
                }
            }
            // 其他 .git 内部路径继续过滤
            return true;
        }

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

    /// 停止监听目录（支持引用计数）
    ///
    /// refcount 递减；归 0 才真正 drop watcher + 停止去抖线程。
    pub fn unwatch(&self, path: &str) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = watchers.get_mut(path) {
            if handle.refcount > 1 {
                handle.refcount -= 1;
                log::debug!(
                    "unwatch 递减: {} (refcount={})",
                    path,
                    handle.refcount
                );
                return Ok(());
            }
            // refcount 到 0，真正移除
            watchers.remove(path);
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
