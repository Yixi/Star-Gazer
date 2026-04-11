/**
 * 终端视图组件 - 封装 xterm.js
 */
import { useEffect } from "react";
import { useTerminal } from "@/hooks/useTerminal";

interface TerminalViewProps {
  terminalId: string;
  cwd: string;
}

export function TerminalView({ terminalId, cwd }: TerminalViewProps) {
  const { containerRef, init, fit } = useTerminal({ terminalId, cwd });

  useEffect(() => {
    init();
  }, [init]);

  // 监听容器尺寸变化
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      fit();
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [containerRef, fit]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#1a1a1a]"
    />
  );
}
