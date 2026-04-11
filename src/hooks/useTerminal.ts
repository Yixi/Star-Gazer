/**
 * 终端 Hook - 管理 xterm.js 实例与 PTY 后端的连接
 */
import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import * as ptyService from "@/services/pty";

interface UseTerminalOptions {
  terminalId: string;
  cwd: string;
  fontSize?: number;
}

export function useTerminal({ terminalId, cwd, fontSize = 13 }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  /** 初始化终端 */
  const init = useCallback(async () => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      fontSize,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: "#1a1a1a",
        foreground: "#e0e0e0",
        cursor: "#ffffff",
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);

    // 尝试加载 WebGL 加速渲染
    try {
      const webglAddon = new WebglAddon();
      terminal.loadAddon(webglAddon);
    } catch {
      console.warn("WebGL 渲染不可用，使用 Canvas 回退");
    }

    fitAddon.fit();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 创建后端 PTY
    const { cols, rows } = terminal;
    await ptyService.createTerminal(terminalId, cwd, cols, rows);

    // 终端输入 -> PTY
    terminal.onData((data) => {
      ptyService.writeTerminal(terminalId, data);
    });

    // PTY 输出 -> 终端
    await ptyService.onTerminalOutput(terminalId, (data) => {
      terminal.write(data);
    });

    // PTY 退出
    await ptyService.onTerminalExit(terminalId, () => {
      terminal.writeln("\r\n[进程已退出]");
    });
  }, [terminalId, cwd, fontSize]);

  /** 调整尺寸 */
  const fit = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      fitAddonRef.current.fit();
      const { cols, rows } = terminalRef.current;
      ptyService.resizeTerminal(terminalId, cols, rows);
    }
  }, [terminalId]);

  /** 清理 */
  useEffect(() => {
    return () => {
      terminalRef.current?.dispose();
      ptyService.closeTerminal(terminalId).catch(console.error);
    };
  }, [terminalId]);

  return { containerRef, init, fit, terminal: terminalRef };
}
