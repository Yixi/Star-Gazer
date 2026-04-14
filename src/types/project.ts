/** 项目数据模型 */
export interface Project {
  /** 项目唯一标识 */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目根目录路径 */
  path: string;
  /** 最后打开时间 */
  lastOpened: number;
  /**
   * 所属项目组 ID（可选）。
   * - 非空：这是一个父目录组的成员
   * - 空 / 缺失：这是一个独立项目（旧语义，完全兼容老 workspace）
   */
  groupId?: string;
}

/**
 * 项目组 — 由 "父目录 + 下面若干 git 仓库" 形成的逻辑分组。
 *
 * - 组内成员通过 `Project.groupId === ProjectGroup.id` 反查，不在组里存 memberIds
 *   以避免双向同步带来的一致性问题。
 * - `path` 是父目录自身的绝对路径；当 agent 关联整个组时，PTY 就在这个目录启动。
 */
export interface ProjectGroup {
  id: string;
  /** 默认取父目录 basename，可用户重命名 */
  name: string;
  /** 父目录绝对路径 */
  path: string;
}

/** 文件树节点 */
export interface FileNode {
  /** 节点唯一 ID（相对路径） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 完整路径 */
  path: string;
  /** 是否为目录 */
  isDir: boolean;
  /** 子节点（仅目录） */
  children?: FileNode[];
  /** Git 状态 */
  gitStatus?: GitFileStatus;
  /** 关联的 Agent 颜色（如果被 Agent 修改） */
  agentColor?: string;
  /** Diff 统计 */
  diffStat?: { additions: number; deletions: number };
}

/** Git 文件状态 */
export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "ignored"
  | "conflicted"
  | "unchanged";
