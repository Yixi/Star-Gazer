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
  /** 当前工作目录 */
  cwd: string;
  /** 自定义启动命令（agentType 为 custom 时使用） */
  command?: string;
  /** 等待审批时的提示信息 */
  approvalMessage?: string;
}

/** Agent 运行状态 */
export type AgentStatus = "idle" | "running" | "stopped" | "error" | "waiting";
