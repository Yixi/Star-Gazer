/** 终端实例 */
export interface TerminalInstance {
  /** 终端唯一 ID */
  id: string;
  /** 关联的 Agent ID */
  agentId: string;
  /** 终端进程 PID */
  pid?: number;
  /** 终端尺寸 */
  cols: number;
  rows: number;
  /** 终端状态 */
  status: "active" | "closed";
}

/** 终端输出数据 */
export interface TerminalOutput {
  terminalId: string;
  data: string;
}

/** 终端大小调整参数 */
export interface TerminalResize {
  terminalId: string;
  cols: number;
  rows: number;
}
