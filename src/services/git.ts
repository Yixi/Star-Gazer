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
  /** 父 commit hash 列表 */
  parents: string[];
  /** 分支/tag 引用装饰 */
  refs: string[];
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

/** 获取 Git 日志 —— limit 省略或为 0 表示全部 commits */
export async function gitLog(
  repoPath: string,
  limit?: number
): Promise<GitLogEntry[]> {
  return invoke("git_log", { repoPath, limit: limit ?? null });
}

/** 获取 commit 范围 diff（from~..to） */
export async function gitDiffRange(
  repoPath: string,
  from: string,
  to: string,
  filePath?: string,
): Promise<string> {
  return invoke("git_diff_range", { repoPath, from, to, filePath: filePath ?? null });
}

/**
 * 获取 commit range 涉及的文件列表
 * - 单 commit：`from === to === hash`
 * - 多 commit range：`from` 为最旧 commit，`to` 为最新 commit
 * 后端走 `git diff --name-status --numstat {from}~..{to}`，无论 range 有多少
 * commit 都是一次性的净变更聚合。
 */
export async function gitCommitFiles(
  repoPath: string,
  from: string,
  to: string,
): Promise<GitFileChange[]> {
  return invoke("git_commit_files", { repoPath, from, to });
}
