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

/** Agent 实例 */
export interface Agent {
  /** Agent 唯一 ID */
  id: string;
  /** Agent 显示名称 */
  name: string;
  /** Agent 颜色 */
  color: AgentColor;
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
}

/** Agent 运行状态 */
export type AgentStatus = "idle" | "running" | "stopped" | "error";
