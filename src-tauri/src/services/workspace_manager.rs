//! Workspace 文件管理服务
//!
//! 负责：
//! - 读写任意用户路径的 `.sgw` 文件（原子写）
//! - 维护 app_data_dir 下的 `recent-workspaces.json` 索引
//! - 迁移旧版 `projects.json`
//! - 启动参数解析
//! - 窗口 label ↔ workspace 路径映射

use crate::types::workspace::{RecentEntry, RecentWorkspaces};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// 启动时检测到的 .sgw 路径（CLI 参数或 macOS open-file），被前端消费一次后清空。
pub struct StartupPathCache(pub Mutex<Option<String>>);

impl StartupPathCache {
    pub fn new(initial: Option<String>) -> Self {
        Self(Mutex::new(initial))
    }

    /// 读一次即清空
    pub fn take(&self) -> Option<String> {
        self.0.lock().ok().and_then(|mut g| g.take())
    }

    /// 无损设置（仅在为空时）
    pub fn set_if_empty(&self, path: String) -> bool {
        if let Ok(mut g) = self.0.lock() {
            if g.is_none() {
                *g = Some(path);
                return true;
            }
        }
        false
    }
}

/// Workspace 管理器
pub struct WorkspaceManager {
    /// window label → canonical workspace path
    window_map: Mutex<HashMap<String, String>>,
    /// 当前所有打开窗口中合法的项目根目录（canonical），供 fs 命令做沙箱校验
    project_paths: Mutex<Vec<String>>,
}

impl WorkspaceManager {
    pub fn new() -> Self {
        Self {
            window_map: Mutex::new(HashMap::new()),
            project_paths: Mutex::new(Vec::new()),
        }
    }

    // -------- 项目路径沙箱（fs 命令用） --------

    /// 同步当前窗口已注册的项目路径集合。
    /// 前端在 workspace 加载完成、或 addProject/removeProject 后调用。
    pub fn sync_project_paths(&self, paths: Vec<String>) {
        let mut canonical: Vec<String> = paths
            .into_iter()
            .map(|p| canonicalize_or_raw(&p))
            .collect();
        canonical.sort();
        canonical.dedup();
        if let Ok(mut guard) = self.project_paths.lock() {
            *guard = canonical;
        }
    }

