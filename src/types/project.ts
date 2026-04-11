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
