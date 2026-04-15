//! 文件系统相关 Tauri 命令
//!
//! 安全模型：所有路径必须位于至少一个已注册项目的根目录内，
//! 通过 canonicalize 解析 symlink/`..` 后再做 starts_with 校验，
//! 防止恶意前端构造 `../../etc/passwd` 之类的路径穿越。
//! 项目路径由前端通过 `sync_workspace_project_paths` 注入到 WorkspaceManager。

use crate::services::file_watcher::FileWatcherManager;
use crate::services::workspace_manager::WorkspaceManager;
use crate::types::models::DirEntry;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

/// 必须-已存在：canonicalize 目标路径，校验位于某个已注册项目内
fn resolve_existing(ws: &WorkspaceManager, path: &str) -> Result<PathBuf, String> {
    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|_| format!("路径无法解析或不存在: {}", safe_err_path(path)))?;
    ws.ensure_path_in_projects(&canonical)?;
    Ok(canonical)
}

/// 可能-新文件：对父目录 canonicalize，校验位于某个已注册项目内
fn resolve_new(ws: &WorkspaceManager, path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    let parent = p.parent().ok_or_else(|| "无效路径（无父目录）".to_string())?;
    let file_name = p
        .file_name()
        .ok_or_else(|| "无效路径（无文件名）".to_string())?;
    let parent_canonical = parent
        .canonicalize()
        .map_err(|_| "父目录无法解析或不存在".to_string())?;
    let full = parent_canonical.join(file_name);
    ws.ensure_path_in_projects(&full)?;
    Ok(full)
}

/// 错误日志里避免暴露绝对路径的完整内容（留下最后两段即可）
fn safe_err_path(path: &str) -> String {
    let parts: Vec<&str> = path.rsplitn(3, '/').collect();
    match parts.as_slice() {
        [name, parent, ..] => format!(".../{}/{}", parent, name),
        [name] => (*name).to_string(),
        _ => "<path>".to_string(),
    }
}

/// 读取文件内容
#[tauri::command]
pub async fn read_file(
    workspace_manager: State<'_, WorkspaceManager>,
    path: String,
) -> Result<String, String> {
    let canonical = resolve_existing(&workspace_manager, &path)?;
    tokio::fs::read_to_string(&canonical)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))
}

/// 写入文件内容
#[tauri::command]
pub async fn write_file(
    workspace_manager: State<'_, WorkspaceManager>,
    path: String,
    content: String,
) -> Result<(), String> {
    let canonical = resolve_new(&workspace_manager, &path)?;
    tokio::fs::write(&canonical, content)
        .await
        .map_err(|e| format!("写入文件失败: {}", e))
}

/// 列出目录内容
#[tauri::command]
pub async fn list_dir(
    workspace_manager: State<'_, WorkspaceManager>,
    path: String,
) -> Result<Vec<DirEntry>, String> {
    let canonical = resolve_existing(&workspace_manager, &path)?;
    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(&canonical)
        .await
        .map_err(|e| format!("读取目录失败: {}", e))?;

    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();

        // 只跳过 .git 目录（内部 git 存储，不适合浏览）
        if name == ".git" {
            continue;
        }

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified,
        });
    }

    // 目录在前，文件在后，按名称排序
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });

    Ok(entries)
}

/// 创建目录
#[tauri::command]
pub async fn create_dir(
    workspace_manager: State<'_, WorkspaceManager>,
    path: String,
) -> Result<(), String> {
    let canonical = resolve_new(&workspace_manager, &path)?;
    tokio::fs::create_dir_all(&canonical)
        .await
        .map_err(|e| format!("创建目录失败: {}", e))
}

/// 删除文件或目录
#[tauri::command]
pub async fn remove_entry(
    workspace_manager: State<'_, WorkspaceManager>,
    path: String,
) -> Result<(), String> {
    let canonical = resolve_existing(&workspace_manager, &path)?;
    if canonical.is_dir() {
        tokio::fs::remove_dir_all(&canonical)
            .await
            .map_err(|e| format!("删除目录失败: {}", e))
    } else {
        tokio::fs::remove_file(&canonical)
            .await
            .map_err(|e| format!("删除文件失败: {}", e))
    }
}

/// 重命名文件或目录
#[tauri::command]
pub async fn rename_entry(
    workspace_manager: State<'_, WorkspaceManager>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let old_canonical = resolve_existing(&workspace_manager, &old_path)?;
    let new_canonical = resolve_new(&workspace_manager, &new_path)?;
    tokio::fs::rename(&old_canonical, &new_canonical)
        .await
        .map_err(|e| format!("重命名失败: {}", e))
}

