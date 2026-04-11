/**
 * Agent 终端卡片 — 画布上的可拖拽卡片
 *
 * 微交互效果：
 * - 拖拽：阴影加深、轻微放大(1.02)、边框发光
 * - 选中/激活：对应颜色的边框发光光晕
 * - 状态变化动画（running → idle → error → stopped）
 * - 创建入场动画（从中心缩放弹入）
 * - 关闭退场动画（缩小 + 淡出）
 * - Hover 时触发关联高亮
 */
import { useRef, useCallback, useState, useEffect } from "react";
import { GripHorizontal, X, Minimize2, Maximize2 } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useHoverStore } from "@/stores/hoverStore";
import { AGENT_COLORS } from "@/lib/colors";
import { TerminalView } from "@/components/terminal/TerminalView";
import { PulsingDot } from "@/components/ui/PulsingDot";
import type { Agent, AgentColor } from "@/types/agent";

interface AgentCardProps {
  agent: Agent;
}

/** Agent 颜色到 CSS 变量的发光映射 */
const GLOW_MAP: Record<AgentColor, string> = {
  blue: "var(--sg-shadow-glow-blue, 0 0 12px rgba(74,158,255,0.4))",
  orange: "var(--sg-shadow-glow-orange, 0 0 12px rgba(255,140,66,0.4))",
  purple: "var(--sg-shadow-glow-purple, 0 0 12px rgba(167,139,250,0.4))",
  green: "var(--sg-shadow-glow-green, 0 0 12px rgba(34,197,94,0.4))",
  pink: "var(--sg-shadow-glow-pink, 0 0 12px rgba(236,72,153,0.4))",
  yellow: "var(--sg-shadow-glow-yellow, 0 0 12px rgba(234,179,8,0.4))",
  cyan: "var(--sg-shadow-glow-cyan, 0 0 12px rgba(6,182,212,0.4))",
  red: "var(--sg-shadow-glow-red, 0 0 12px rgba(239,68,68,0.4))",
};

/** Agent 颜色到具体 HEX 的映射 */
const COLOR_HEX: Record<AgentColor, string> = {
  blue: "#4a9eff",
  orange: "#ff8c42",
  purple: "#a78bfa",
  green: "#22c55e",
  pink: "#ec4899",
  yellow: "#eab308",
  cyan: "#06b6d4",
  red: "#ef4444",
};

/** 状态对应的指示颜色 */
const STATUS_INDICATOR: Record<
  Agent["status"],
  { color: string; label: string; animate: boolean }
> = {
  running: { color: "#22c55e", label: "运行中", animate: true },
  idle: { color: "#6b7280", label: "空闲", animate: false },
  stopped: { color: "#febc2e", label: "已停止", animate: false },
  error: { color: "#ef4444", label: "错误", animate: true },
};

