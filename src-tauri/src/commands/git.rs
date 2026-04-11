//! Git 相关 Tauri 命令
//! 通过 shell out 到系统 git 命令实现（参考 VSCode）

use crate::services::git_service::GitService;
use crate::types::models::{GitBranch, GitLogEntry, GitStatusSummary};

/// 获取 Git 仓库状态
#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatusSummary, String> {
    log::info!("获取 Git 状态: {}", repo_path);
    GitService::status(&repo_path)
}

/// 获取文件 Diff
#[tauri::command]
pub async fn git_diff(repo_path: String, file_path: Option<String>) -> Result<String, String> {
    log::info!("获取 Git Diff: {} - {:?}", repo_path, file_path);
    GitService::diff(&repo_path, file_path.as_deref())
}

/// 获取分支列表
#[tauri::command]
pub async fn git_branches(repo_path: String) -> Result<Vec<GitBranch>, String> {
    log::info!("获取 Git 分支: {}", repo_path);
    GitService::branches(&repo_path)
}

/// 获取 Git 日志
#[tauri::command]
pub async fn git_log(repo_path: String, limit: Option<u32>) -> Result<Vec<GitLogEntry>, String> {
    let limit = limit.unwrap_or(50);
    log::info!("获取 Git 日志: {} (limit={})", repo_path, limit);
    GitService::log(&repo_path, limit)
}
