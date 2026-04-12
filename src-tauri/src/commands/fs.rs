//! 文件系统相关 Tauri 命令
//!
//! 安全模型：所有路径必须位于至少一个已注册项目的根目录内，
//! 通过 canonicalize 解析 symlink/`..` 后再做 starts_with 校验，
//! 防止恶意前端构造 `../../etc/passwd` 之类的路径穿越。

use crate::services::file_watcher::FileWatcherManager;
use crate::services::project_manager::ProjectManager;
use crate::types::models::DirEntry;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

/// 必须-已存在：canonicalize 目标路径，校验位于某个已注册项目内
fn resolve_existing(pm: &ProjectManager, path: &str) -> Result<PathBuf, String> {
    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|_| format!("路径无法解析或不存在: {}", safe_err_path(path)))?;
    ensure_in_projects(pm, &canonical)?;
    Ok(canonical)
}

/// 可能-新文件：对父目录 canonicalize，校验位于某个已注册项目内
fn resolve_new(pm: &ProjectManager, path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    let parent = p.parent().ok_or_else(|| "无效路径（无父目录）".to_string())?;
    let file_name = p
        .file_name()
        .ok_or_else(|| "无效路径（无文件名）".to_string())?;
    let parent_canonical = parent
        .canonicalize()
        .map_err(|_| "父目录无法解析或不存在".to_string())?;
    let full = parent_canonical.join(file_name);
    ensure_in_projects(pm, &full)?;
    Ok(full)
}

/// 校验 canonical 路径位于某个已注册项目内
fn ensure_in_projects(pm: &ProjectManager, canonical: &Path) -> Result<(), String> {
    let projects = pm.list()?;
    if projects.is_empty() {
        return Err("未注册任何项目，文件操作被拒绝".to_string());
    }
    for project in &projects {
        if let Ok(project_canonical) = Path::new(&project.path).canonicalize() {
            if canonical.starts_with(&project_canonical) {
                return Ok(());
            }
        }
    }
    Err("路径不在任何已注册项目内，操作被拒绝".to_string())
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
    project_manager: State<'_, ProjectManager>,
    path: String,
) -> Result<String, String> {
    let canonical = resolve_existing(&project_manager, &path)?;
    tokio::fs::read_to_string(&canonical)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))
}

/// 写入文件内容
#[tauri::command]
pub async fn write_file(
    project_manager: State<'_, ProjectManager>,
    path: String,
    content: String,
) -> Result<(), String> {
    let canonical = resolve_new(&project_manager, &path)?;
    tokio::fs::write(&canonical, content)
        .await
        .map_err(|e| format!("写入文件失败: {}", e))
}

/// 列出目录内容
#[tauri::command]
pub async fn list_dir(
    project_manager: State<'_, ProjectManager>,
    path: String,
) -> Result<Vec<DirEntry>, String> {
    let canonical = resolve_existing(&project_manager, &path)?;
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
    project_manager: State<'_, ProjectManager>,
    path: String,
) -> Result<(), String> {
    let canonical = resolve_new(&project_manager, &path)?;
    tokio::fs::create_dir_all(&canonical)
        .await
        .map_err(|e| format!("创建目录失败: {}", e))
}

/// 删除文件或目录
#[tauri::command]
pub async fn remove_entry(
    project_manager: State<'_, ProjectManager>,
    path: String,
) -> Result<(), String> {
    let canonical = resolve_existing(&project_manager, &path)?;
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
    project_manager: State<'_, ProjectManager>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let old_canonical = resolve_existing(&project_manager, &old_path)?;
    let new_canonical = resolve_new(&project_manager, &new_path)?;
    tokio::fs::rename(&old_canonical, &new_canonical)
        .await
        .map_err(|e| format!("重命名失败: {}", e))
}

/// 检查路径是否存在
#[tauri::command]
pub async fn path_exists(
    project_manager: State<'_, ProjectManager>,
    path: String,
) -> Result<bool, String> {
    // 不存在的路径直接返回 false（不抛错），存在的路径必须在项目内
    match Path::new(&path).canonicalize() {
        Ok(canonical) => {
            ensure_in_projects(&project_manager, &canonical)?;
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

/// 开始监听目录文件变更
#[tauri::command]
pub async fn watch_dir(
    app: AppHandle,
    project_manager: State<'_, ProjectManager>,
    watcher: State<'_, FileWatcherManager>,
    path: String,
) -> Result<(), String> {
    let canonical = resolve_existing(&project_manager, &path)?;
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
