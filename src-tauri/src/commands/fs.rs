//! 文件系统相关 Tauri 命令

use crate::services::file_watcher::FileWatcherManager;
use crate::types::models::DirEntry;
use std::path::Path;
use tauri::{AppHandle, State};

/// 读取文件内容
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("读取文件失败: {}", e))
}

/// 写入文件内容
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| format!("写入文件失败: {}", e))
}

/// 列出目录内容
#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| format!("读取目录失败: {}", e))?;

    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();

        // 跳过隐藏文件（以 . 开头）
        if name.starts_with('.') {
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
pub async fn create_dir(path: String) -> Result<(), String> {
    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| format!("创建目录失败: {}", e))
}

/// 删除文件或目录
#[tauri::command]
pub async fn remove_entry(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        tokio::fs::remove_dir_all(&path)
            .await
            .map_err(|e| format!("删除目录失败: {}", e))
    } else {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| format!("删除文件失败: {}", e))
    }
}

/// 重命名文件或目录
#[tauri::command]
pub async fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    tokio::fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| format!("重命名失败: {}", e))
}

/// 检查路径是否存在
#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// 开始监听目录文件变更
#[tauri::command]
pub async fn watch_dir(
    app: AppHandle,
    watcher: State<'_, FileWatcherManager>,
    path: String,
) -> Result<(), String> {
    log::info!("开始监听目录: {}", path);
    watcher.watch(app, &path)
}

/// 停止监听目录文件变更
#[tauri::command]
pub async fn unwatch_dir(
    watcher: State<'_, FileWatcherManager>,
    path: String,
) -> Result<(), String> {
    log::info!("停止监听目录: {}", path);
    watcher.unwatch(&path)
}
