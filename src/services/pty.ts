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
  rows: number,
  command?: string
): Promise<number> {
  return invoke("create_terminal", { id, cwd, cols, rows, command: command ?? null });
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
  return listen<{ terminalId: string; data: number[] }>("terminal-output", (event) => {
    if (event.payload.terminalId !== id) return;
    // 后端发送 Vec<u8>，需要解码为字符串
    const bytes = new Uint8Array(event.payload.data);
    const text = new TextDecoder().decode(bytes);
    callback(text);
  });
}

/** 监听终端退出事件 */
export async function onTerminalExit(
  id: string,
  callback: (code: number) => void
): Promise<UnlistenFn> {
  return listen<{ terminalId: string; exitCode: number | null }>("terminal-exit", (event) => {
    if (event.payload.terminalId !== id) return;
    callback(event.payload.exitCode ?? -1);
  });
}
