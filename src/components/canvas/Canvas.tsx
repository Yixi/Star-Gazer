/**
 * 画布主区域 - 无限 2D 平面，放置 Agent 终端卡片
 *
 * 支持的交互：
 * - 空格+拖拽 / Option+拖拽 / 空白区域直接拖拽：平移画布
 * - Cmd+滚轮 / 触控板双指缩放：以光标为中心缩放（50%~200%）
 * - 平滑惯性效果
 */
import { useRef, useCallback, useEffect, useState } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { AgentCard } from "./AgentCard";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasEmptyState } from "./CanvasEmptyState";
import { FAB } from "./FAB";
import { AgentPicker } from "./AgentPicker";

export function Canvas() {
  const { agents, viewport, zoom, isPanning, setViewport, setIsPanning } =
    useCanvasStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const inertiaFrame = useRef<number>(0);
  const isSpaceHeld = useRef(false);
  const [showPicker, setShowPicker] = useState(false);

  /** 停止惯性动画 */
  const stopInertia = useCallback(() => {
    if (inertiaFrame.current) {
      cancelAnimationFrame(inertiaFrame.current);
      inertiaFrame.current = 0;
    }
  }, []);

  /** 启动惯性滑动 */
  const startInertia = useCallback(() => {
    stopInertia();
    const decay = 0.92;
    const minSpeed = 0.5;

    const animate = () => {
      const vx = velocity.current.x;
      const vy = velocity.current.y;

      if (Math.abs(vx) < minSpeed && Math.abs(vy) < minSpeed) {
        velocity.current = { x: 0, y: 0 };
        return;
      }

      const state = useCanvasStore.getState();
      useCanvasStore.getState().setViewport({
        x: state.viewport.x + vx,
        y: state.viewport.y + vy,
      });

      velocity.current = { x: vx * decay, y: vy * decay };
      inertiaFrame.current = requestAnimationFrame(animate);
    };

    inertiaFrame.current = requestAnimationFrame(animate);
  }, [stopInertia]);

  /** 画布拖拽平移 - mousedown */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 判断是否可以开始平移：
      // 1. 在空白区域直接拖拽
      // 2. 按住空格键
      // 3. 按住 Option 键
      const isOnCanvas =
        e.target === canvasRef.current ||
        (e.target as HTMLElement).dataset?.canvasLayer === "true";
      const canPan = isOnCanvas || isSpaceHeld.current || e.altKey;

      if (!canPan) return;

      e.preventDefault();
      stopInertia();
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      velocity.current = { x: 0, y: 0 };
      setIsPanning(true);
    },
    [stopInertia, setIsPanning]
  );

  /** 画布拖拽平移 - mousemove */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return;

      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };

      // 使用指数移动平均计算速度，用于惯性
      velocity.current = {
        x: velocity.current.x * 0.6 + dx * 0.4,
        y: velocity.current.y * 0.6 + dy * 0.4,
      };

      const state = useCanvasStore.getState();
      setViewport({
        x: state.viewport.x + dx,
        y: state.viewport.y + dy,
      });
    },
    [setViewport]
  );

  /** 画布拖拽平移 - mouseup */
  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsPanning(false);
    startInertia();
  }, [setIsPanning, startInertia]);

  /** 滚轮缩放 - 以光标位置为中心 */
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Cmd+滚轮 或 触控板双指缩放（ctrlKey 在触控板缩放时为 true）
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        const state = useCanvasStore.getState();
        // 触控板缩放时 deltaY 比较小，鼠标滚轮较大
        const sensitivity = e.ctrlKey ? 0.01 : 0.05;
        const delta = -e.deltaY * sensitivity;

        // 以光标位置为缩放中心
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const point = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };

        state.zoomAtPoint(delta, point);
      }
    },
    []
  );

  /** 监听键盘事件 - 空格键用于平移模式 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        // 避免在输入框中触发
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        isSpaceHeld.current = true;
      }
      // Esc 退出最大化的卡片
      if (e.code === "Escape") {
        const state = useCanvasStore.getState();
        // 找到最大化的卡片并恢复
        for (const agent of state.agents) {
          if (state.getCardDisplayMode(agent.id) === "maximized") {
            state.setCardDisplayMode(agent.id, "normal");
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceHeld.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  /** 阻止浏览器默认的缩放行为 */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const preventDefaultWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    el.addEventListener("wheel", preventDefaultWheel, { passive: false });
    return () => el.removeEventListener("wheel", preventDefaultWheel);
  }, []);

  /** 根据状态决定光标样式 */
  const getCursorClass = () => {
    if (isPanning || isDragging.current) return "cursor-grabbing";
    if (isSpaceHeld.current) return "cursor-grab";
    return "cursor-default";
  };

  return (
    <div
      ref={canvasRef}
      className={`relative flex-1 overflow-hidden no-select ${getCursorClass()}`}
      style={{ backgroundColor: "#0f1116" }}
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
        data-canvas-layer="true"
        className="absolute inset-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        {/* Agent 卡片 */}
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>

      {/* 空状态引导 — 精致的入场动画 */}
      {agents.length === 0 && <CanvasEmptyState />}

      {/* FAB 按钮 */}
      <FAB onClick={() => setShowPicker(true)} />

      {/* Agent Picker 弹窗 */}
      {showPicker && <AgentPicker onClose={() => setShowPicker(false)} />}
    </div>
  );
}
