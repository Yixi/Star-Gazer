//! 终端相关 Tauri 命令
//! 管理 PTY 进程的创建、输入输出、调整大小和关闭

use tauri::AppHandle;

/// 创建新的终端 PTY 进程
#[tauri::command]
pub async fn create_terminal(
    app: AppHandle,
    id: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    // TODO: 使用 portable-pty 创建 PTY
    // 1. 创建 PtyPair (master + slave)
    // 2. 在 slave 上启动 shell 进程 (zsh/bash)
    // 3. 启动异步任务读取 master 输出，通过 Tauri event 发送到前端
    // 4. 将 master 存储到 PtyManager 中
    log::info!("创建终端: id={}, cwd={}, cols={}, rows={}", id, cwd, cols, rows);
    let _ = app;
    Ok(0) // 返回 PID
}

/// 向终端写入数据（用户输入）
#[tauri::command]
pub async fn write_terminal(id: String, data: String) -> Result<(), String> {
    // TODO: 通过 PtyManager 获取 master writer，写入数据
    log::debug!("写入终端: id={}, len={}", id, data.len());
    Ok(())
}

/// 调整终端尺寸
#[tauri::command]
pub async fn resize_terminal(id: String, cols: u16, rows: u16) -> Result<(), String> {
    // TODO: 通过 PtyManager 调整 PTY 尺寸
    log::debug!("调整终端尺寸: id={}, cols={}, rows={}", id, cols, rows);
    Ok(())
}

/// 关闭终端
#[tauri::command]
pub async fn close_terminal(id: String) -> Result<(), String> {
    // TODO: 通过 PtyManager 关闭 PTY 进程
    log::info!("关闭终端: id={}", id);
    Ok(())
}
