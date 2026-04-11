/**
 * Git 服务 - 通过 Tauri IPC 调用后端 Git 命令
 * 参考 VSCode 的 Git 服务实现，shell out 到系统 git
 */
import { invoke } from "@tauri-apps/api/core";

/** Git 分支信息 */
export interface GitBranch {
  name: string;
  isHead: boolean;
  upstream?: string;
}

/** Git 状态摘要 */
export interface GitStatusSummary {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
}

/** Git 文件变更 */
export interface GitFileChange {
  path: string;
  status: string;
  /** 新增行数 */
  additions: number;
  /** 删除行数 */
  deletions: number;
}

/** Git 日志条目 */
export interface GitLogEntry {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
  message: string;
}

/** 获取 Git 仓库状态 */
export async function gitStatus(repoPath: string): Promise<GitStatusSummary> {
  return invoke("git_status", { repoPath });
}

/** 获取文件 Diff */
export async function gitDiff(repoPath: string, filePath: string): Promise<string> {
  return invoke("git_diff", { repoPath, filePath });
}

/** 获取分支列表 */
export async function gitBranches(repoPath: string): Promise<GitBranch[]> {
  return invoke("git_branches", { repoPath });
}

/** 获取 Git 日志 */
export async function gitLog(
  repoPath: string,
  limit: number = 50
): Promise<GitLogEntry[]> {
  return invoke("git_log", { repoPath, limit });
}
