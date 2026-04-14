//! Workspace 文件相关类型

use serde::{Deserialize, Serialize};

/// 最近打开的 workspace 文件索引
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspaces {
    #[serde(default)]
    pub recent: Vec<RecentEntry>,
    #[serde(default)]
    pub last_opened_path: Option<String>,
}

/// 单条 recent 记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    /// 毫秒时间戳
    pub last_opened: u64,
}
