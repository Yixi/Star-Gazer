//! Git 相关 Tauri 命令
//! 通过 shell out 到系统 git 命令实现（参考 VSCode）

use crate::types::models::{GitBranch, GitStatusSummary};

/// 获取 Git 仓库状态
#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatusSummary, String> {
    // TODO: 执行 `git status --porcelain=v2 --branch` 并解析输出
    log::info!("获取 Git 状态: {}", repo_path);
    Ok(GitStatusSummary {
        branch: "main".to_string(),
        ahead: 0,
        behind: 0,
        staged: vec![],
        unstaged: vec![],
        untracked: vec![],
    })
}

/// 获取文件 Diff
#[tauri::command]
pub async fn git_diff(repo_path: String, file_path: String) -> Result<String, String> {
    // TODO: 执行 `git diff -- <file>` 并返回 unified diff
    log::info!("获取 Git Diff: {} - {}", repo_path, file_path);
    Ok(String::new())
}

/// 获取分支列表
#[tauri::command]
pub async fn git_branches(repo_path: String) -> Result<Vec<GitBranch>, String> {
    // TODO: 执行 `git branch -a --format` 并解析输出
    log::info!("获取 Git 分支: {}", repo_path);
    Ok(vec![GitBranch {
        name: "main".to_string(),
        is_head: true,
        upstream: None,
    }])
}

/// 获取 Git 日志
#[tauri::command]
pub async fn git_log(repo_path: String, limit: u32) -> Result<String, String> {
    // TODO: 执行 `git log --oneline -n <limit>` 并返回
    log::info!("获取 Git 日志: {} (limit={})", repo_path, limit);
    Ok(String::new())
}
