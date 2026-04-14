/**
 * Workspace IPC 薄封装
 *
 * 所有 Tauri invoke 调用集中在这里，UI 与 store 层只调用这些函数。
 */
import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceFile, RecentWorkspaces } from "@/types/workspace";

/** 从磁盘读取 workspace 文件 */
export async function loadWorkspaceFile(path: string): Promise<WorkspaceFile> {
  return invoke<WorkspaceFile>("load_workspace_file", { path });
}

/** 原子保存 workspace 到磁盘 */
export async function saveWorkspaceFile(
  path: string,
  workspace: WorkspaceFile,
): Promise<void> {
  return invoke<void>("save_workspace_file", { path, workspace });
}

/** 新建一个空 workspace 文件（返回写入的内容） */
export async function createWorkspaceFile(
  path: string,
  name: string,
): Promise<WorkspaceFile> {
  return invoke<WorkspaceFile>("create_workspace_file", { path, name });
}

/** 最近打开过的 workspace 列表 + lastOpenedPath */
export async function listRecentWorkspaces(): Promise<RecentWorkspaces> {
  return invoke<RecentWorkspaces>("list_recent_workspaces");
}

/** 从 recent 列表里移除一项（文件被删 / 用户主动清理） */
export async function removeRecentWorkspace(path: string): Promise<void> {
  return invoke<void>("remove_recent_workspace", { path });
}

/**
 * 读取启动时缓存的 workspace 路径（来自命令行参数或 Finder 双击）
 *
 * 读完会被后端清空 —— 只生效一次。
 */
export async function getStartupWorkspacePath(): Promise<string | null> {
  return invoke<string | null>("get_startup_workspace_path");
}

/** 根据窗口 label 查询该窗口绑定的 workspace 路径 */
export async function getWindowWorkspacePath(
  label: string,
): Promise<string | null> {
  return invoke<string | null>("get_window_workspace_path", { label });
}

/** 在窗口中打开一个 workspace；已打开则 focus，否则新建窗口 */
export async function openWorkspaceInWindow(path: string): Promise<void> {
  return invoke<void>("open_workspace_in_window", { path });
}

/**
 * 把当前 workspace 的 project 路径列表推送给后端。
 *
 * fs.rs 的路径沙箱读的是 WorkspaceManager 的内存注册表 —— 没同步过的话
 * read_file / list_dir / watch_dir 都会被拒。任何会改变 projects 数组
 * 的操作（load workspace / add / remove）之后都需要调一次。
 */
export async function syncWorkspaceProjectPaths(
  paths: string[],
): Promise<void> {
  return invoke<void>("sync_workspace_project_paths", { paths });
}

/** 父目录扫描结果 —— 对照后端 ScanResult 枚举 */
export type ScanGitReposResult =
  | { kind: "single"; path: string; name: string }
  | {
      kind: "group";
      parentPath: string;
      parentName: string;
      members: Array<{ name: string; path: string }>;
    }
  | { kind: "empty" };

/**
 * 智能扫描一个用户选中的目录：
 * - 本身是 git 仓库 → `single`
 * - 本身不是 git 但一层子目录里有若干 git 仓库 → `group`
 * - 两者都不是 → `empty`
 *
 * 不走路径沙箱（因为目标还没被加进 workspace 的 allow-list）。
 */
export async function scanGitRepos(
  path: string,
): Promise<ScanGitReposResult> {
  return invoke<ScanGitReposResult>("scan_git_repos", { path });
}
