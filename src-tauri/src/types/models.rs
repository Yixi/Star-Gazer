//! Star Gazer 数据模型定义

use serde::{Deserialize, Serialize};

/// 项目信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub last_opened: u64,
}

/// 目录条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

/// Git 文件变更
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    pub path: String,
    pub status: String,
    /// 新增行数
    pub additions: u32,
    /// 删除行数
    pub deletions: u32,
}

/// Git 状态摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusSummary {
    pub branch: String,
    pub ahead: i32,
    pub behind: i32,
    pub staged: Vec<GitFileChange>,
    pub unstaged: Vec<GitFileChange>,
    pub untracked: Vec<String>,
}

/// Git 分支信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub is_head: bool,
    pub upstream: Option<String>,
}

/// 单个 commit 的详细信息（hover tooltip 用）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDetail {
    pub hash: String,
    pub short_hash: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: u64,
    /// commit 标题（第一行）
    pub subject: String,
    /// commit 正文（第一行之后的部分，可能为空）
    pub body: String,
    /// 变更文件总数
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

/// Git 日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: u64,
    pub message: String,
    /// 父 commit hash 列表（merge 有多个父）
    #[serde(default)]
    pub parents: Vec<String>,
    /// 分支/tag 引用装饰（如 ["HEAD -> main", "origin/main", "tag: v1.0"]）
    #[serde(default)]
    pub refs: Vec<String>,
}

/// 文件变更事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: String,
}

/// 窗口状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub is_maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 1440,
            height: 900,
            x: 0,
            y: 0,
            is_maximized: false,
        }
    }
}

/// 面板状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelState {
    /// 面板 ID
    pub id: String,
    /// 是否可见
    pub visible: bool,
    /// 面板宽度或高度（像素）
    pub size: Option<u32>,
}

/// Tab 状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabState {
    /// Tab ID
    pub id: String,
    /// Tab 类型（terminal、editor 等）
    pub tab_type: String,
    /// Tab 标题
    pub title: String,
    /// 关联数据（如终端命令、文件路径等）
    pub data: Option<serde_json::Value>,
}

/// 会话状态 - 记录应用上次关闭时的状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    /// 窗口状态
    pub window: WindowState,
    /// 当前打开的项目路径
    pub active_project: Option<String>,
    /// 面板状态列表
    pub panels: Vec<PanelState>,
    /// Tab 状态列表
    pub tabs: Vec<TabState>,
    /// 活跃 Tab 的 ID
    pub active_tab: Option<String>,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            window: WindowState::default(),
            active_project: None,
            panels: vec![],
            tabs: vec![],
            active_tab: None,
        }
    }
}

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// 主题（light/dark/system）
    pub theme: String,
    /// 字体大小
    pub font_size: u32,
    /// 字体族
    pub font_family: String,
    /// 默认 shell
    pub default_shell: Option<String>,
    /// 终端默认工作目录
    pub default_cwd: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_size: 14,
            font_family: "Menlo".to_string(),
            default_shell: None,
            default_cwd: None,
        }
    }
}
