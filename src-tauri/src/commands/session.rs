//! 会话与配置相关 Tauri 命令

use crate::services::session_manager::SessionManager;
use crate::types::models::{AppConfig, Session};
use tauri::State;

/// 获取会话状态
#[tauri::command]
pub async fn get_session(
    session_manager: State<'_, SessionManager>,
) -> Result<Session, String> {
    session_manager.get_session()
}

/// 保存会话状态
#[tauri::command]
pub async fn save_session(
    session_manager: State<'_, SessionManager>,
    session: Session,
) -> Result<(), String> {
    log::info!("保存会话状态");
    session_manager.save_session(session)
}

/// 获取应用配置
#[tauri::command]
pub async fn get_config(
    session_manager: State<'_, SessionManager>,
) -> Result<AppConfig, String> {
    session_manager.get_config()
}

/// 保存应用配置
#[tauri::command]
pub async fn save_config(
    session_manager: State<'_, SessionManager>,
    config: AppConfig,
) -> Result<(), String> {
    log::info!("保存应用配置 (theme={})", config.theme);
    session_manager.save_config(config)
}