export function AgentCard({ agent }: AgentCardProps) {
  const { selectedAgentId, selectAgent, updateAgentPosition, removeAgent } =
    useCanvasStore();
  const { setHoveredAgent, clearHover } = useHoverStore();
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  /** 拖拽中状态（用于视觉反馈） */
  const [dragging, setDragging] = useState(false);
  /** 入场动画控制 */
  const [hasEntered, setHasEntered] = useState(false);
  /** 退场动画控制 */
  const [isExiting, setIsExiting] = useState(false);
  /** 鼠标悬停 */
  const [isHovered, setIsHovered] = useState(false);

  const colors = AGENT_COLORS[agent.color];
  const isSelected = selectedAgentId === agent.id;
  const statusInfo = STATUS_INDICATOR[agent.status];
  const colorHex = COLOR_HEX[agent.color];

  /* 入场动画：组件挂载后播放 */
  useEffect(() => {
    const raf = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  /** 卡片拖拽 */
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      isDragging.current = true;
      setDragging(true);
      dragOffset.current = {
        x: e.clientX - agent.position.x,
        y: e.clientY - agent.position.y,
      };
      selectAgent(agent.id);

      const handleMove = (me: MouseEvent) => {
        if (!isDragging.current) return;
        updateAgentPosition(agent.id, {
          x: me.clientX - dragOffset.current.x,
          y: me.clientY - dragOffset.current.y,
        });
      };

      const handleUp = () => {
        isDragging.current = false;
        setDragging(false);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [agent.id, agent.position, selectAgent, updateAgentPosition]
  );

  /** 退场动画后移除 */
  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsExiting(true);
      // 等动画结束后再移除
      setTimeout(() => {
        removeAgent(agent.id);
      }, 200);
    },
    [agent.id, removeAgent]
  );

  /* 计算动态样式 */
  const cardStyle: React.CSSProperties = {
    left: agent.position.x,
    top: agent.position.y,
    width: agent.size.width,
    height: agent.size.height,
    /* 入场动画 */
    animation: !hasEntered
      ? undefined
      : isExiting
        ? "sg-card-exit 200ms var(--sg-ease-in) forwards"
        : "sg-card-enter 300ms var(--sg-ease-spring) forwards",
    /* 拖拽效果：放大 + 加深阴影 */
    transform: dragging ? "scale(1.02)" : undefined,
    boxShadow: dragging
      ? `var(--sg-shadow-card-dragging), 0 0 16px ${COLOR_HEX[agent.color]}40`
      : isSelected || isHovered
        ? `var(--sg-shadow-card), 0 0 12px ${COLOR_HEX[agent.color]}30`
        : "var(--sg-shadow-card)",
    /* 所有状态变化平滑过渡 */
    transition: dragging
      ? "none"
      : "transform 150ms var(--sg-ease-out), box-shadow 200ms var(--sg-ease-in-out), border-color 200ms var(--sg-ease-in-out)",
    borderColor:
      dragging || isSelected || isHovered
        ? `${colorHex}80`
        : "var(--sg-border-secondary)",
  };

  return (
    <div
      className="absolute rounded-xl border overflow-hidden"
      style={{
        ...cardStyle,
        background: "var(--sg-bg-card)",
      }}
      onClick={() => selectAgent(agent.id)}
      onMouseEnter={() => {
        setIsHovered(true);
        setHoveredAgent(agent.id, agent.color);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        clearHover();
      }}
      data-agent-id={agent.id}
      data-agent-color={agent.color}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-move select-none"
        style={{
          background: "var(--sg-bg-card-header)",
          borderBottom: "1px solid var(--sg-border-secondary)",
        }}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal
            className="w-3 h-3 flex-shrink-0"
            style={{ color: "var(--sg-text-hint)" }}
          />
          {/* Agent 颜色指示圆点 */}
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: colorHex,
              boxShadow: `0 0 6px ${colorHex}60`,
            }}
          />
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--sg-text-primary)" }}
          >
            {agent.name}
          </span>
          {/* 状态标签 */}
          <span
            className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide"
            style={{
              background: `${statusInfo.color}18`,
              color: statusInfo.color,
              transition: "all var(--sg-duration-slow) var(--sg-ease-in-out)",
            }}
          >
            {/* 运行中/错误状态的动态指示 */}
            {statusInfo.animate && (
              <PulsingDot
                color={agent.status === "error" ? "red" : "green"}
                size={4}
              />
            )}
            {statusInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 rounded-md hover:bg-white/5 transition-colors"
            style={{ color: "var(--sg-text-hint)" }}
          >
            <Minimize2 className="w-3 h-3" />
          </button>
          <button
            className="p-1 rounded-md hover:bg-white/5 transition-colors"
            style={{ color: "var(--sg-text-hint)" }}
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          <button
            className="p-1 rounded-md hover:bg-red-500/20 transition-colors"
            style={{ color: "var(--sg-text-hint)" }}
            onClick={handleRemove}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 终端区域 */}
      <div
        className="flex-1 h-[calc(100%-32px)]"
        style={{ background: "var(--sg-bg-code)" }}
      >
        <TerminalView terminalId={agent.terminalId} cwd={agent.cwd} />
      </div>
    </div>
  );
}
