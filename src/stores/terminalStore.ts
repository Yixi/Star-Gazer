import { create } from "zustand";
import type { TerminalInstance } from "@/types/terminal";

interface TerminalState {
  /** 所有终端实例 */
  terminals: Map<string, TerminalInstance>;

  /** 创建终端实例记录 */
  addTerminal: (terminal: TerminalInstance) => void;
  /** 移除终端实例 */
  removeTerminal: (id: string) => void;
  /** 更新终端尺寸 */
  updateTerminalSize: (id: string, cols: number, rows: number) => void;
  /** 设置终端 PID */
  setTerminalPid: (id: string, pid: number) => void;
  /** 设置终端状态 */
  setTerminalStatus: (id: string, status: TerminalInstance["status"]) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  terminals: new Map(),

  addTerminal: (terminal) =>
    set((state) => {
      const newMap = new Map(state.terminals);
      newMap.set(terminal.id, terminal);
      return { terminals: newMap };
    }),

  removeTerminal: (id) =>
    set((state) => {
      const newMap = new Map(state.terminals);
      newMap.delete(id);
      return { terminals: newMap };
    }),

  updateTerminalSize: (id, cols, rows) =>
    set((state) => {
      const terminal = state.terminals.get(id);
      if (!terminal) return state;
      const newMap = new Map(state.terminals);
      newMap.set(id, { ...terminal, cols, rows });
      return { terminals: newMap };
    }),

  setTerminalPid: (id, pid) =>
    set((state) => {
      const terminal = state.terminals.get(id);
      if (!terminal) return state;
      const newMap = new Map(state.terminals);
      newMap.set(id, { ...terminal, pid });
      return { terminals: newMap };
    }),

  setTerminalStatus: (id, status) =>
    set((state) => {
      const terminal = state.terminals.get(id);
      if (!terminal) return state;
      const newMap = new Map(state.terminals);
      newMap.set(id, { ...terminal, status });
      return { terminals: newMap };
    }),
}));
