//! Git 相关 Tauri 命令
//! 通过 shell out 到系统 git 命令实现（参考 VSCode）

use crate::services::git_service::GitService;
use crate::types::models::{
    GitBranch, GitCommitDetail, GitFileChange, GitLogEntry, GitStatusSummary,
};

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
/// - `limit` 为 None 或 0 时返回全部 commits
#[tauri::command]
pub async fn git_log(repo_path: String, limit: Option<u32>) -> Result<Vec<GitLogEntry>, String> {
    log::info!("获取 Git 日志: {} (limit={:?})", repo_path, limit);
    GitService::log(&repo_path, limit)
}

/// 检查给定路径列表中哪些被 gitignore 规则直接匹配
#[tauri::command]
pub async fn git_check_ignored(
    repo_path: String,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    GitService::check_ignored(&repo_path, paths)
}

/// 获取 commit 范围 diff
#[tauri::command]
pub async fn git_diff_range(
    repo_path: String,
    from: String,
    to: String,
    file_path: Option<String>,
) -> Result<String, String> {
    log::info!("获取范围 Diff: {} {}~..{}", repo_path, from, to);
    GitService::diff_range(&repo_path, &from, &to, file_path.as_deref())
}

/// 获取 commit range 涉及的文件列表（单 commit 时 from=to=hash）
#[tauri::command]
pub async fn git_commit_files(
    repo_path: String,
    from: String,
    to: String,
) -> Result<Vec<GitFileChange>, String> {
    log::info!("获取 commit 文件列表: {} ({}..{})", repo_path, from, to);
    GitService::commit_files_range(&repo_path, &from, &to)
}

/// 获取单个 commit 的完整详情（hover tooltip 用）
#[tauri::command]
pub async fn git_commit_detail(
    repo_path: String,
    hash: String,
) -> Result<GitCommitDetail, String> {
    GitService::commit_detail(&repo_path, &hash)
}

/// 创建 commit — 若无 staged 改动会自动 `git add -A`
#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<(), String> {
    log::info!("Git commit: {} ({} chars)", repo_path, message.len());
    GitService::commit(&repo_path, &message)
}

/// Push 当前分支到远端（无 upstream 时自动 `-u origin <branch>`）
#[tauri::command]
pub async fn git_push(repo_path: String) -> Result<(), String> {
    log::info!("Git push: {}", repo_path);
    GitService::push(&repo_path)
}

/// Pull 当前分支（--ff-only）
#[tauri::command]
pub async fn git_pull(repo_path: String) -> Result<(), String> {
    log::info!("Git pull: {}", repo_path);
    GitService::pull(&repo_path)
}

/// Fetch 所有远端 + prune
#[tauri::command]
pub async fn git_fetch(repo_path: String) -> Result<(), String> {
    log::info!("Git fetch: {}", repo_path);
    GitService::fetch(&repo_path)
}

/// 切换到指定分支
#[tauri::command]
pub async fn git_checkout(repo_path: String, branch: String) -> Result<(), String> {
    log::info!("Git checkout: {} → {}", repo_path, branch);
    GitService::checkout(&repo_path, &branch)
}
