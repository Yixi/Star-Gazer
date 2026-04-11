//! Star Gazer - Mac 原生轻量开发工作台
//! 为 vibe coding 时代的多 AI agent 并行工作流设计

pub mod commands;
pub mod services;
pub mod types;

use commands::{fs, git, project, terminal};
use services::file_watcher::FileWatcherManager;
use services::pty_manager::PtyManager;
use tauri::{AppHandle, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(PtyManager::new())
        .manage(FileWatcherManager::new())
        .invoke_handler(tauri::generate_handler![
            // 终端命令
            terminal::create_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::close_terminal,
            // Git 命令
            git::git_status,
            git::git_diff,
            git::git_branches,
            git::git_log,
            // 文件系统命令
            fs::read_file,
            fs::write_file,
            fs::list_dir,
            fs::create_dir,
            fs::remove_entry,
            fs::rename_entry,
            fs::path_exists,
            fs::watch_dir,
            fs::unwatch_dir,
            // 项目管理命令
            project::list_projects,
            project::add_project,
            project::remove_project,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // 应用窗口销毁时清理所有 PTY 进程和文件监听
                let app: &AppHandle = window.app_handle();
                if let Some(pty_manager) = app.try_state::<PtyManager>() {
                    pty_manager.close_all();
                }
                if let Some(watcher) = app.try_state::<FileWatcherManager>() {
                    watcher.unwatch_all();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("启动 Star Gazer 失败");
}
