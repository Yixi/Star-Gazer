//! Star Gazer - Mac 原生轻量开发工作台
//! 为 vibe coding 时代的多 AI agent 并行工作流设计

pub mod commands;
pub mod services;
pub mod types;

use commands::{fs, git, project, terminal};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            // 项目管理命令
            project::list_projects,
            project::add_project,
            project::remove_project,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Star Gazer 失败");
}
