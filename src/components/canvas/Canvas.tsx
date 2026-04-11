/**
 * 画布主区域 - 无限 2D 平面，放置 Agent 终端卡片
 */
import { useRef, useCallback } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { AgentCard } from "./AgentCard";
import { CanvasToolbar } from "./CanvasToolbar";

export function Canvas() {
  const { agents, viewport, zoom } = useCanvasStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  /** 画布拖拽平移 */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 仅在空白区域拖拽（非 Agent 卡片）
      if (e.target === canvasRef.current || e.target === canvasRef.current?.firstChild) {
        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      useCanvasStore.getState().setViewport({
        x: viewport.x + dx,
        y: viewport.y + dy,
      });
    },
    [viewport]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  /** 滚轮缩放 */
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        useCanvasStore.getState().setZoom(zoom + delta);
      }
    },
    [zoom]
  );

  return (
    <div
      ref={canvasRef}
      className="relative flex-1 overflow-hidden bg-background no-select cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* 画布工具栏 */}
      <CanvasToolbar />

      {/* 画布内容层 */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/* 网格背景 */}
        <div
          className="absolute inset-[-10000px] pointer-events-none opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--color-muted-foreground) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Agent 卡片 */}
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>

      {/* 空状态提示 */}
      {agents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium">画布就绪</p>
            <p className="text-sm mt-1">按 Cmd+N 创建新的 Agent 终端</p>
          </div>
        </div>
      )}
    </div>
  );
}