    /// 列出已注册项目路径（已 canonicalize）
    pub fn list_project_paths(&self) -> Vec<String> {
        self.project_paths
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    /// 校验 canonical 路径位于某个已注册项目内
    pub fn ensure_path_in_projects(&self, canonical: &Path) -> Result<(), String> {
        let guard = self
            .project_paths
            .lock()
            .map_err(|e| format!("项目路径锁中毒: {}", e))?;
        if guard.is_empty() {
            return Err("未注册任何项目，文件操作被拒绝".to_string());
        }
        for root in guard.iter() {
            if canonical.starts_with(root) {
                return Ok(());
            }
        }
        Err("路径不在任何已注册项目内，操作被拒绝".to_string())
    }

    // -------- data dir --------

    /// 获取 Tauri app_data_dir 并确保存在
    fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("获取 app_data_dir 失败: {}", e))?;
        if !dir.exists() {
            fs::create_dir_all(&dir)
                .map_err(|e| format!("创建 app_data_dir 失败: {}", e))?;
        }
        Ok(dir)
    }

    fn recent_file(app: &AppHandle) -> Result<PathBuf, String> {
        Ok(Self::app_data_dir(app)?.join("recent-workspaces.json"))
    }

    // -------- 任意路径 workspace 文件读写 --------

    /// 读取任意路径的 workspace JSON
    pub fn load_file(&self, path: &str) -> Result<Value, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("读取 workspace 文件失败 ({}): {}", path, e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("解析 workspace 文件失败 ({}): {}", path, e))
    }

    /// 原子写：先写 `{path}.tmp` 再 rename
    pub fn save_file(&self, path: &str, workspace: &Value) -> Result<(), String> {
        if let Some(parent) = Path::new(path).parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("创建目录失败 ({}): {}", parent.display(), e))?;
            }
        }
        let tmp_path = format!("{}.tmp", path);
        let content = serde_json::to_string_pretty(workspace)
            .map_err(|e| format!("序列化 workspace 失败: {}", e))?;
        fs::write(&tmp_path, content)
            .map_err(|e| format!("写入临时 workspace 文件失败: {}", e))?;
        fs::rename(&tmp_path, path)
            .map_err(|e| format!("重命名 workspace 文件失败: {}", e))?;
        Ok(())
    }

    /// 初始化一个空 workspace 并落盘
    pub fn create_file(&self, path: &str, name: &str) -> Result<Value, String> {
        let workspace = empty_workspace(name);
        self.save_file(path, &workspace)?;
        Ok(workspace)
    }

    // -------- recent 索引 --------

    /// 读取 recent 索引，文件不存在或损坏都返回 Default
    pub fn load_recent(&self, app: &AppHandle) -> RecentWorkspaces {
        let path = match Self::recent_file(app) {
            Ok(p) => p,
            Err(e) => {
                log::warn!("load_recent: {}", e);
                return RecentWorkspaces::default();
            }
        };
        if !path.exists() {
            return RecentWorkspaces::default();
        }
        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|e| {
                log::warn!("recent-workspaces.json 解析失败: {}", e);
                RecentWorkspaces::default()
            }),
            Err(e) => {
                log::warn!("读取 recent-workspaces.json 失败: {}", e);
                RecentWorkspaces::default()
            }
        }
    }

    /// 原子写 recent 索引
    pub fn save_recent(
        &self,
        app: &AppHandle,
        recent: &RecentWorkspaces,
    ) -> Result<(), String> {
        let path = Self::recent_file(app)?;
        let tmp = path.with_extension("json.tmp");
        let content = serde_json::to_string_pretty(recent)
            .map_err(|e| format!("序列化 recent 失败: {}", e))?;
        fs::write(&tmp, content).map_err(|e| format!("写入 recent.tmp 失败: {}", e))?;
        fs::rename(&tmp, &path).map_err(|e| format!("重命名 recent 失败: {}", e))?;
        Ok(())
    }

    /// 置顶一条记录（去重），更新 last_opened_path + 时间戳
    pub fn push_recent(
        &self,
        app: &AppHandle,
        path: &str,
        name: &str,
    ) -> Result<(), String> {
        let canonical = canonicalize_or_raw(path);
        let mut recent = self.load_recent(app);
        recent.recent.retain(|e| canonicalize_or_raw(&e.path) != canonical);
        let now = now_ms();
        recent.recent.insert(
            0,
            RecentEntry {
                path: canonical.clone(),
                name: name.to_string(),
                last_opened: now,
            },
        );
        // 限制长度到 30
        if recent.recent.len() > 30 {
            recent.recent.truncate(30);
        }
        recent.last_opened_path = Some(canonical);
        self.save_recent(app, &recent)
    }

    /// 从 recent 中移除一条
    pub fn remove_recent(&self, app: &AppHandle, path: &str) -> Result<(), String> {
        let canonical = canonicalize_or_raw(path);
        let mut recent = self.load_recent(app);
        recent.recent.retain(|e| canonicalize_or_raw(&e.path) != canonical);
        if recent
            .last_opened_path
            .as_ref()
            .map(|p| canonicalize_or_raw(p) == canonical)
            .unwrap_or(false)
        {
            recent.last_opened_path = None;
        }
        self.save_recent(app, &recent)
    }

    // -------- 迁移 --------

    /// 首次启动迁移旧 projects.json 到 legacy/default.sgw
    pub fn migrate_legacy_if_needed(&self, app: &AppHandle) -> Result<(), String> {
        let data_dir = Self::app_data_dir(app)?;
        let recent_path = data_dir.join("recent-workspaces.json");
        if recent_path.exists() {
            // 已跑过新版，跳过
            return Ok(());
        }
        let old_projects = data_dir.join("projects.json");
        if !old_projects.exists() {
            return Ok(());
        }

        let raw = match fs::read_to_string(&old_projects) {
            Ok(c) => c,
            Err(e) => {
                log::warn!("读取旧 projects.json 失败: {}", e);
                return Ok(());
            }
        };
        let projects_value: Value = serde_json::from_str(&raw).unwrap_or(Value::Array(vec![]));
        let projects_array = match projects_value {
            Value::Array(arr) => arr,
            _ => vec![],
        };

        let legacy_dir = data_dir.join("legacy");
        if !legacy_dir.exists() {
            fs::create_dir_all(&legacy_dir)
                .map_err(|e| format!("创建 legacy 目录失败: {}", e))?;
        }
        let legacy_file = legacy_dir.join("default.sgw");

        let mut workspace = empty_workspace("Default");
        workspace["projects"] = Value::Array(projects_array);
        let legacy_path_str = legacy_file.to_string_lossy().to_string();
        self.save_file(&legacy_path_str, &workspace)?;

        // 把旧 projects.json 改名为 .bak
        let bak = data_dir.join("projects.json.bak");
        if let Err(e) = fs::rename(&old_projects, &bak) {
            log::warn!("重命名旧 projects.json 失败: {}", e);
        }

        // 写 recent 索引
        let recent = RecentWorkspaces {
            recent: vec![RecentEntry {
                path: legacy_path_str.clone(),
                name: "Default".to_string(),
                last_opened: now_ms(),
            }],
            last_opened_path: Some(legacy_path_str),
        };
        self.save_recent(app, &recent)?;
        log::info!("迁移旧 projects.json 到 legacy/default.sgw 完成");
        Ok(())
    }

    // -------- 启动参数 --------

    /// 遍历 std::env::args() 找 .sgw 路径（跳过 argv[0]）
    pub fn parse_startup_arg() -> Option<String> {
        let mut args = std::env::args();
        args.next(); // skip binary path
        args.find(|a| a.to_lowercase().ends_with(".sgw"))
    }

    // -------- label ↔ path --------

    /// 计算窗口 label：`ws-` + sha1(canonicalized path).hex()[..12]
    pub fn compute_label(&self, path: &str) -> String {
        let canonical = canonicalize_or_raw(path);
        let mut hasher = Sha1::new();
        hasher.update(canonical.as_bytes());
        let digest = hasher.finalize();
        let hex: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
        format!("ws-{}", &hex[..12])
    }

    pub fn bind_window(&self, label: &str, path: &str) {
        if let Ok(mut map) = self.window_map.lock() {
            map.insert(label.to_string(), canonicalize_or_raw(path));
        }
    }

    pub fn unbind_window(&self, label: &str) {
        if let Ok(mut map) = self.window_map.lock() {
            map.remove(label);
        }
    }

    pub fn path_for_label(&self, label: &str) -> Option<String> {
        self.window_map.lock().ok()?.get(label).cloned()
    }

    pub fn label_for_path(&self, path: &str) -> Option<String> {
        let canonical = canonicalize_or_raw(path);
        let map = self.window_map.lock().ok()?;
        for (label, p) in map.iter() {
            if p == &canonical {
                return Some(label.clone());
            }
        }
        None
    }
}

impl Default for WorkspaceManager {
    fn default() -> Self {
        Self::new()
    }
}

// -------- helpers --------

/// 规范化路径；失败时降级用原字符串
pub fn canonicalize_or_raw(path: &str) -> String {
    match fs::canonicalize(path) {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(_) => path.to_string(),
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 构造一个空的 WorkspaceFile JSON
fn empty_workspace(name: &str) -> Value {
    json!({
        "version": 1,
        "name": name,
        "projects": [],
        "canvas": {
            "agents": [],
            "viewport": { "x": 0, "y": 0 },
            "zoom": 1,
            "cardDisplayModes": {},
            "cardZOrder": {}
        },
        "panel": {
            "tabs": [],
            "activeTabId": null,
            "isOpen": false,
            "width": 800
        },
        "ui": {
            "activeProjectId": null,
            "expandedProjectIds": {},
            "viewMode": "files",
            "flatMode": false
        }
    })
}