/// 检查路径是否存在
#[tauri::command]
pub async fn path_exists(
    workspace_manager: State<'_, WorkspaceManager>,
    path: String,
) -> Result<bool, String> {
    // 不存在的路径直接返回 false（不抛错），存在的路径必须在项目内
    match Path::new(&path).canonicalize() {
        Ok(canonical) => {
            workspace_manager.ensure_path_in_projects(&canonical)?;
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

/// 开始监听目录文件变更
#[tauri::command]
pub async fn watch_dir(
    app: AppHandle,
    workspace_manager: State<'_, WorkspaceManager>,
    watcher: State<'_, FileWatcherManager>,
    path: String,
) -> Result<(), String> {
    let canonical = resolve_existing(&workspace_manager, &path)?;
    log::info!("开始监听目录: {:?}", canonical.file_name());
    watcher.watch(app, &canonical.to_string_lossy())
}

/// 停止监听目录文件变更
#[tauri::command]
pub async fn unwatch_dir(
    watcher: State<'_, FileWatcherManager>,
    path: String,
) -> Result<(), String> {
    // unwatch 允许原路径（不要求 canonicalize），因为 watch 时记录的 key 是传入字符串
    // 实际上 watch 传入的 path 会被 canonicalize 后写入管理器
    let canonical = Path::new(&path)
        .canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(path.clone());
    log::info!("停止监听目录");
    watcher.unwatch(&canonical)
}

// ========================================
// 智能目录扫描 - 判断用户选择的目录是单 git 项目还是多项目父目录
// ========================================

/// 被 scan_git_repos 扫到的子目录条目
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoEntry {
    pub name: String,
    pub path: String,
}

/// 扫描结果：三态枚举
///
/// **注意**：`#[serde(rename_all = "camelCase")]` 挂在 enum 上只重命名变体名
/// （Single/Group/Empty → single/group/empty），不会自动应用到变体内部的
/// struct 字段。所以每个 struct 变体必须自己再挂一次 rename_all，否则
/// `parent_path` 会被序列化成 snake_case 发给前端，前端读 `scan.parentPath`
/// 就是 undefined，最终写进 workspace 文件的是一个只有 id 的坏 group。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ScanResult {
    /// 给定目录本身就是一个 git 仓库
    #[serde(rename_all = "camelCase")]
    Single { path: String, name: String },
    /// 给定目录不是 git 仓库，但其直接子目录里有若干 git 仓库
    #[serde(rename_all = "camelCase")]
    Group {
        parent_path: String,
        parent_name: String,
        members: Vec<GitRepoEntry>,
    },
    /// 既不是 git 仓库，子目录里也没有 git 仓库
    Empty,
}

/// 子目录扫描时跳过的噪声目录名
const SCAN_BLACKLIST: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "venv",
    ".venv",
    "__pycache__",
];

/// 扫描给定路径，判断它是单个 git 仓库还是一个装有若干 git 仓库的父目录
///
/// **不走路径沙箱** —— 这个命令只读目录项和 `.git` 是否存在，无副作用，
/// 且被调用时目标路径通常还没被加进 workspace 的允许列表里。
#[tauri::command]
pub async fn scan_git_repos(path: String) -> Result<ScanResult, String> {
    let canonical = match Path::new(&path).canonicalize() {
        Ok(p) => p,
        Err(_) => return Ok(ScanResult::Empty),
    };
    if !canonical.is_dir() {
        return Ok(ScanResult::Empty);
    }

    // 1) 给定目录本身是 git 仓库 → Single
    if canonical.join(".git").exists() {
        let name = canonical
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "project".to_string());
        return Ok(ScanResult::Single {
            path: canonical.to_string_lossy().to_string(),
            name,
        });
    }

    // 2) 否则只扫一层子目录
    let mut members: Vec<GitRepoEntry> = Vec::new();
    let mut dir = tokio::fs::read_dir(&canonical)
        .await
        .map_err(|e| format!("读取目录失败: {}", e))?;
    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        if name.starts_with('.') {
            continue; // 隐藏目录 / . / ..
        }
        if SCAN_BLACKLIST.iter().any(|b| *b == name) {
            continue;
        }
        let metadata = match entry.metadata().await {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !metadata.is_dir() {
            continue;
        }
        let child_path = entry.path();
        if !child_path.join(".git").exists() {
            continue;
        }
        members.push(GitRepoEntry {
            name,
            path: child_path.to_string_lossy().to_string(),
        });
    }

    if members.is_empty() {
        return Ok(ScanResult::Empty);
    }

    members.sort_by(|a, b| a.name.cmp(&b.name));
    let parent_name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "workspace".to_string());
    Ok(ScanResult::Group {
        parent_path: canonical.to_string_lossy().to_string(),
        parent_name,
        members,
    })
}
