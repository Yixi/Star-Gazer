/**
 * 终端 Hook - 管理 xterm.js 实例与 PTY 后端的连接
 *
 * 功能：
 * - 初始化 @xterm/xterm 终端实例
 * - 加载 WebGL 渲染器（@xterm/addon-webgl）
 * - 加载 FitAddon 自适应大小
 * - 深色主题：背景 #0d0f14，SF Mono 字体
 * - 支持 256 色 和 true color
 * - 通过 Tauri IPC 创建后端 PTY 并双向通信
 *   - 监听 terminal-output event 写入 xterm
 *   - 用户键入时调用 write_terminal command 发送到后端
 */
import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import * as ptyService from "@/services/pty";
import { useTerminalStore } from "@/stores/terminalStore";

interface UseTerminalOptions {
  terminalId: string;
  cwd: string;
  agentId?: string;
  fontSize?: number;
}

/**
 * 深色终端主题 - 参考 Mockup 中的配色
 * 背景色 #0d0f14，支持 256 色和 true color
 */
const TERMINAL_THEME = {
  background: "#0d0f14",
  foreground: "#e4e6eb",
  cursor: "#4a9eff",
  cursorAccent: "#0d0f14",
  selectionBackground: "rgba(74, 158, 255, 0.3)",
  selectionForeground: undefined,
  // 基础 16 色（ANSI）
  black: "#1a1c23",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#4a9eff",
  magenta: "#a78bfa",
  cyan: "#06b6d4",
  white: "#b8bcc4",
  brightBlack: "#4a5263",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c4b5fd",
  brightCyan: "#22d3ee",
  brightWhite: "#e4e6eb",
};

export function useTerminal({ terminalId, cwd, agentId, fontSize = 12 }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initPendingRef = useRef(false);

  /** 初始化终端 */
  const init = useCallback(async () => {
    if (!containerRef.current) return;
    if (terminalRef.current) return; // 防止重复初始化
    if (initPendingRef.current) return; // 防止并发初始化（async 竞态）
    initPendingRef.current = true;

    const terminal = new Terminal({
      fontSize,
      fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      fontWeight: "400",
      fontWeightBold: "600",
      letterSpacing: 0,
      lineHeight: 1.35,
      theme: TERMINAL_THEME,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowProposedApi: true,
      scrollback: 5000,
      // 启用 true color 支持
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);

    // 尝试加载 WebGL 加速渲染
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        console.warn("WebGL 上下文丢失，回退到 Canvas 渲染");
      });
      terminal.loadAddon(webglAddon);
    } catch {
      console.warn("WebGL 渲染不可用，使用 Canvas 回退");
    }

    // 延迟 fit 以确保容器尺寸已确定
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 创建后端 PTY
    const { cols, rows } = terminal;
    try {
      const pid = await ptyService.createTerminal(terminalId, cwd, cols, rows);
      // 更新 terminalStore
      useTerminalStore.getState().addTerminal({
        id: terminalId,
        agentId: agentId ?? terminalId,
        pid,
        cols,
        rows,
        status: "active",
      });
    } catch (err) {
      // Fallback: 在终端中显示友好提示（浏览器预览模式下 Tauri IPC 不可用）
      terminal.writeln('\x1b[33m⚠ 终端功能需要在 Tauri 桌面环境中运行\x1b[0m');
      terminal.writeln('\x1b[90m当前为浏览器预览模式\x1b[0m');
      terminal.writeln('');
      terminal.writeln(`\x1b[90m错误详情: ${err}\x1b[0m`);
      return;
    }

    // 终端输入 -> PTY（用户键入时调用 write_terminal command）
    terminal.onData((data) => {
      ptyService.writeTerminal(terminalId, data);
    });

    // PTY 输出 -> 终端（监听 terminal-output event 写入 xterm）
    await ptyService.onTerminalOutput(terminalId, (data) => {
      terminal.write(data);
    });

    // PTY 退出
    await ptyService.onTerminalExit(terminalId, (code) => {
      terminal.writeln(`\r\n\x1b[90m[进程已退出，退出码: ${code}]\x1b[0m`);
      useTerminalStore.getState().setTerminalStatus(terminalId, "closed");
    });
  }, [terminalId, cwd, agentId, fontSize]);

  /** 调整尺寸 */
  const fit = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        ptyService.resizeTerminal(terminalId, cols, rows);
      } catch {
        // fit 可能在终端未完全初始化时失败，忽略
      }
    }
  }, [terminalId]);

  /** 清理 */
  useEffect(() => {
    return () => {
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      initPendingRef.current = false;
      ptyService.closeTerminal(terminalId).catch(console.error);
      useTerminalStore.getState().removeTerminal(terminalId);
    };
  }, [terminalId]);

  return { containerRef, init, fit, terminal: terminalRef };
}
