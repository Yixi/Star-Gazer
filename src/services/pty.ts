/**
 * PTY 服务 - 通过 Tauri IPC 管理终端伪终端
 * 参考 VSCode 的 PtyHostService 实现
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** 创建新终端 */
export async function createTerminal(
  id: string,
  cwd: string,
  cols: number,
  rows: number
): Promise<number> {
  return invoke("create_terminal", { id, cwd, cols, rows });
}

/** 向终端写入数据 */
export async function writeTerminal(id: string, data: string): Promise<void> {
  return invoke("write_terminal", { id, data });
}

/** 调整终端尺寸 */
export async function resizeTerminal(
  id: string,
  cols: number,
  rows: number
): Promise<void> {
  return invoke("resize_terminal", { id, cols, rows });
}

/** 关闭终端 */
export async function closeTerminal(id: string): Promise<void> {
  return invoke("close_terminal", { id });
}

/** 监听终端输出事件 */
export async function onTerminalOutput(
  id: string,
  callback: (data: string) => void
): Promise<UnlistenFn> {
  return listen<{ id: string; data: string }>(`terminal-output-${id}`, (event) => {
    callback(event.payload.data);
  });
}

/** 监听终端退出事件 */
export async function onTerminalExit(
  id: string,
  callback: (code: number) => void
): Promise<UnlistenFn> {
  return listen<{ id: string; code: number }>(`terminal-exit-${id}`, (event) => {
    callback(event.payload.code);
  });
}
