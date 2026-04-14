//! 终端相关 Tauri 命令
//! 管理 PTY 进程的创建、输入输出、调整大小和关闭

use crate::services::pty_manager::PtyManager;
use tauri::{AppHandle, State, WebviewWindow};

/// 创建新的终端 PTY 进程
#[tauri::command]
pub async fn create_terminal(
    app: AppHandle,
    window: WebviewWindow,
    pty_manager: State<'_, PtyManager>,
    id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    command: Option<String>,
) -> Result<u32, String> {
    let label = window.label().to_string();
    log::info!(
        "创建终端: id={}, cwd={}, cols={}, rows={}, command={:?}, window={}",
        id,
        cwd,
        cols,
        rows,
        command,
        label
    );
    pty_manager.create(app, &id, &cwd, cols, rows, command, label)
}

/// 向终端写入数据（用户输入）
#[tauri::command]
pub async fn write_terminal(
    pty_manager: State<'_, PtyManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    log::debug!("写入终端: id={}, len={}", id, data.len());
    pty_manager.write(&id, data.as_bytes())
}

/// 调整终端尺寸
#[tauri::command]
pub async fn resize_terminal(
    pty_manager: State<'_, PtyManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    log::debug!("调整终端尺寸: id={}, cols={}, rows={}", id, cols, rows);
    pty_manager.resize(&id, cols, rows)
}

/// 关闭终端
#[tauri::command]
pub async fn close_terminal(
    pty_manager: State<'_, PtyManager>,
    id: String,
) -> Result<(), String> {
    log::info!("关闭终端: id={}", id);
    pty_manager.close(&id)
}
