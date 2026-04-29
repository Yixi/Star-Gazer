//! Star Gazer - Mac 原生轻量开发工作台
//! 为 vibe coding 时代的多 AI agent 并行工作流设计

pub mod commands;
pub mod services;
pub mod types;

use commands::{fs, git, session, terminal, workspace};
use services::file_watcher::FileWatcherManager;
use services::pty_manager::PtyManager;
use services::session_manager::SessionManager;
use services::workspace_manager::{StartupPathCache, WorkspaceManager};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    env_logger::init();

    // 启动前解析 CLI 参数，提取 .sgw 路径
    let startup_path = WorkspaceManager::parse_startup_arg();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(PtyManager::new())
        .manage(FileWatcherManager::new())
        .manage(SessionManager::new())
        .manage(WorkspaceManager::new())
        .manage(StartupPathCache::new(startup_path))
        .setup(|app| {
            // 首次启动迁移旧 projects.json → legacy/default.sgw
            let handle = app.handle().clone();
            let ws = handle.state::<WorkspaceManager>();
            if let Err(e) = ws.migrate_legacy_if_needed(&handle) {
                log::error!("迁移旧 projects.json 失败: {}", e);
            }
            Ok(())
        })
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
            git::git_check_ignored,
            git::git_diff_range,
            git::git_commit_files,
            git::git_commit_detail,
            git::git_commit,
            git::git_push,
            git::git_pull,
            git::git_fetch,
            // 文件系统命令
            fs::read_file,
            fs::write_file,
            fs::list_dir,
            fs::create_dir,
            fs::create_file,
            fs::copy_entry,
            fs::trash_entry,
            fs::remove_entry,
            fs::rename_entry,
            fs::path_exists,
            fs::watch_dir,
            fs::unwatch_dir,
            fs::scan_git_repos,
            // Workspace 命令
            workspace::load_workspace_file,
            workspace::save_workspace_file,
            workspace::create_workspace_file,
            workspace::list_recent_workspaces,
            workspace::remove_recent_workspace,
            workspace::get_startup_workspace_path,
            workspace::get_window_workspace_path,
            workspace::open_workspace_in_window,
            workspace::sync_workspace_project_paths,
            // 会话与配置命令
            session::get_session,
            session::save_session,
            session::get_config,
            session::save_config,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // 只清理这个 window label 对应的 PTY + workspace 绑定，
                // 避免多窗口下误杀其他窗口的 PTY。
                let label = window.label().to_string();
                let app = window.app_handle();
                if let Some(pty_manager) = app.try_state::<PtyManager>() {
                    pty_manager.close_by_window(&label);
                }
                if let Some(ws) = app.try_state::<WorkspaceManager>() {
                    ws.unbind_window(&label);
                }
                // file watcher 目前是全局的，暂时保留 unwatch_all（TODO: Phase 3 按窗口精细化）
                if let Some(watcher) = app.try_state::<FileWatcherManager>() {
                    watcher.unwatch_all();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("启动 Star Gazer 失败");

    app.run(|handle, event| {
        if let tauri::RunEvent::Opened { urls } = event {
            // macOS 双击 .sgw 或 `open -a` 触发
            for url in urls {
                let path = url
                    .to_file_path()
                    .map(|p| p.to_string_lossy().to_string())
                    .ok();
                let Some(p) = path else {
                    log::warn!("RunEvent::Opened: 非文件 URL，忽略: {}", url);
                    continue;
                };
                log::info!("RunEvent::Opened: {}", p);

                // 首次启动：主窗口还没消费 startup cache，直接写入，让前端主动查询
                if let Some(cache) = handle.try_state::<StartupPathCache>() {
                    if cache.set_if_empty(p.clone()) {
                        continue;
                    }
                }

                // 否则主动开/聚焦目标窗口
                let handle_clone = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle_clone.state::<WorkspaceManager>();
                    if let Err(e) = commands::workspace::open_workspace_in_window(
                        handle_clone.clone(),
                        state,
                        p,
                    )
                    .await
                    {
                        log::error!("RunEvent::Opened 打开 workspace 失败: {}", e);
                    }
                });
            }
        }
    });
}
