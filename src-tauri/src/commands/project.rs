//! 项目管理相关 Tauri 命令

use crate::services::project_manager::ProjectManager;
use crate::types::models::Project;
use tauri::State;

/// 获取项目列表
#[tauri::command]
pub async fn list_projects(
    project_manager: State<'_, ProjectManager>,
) -> Result<Vec<Project>, String> {
    project_manager.list()
}

/// 添加项目
#[tauri::command]
pub async fn add_project(
    project_manager: State<'_, ProjectManager>,
    path: String,
) -> Result<Project, String> {
    // 验证路径存在
    if !std::path::Path::new(&path).exists() {
        return Err(format!("路径不存在: {}", path));
    }

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

    project_manager.add(project.clone())?;
    log::info!("添加项目: {} ({})", project.name, project.path);
    Ok(project)
}

/// 移除项目（不删除文件）
#[tauri::command]
pub async fn remove_project(
    project_manager: State<'_, ProjectManager>,
    id: String,
) -> Result<(), String> {
    log::info!("移除项目: {}", id);
    project_manager.remove(&id)
}
