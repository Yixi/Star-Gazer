//! 项目管理相关 Tauri 命令

use crate::types::models::Project;

/// 获取项目列表
#[tauri::command]
pub async fn list_projects() -> Result<Vec<Project>, String> {
    // TODO: 从本地存储中读取项目列表
    Ok(vec![])
}

/// 添加项目
#[tauri::command]
pub async fn add_project(path: String) -> Result<Project, String> {
    // TODO: 验证路径有效性，保存到本地存储
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "未命名项目".to_string());

    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path,
        last_opened: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    };

    Ok(project)
}

/// 移除项目（不删除文件）
#[tauri::command]
pub async fn remove_project(id: String) -> Result<(), String> {
    // TODO: 从本地存储中移除项目
    log::info!("移除项目: {}", id);
    Ok(())
}
