/** Agent 颜色标识 */
export type AgentColor =
  | "blue"
  | "green"
  | "orange"
  | "purple"
  | "pink"
  | "cyan"
  | "yellow"
  | "red";

/** Agent 类型 */
export type AgentType = "claude-code" | "opencode" | "codex" | "custom";

/** Agent 类型到启动命令的映射 */
export const AGENT_COMMANDS: Record<AgentType, string | null> = {
  "claude-code": "claude",
  opencode: "opencode",
  codex: "codex",
  custom: null, // 打开默认 shell
};

/**
 * Agent 关联的项目作用域。
 *
 * - `project`：单个独立项目
 * - `group`：一个项目组的全部成员（PTY cwd 是组的父目录）
 *
 * 这个字段只用来驱动 Sidebar 的"运行指示点"联动和 AgentPicker 的复选项。
 * 向后兼容：老 agent 没这字段时，判断逻辑降级到 `cwd.startsWith(project.path)`。
 */
export type AgentScope =
  | { kind: "project"; projectId: string }
  | { kind: "group"; groupId: string };

/** Agent 实例 */
export interface Agent {
  /** Agent 唯一 ID */
  id: string;
  /** Agent 显示名称 */
  name: string;
  /** Agent 颜色 */
  color: AgentColor;
  /** Agent 类型 */
  agentType: AgentType;
  /** 关联的终端 ID */
  terminalId: string;
  /** Agent 状态 */
  status: AgentStatus;
  /** 画布上的位置 */
  position: { x: number; y: number };
  /** 卡片尺寸 */
  size: { width: number; height: number };
  /** 当前工作目录（PTY 实际启动路径） */
  cwd: string;
  /** 关联的项目作用域 —— 决定 sidebar 运行指示联动 */
  scope?: AgentScope;
  /** 自定义启动命令（agentType 为 custom 时使用） */
  command?: string;
  /** 等待审批时的提示信息 */
  approvalMessage?: string;
}

/** Agent 运行状态 */
export type AgentStatus = "idle" | "running" | "stopped" | "error" | "waiting";
