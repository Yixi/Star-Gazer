//! Workspace 相关 Tauri 命令

use crate::services::workspace_manager::{
    canonicalize_or_raw, StartupPathCache, WorkspaceManager,
};
use crate::types::workspace::RecentWorkspaces;
use base64::Engine;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

/// 读取任意路径的 workspace 文件
#[tauri::command]
pub async fn load_workspace_file(
    state: State<'_, WorkspaceManager>,
    path: String,
) -> Result<Value, String> {
    state.load_file(&path)
}

/// 保存 workspace 文件（原子写），写完后更新 recent 索引
#[tauri::command]
pub async fn save_workspace_file(
    app: AppHandle,
    state: State<'_, WorkspaceManager>,
    path: String,
    workspace: Value,
) -> Result<(), String> {
    state.save_file(&path, &workspace)?;
    let name = workspace
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Workspace")
        .to_string();
    if let Err(e) = state.push_recent(&app, &path, &name) {
        log::warn!("save_workspace_file: push_recent 失败: {}", e);
    }
    Ok(())
}

/// 创建一个空 workspace 文件并落盘
#[tauri::command]
pub async fn create_workspace_file(
    app: AppHandle,
    state: State<'_, WorkspaceManager>,
    path: String,
    name: String,
) -> Result<Value, String> {
    let workspace = state.create_file(&path, &name)?;
    if let Err(e) = state.push_recent(&app, &path, &name) {
        log::warn!("create_workspace_file: push_recent 失败: {}", e);
    }
    Ok(workspace)
}

/// 列出最近打开的 workspace
#[tauri::command]
pub async fn list_recent_workspaces(
    app: AppHandle,
    state: State<'_, WorkspaceManager>,
) -> Result<RecentWorkspaces, String> {
    Ok(state.load_recent(&app))
}

/// 从 recent 索引中移除一项
#[tauri::command]
pub async fn remove_recent_workspace(
    app: AppHandle,
    state: State<'_, WorkspaceManager>,
    path: String,
) -> Result<(), String> {
    state.remove_recent(&app, &path)
}

/// 读取启动参数指定的 workspace 路径（读一次即清空）
#[tauri::command]
pub async fn get_startup_workspace_path(
    cache: State<'_, StartupPathCache>,
) -> Result<Option<String>, String> {
    Ok(cache.take())
}

/// 查询某个窗口 label 对应的 workspace 路径
#[tauri::command]
pub async fn get_window_workspace_path(
    state: State<'_, WorkspaceManager>,
    label: String,
) -> Result<Option<String>, String> {
    Ok(state.path_for_label(&label))
}

/// 前端同步当前所有已注册项目根路径，用于 fs 命令的沙箱校验
#[tauri::command]
pub async fn sync_workspace_project_paths(
    state: State<'_, WorkspaceManager>,
    paths: Vec<String>,
) -> Result<(), String> {
    state.sync_project_paths(paths);
    Ok(())
}

/// 打开 workspace 到窗口：如果目标 workspace 已有窗口则 focus，
/// 否则新建 WebviewWindow，URL 带 `?ws={urlsafe_b64(path)}`。
#[tauri::command]
pub async fn open_workspace_in_window(
    app: AppHandle,
    state: State<'_, WorkspaceManager>,
    path: String,
) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    let canonical = canonicalize_or_raw(&path);
    let label = state.compute_label(&canonical);

    // 复用已存在的窗口
    if let Some(existing) = app.get_webview_window(&label) {
        existing.set_focus().map_err(|e| e.to_string())?;
        state.bind_window(&label, &canonical);
        return Ok(());
    }

    // 读 workspace name 用于标题
    let name = state
        .load_file(&canonical)
        .ok()
        .and_then(|v| v.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| "Star Gazer".to_string());

    // URL-safe base64 供前端解析
    let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(canonical.as_bytes());
    let url = format!("index.html?ws={}", b64);

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(format!("Star Gazer · {}", name))
        .inner_size(1440.0, 900.0)
        .min_inner_size(1024.0, 640.0)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .resizable(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    state.bind_window(&label, &canonical);
    state.push_recent(&app, &canonical, &name)?;

    Ok(())
}
