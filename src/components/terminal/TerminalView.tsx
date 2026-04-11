/**
 * 终端视图组件 - 封装 xterm.js
 *
 * 功能：
 * - 集成 @xterm/xterm 5.x 终端
 * - WebGL 渲染器（@xterm/addon-webgl）
 * - FitAddon 自适应大小
 * - ResizeObserver 监听卡片大小变化
 * - 深色终端主题（背景 #0d0f14，SF Mono 字体）
 * - 支持 256 色和 true color
 * - 通过 Tauri IPC 与后端 PTY 双向通信
 */
import { useEffect } from "react";
import "@xterm/xterm/css/xterm.css";
import { useTerminal } from "@/hooks/useTerminal";

interface TerminalViewProps {
  terminalId: string;
  cwd: string;
  agentId?: string;
  command?: string | null;
  onReady?: () => void;
  onExit?: (code: number) => void;
}

export function TerminalView({ terminalId, cwd, agentId, command, onReady, onExit }: TerminalViewProps) {
  const { containerRef, init, fit } = useTerminal({ terminalId, cwd, agentId, command, onReady, onExit });

  // 初始化终端 — 竞态防护由 useTerminal 内部的 initPendingRef 处理
  useEffect(() => {
    init();
  }, [init]);

  // 使用 ResizeObserver 监听容器尺寸变化，自适应终端大小
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      // 使用 requestAnimationFrame 避免过于频繁的 fit 调用
      requestAnimationFrame(() => {
        fit();
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, fit]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: "#0d0f14" }}
    />
  );
}
