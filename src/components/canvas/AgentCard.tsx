/**
 * Agent 终端卡片 - 画布上的可拖拽卡片
 *
 * 功能：
 * - 按住头部拖动（requestAnimationFrame 优化）
 * - 鼠标悬停边缘和四角时显示调整手柄并可拖拽调整大小
 * - 最小化：收缩为只显示头部的条状
 * - 最大化：双击头部扩展为画布全屏（Esc 恢复）
 * - 关闭：关闭按钮 + 运行中确认对话框
 * - 双击卡片标题可重命名
 *
 * 微交互效果：
 * - 拖拽：阴影加深、轻微放大(1.02)、边框发光
 * - 选中/激活：对应颜色的边框发光光晕
 * - 状态变化动画（running -> idle -> error -> stopped）
 * - 创建入场动画（从中心缩放弹入）
 * - 关闭退场动画（缩小 + 淡出）
 * - Hover 时触发关联高亮
 */
import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Minus, Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/stores/canvasStore";
import { TerminalView } from "@/components/terminal/TerminalView";
import { PulsingDot } from "@/components/ui/PulsingDot";
import type { Agent } from "@/types/agent";
import { AGENT_COMMANDS } from "@/types/agent";
import { AGENT_COLOR_HEX } from "@/constants/agentColors";

interface AgentCardProps {
  agent: Agent;
}

/** 状态对应的指示颜色 */
const STATUS_INDICATOR: Record<
  Agent["status"],
  { color: string; key: string; animate: boolean }
> = {
  running: { color: "#22c55e", key: "status.running", animate: true },
  idle: { color: "#6b7280", key: "status.idle", animate: false },
  stopped: { color: "#febc2e", key: "status.stopped", animate: false },
  error: { color: "#ef4444", key: "status.error", animate: true },
  waiting: { color: "#febc2e", key: "status.waiting", animate: true },
};

/** 拖拽方向枚举 */
type ResizeDirection =
  | "n" | "s" | "e" | "w"
  | "ne" | "nw" | "se" | "sw"
  | null;

/** 最小卡片尺寸 */
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;
/** 头部高度 */
const HEADER_HEIGHT = 36;
/** 调整手柄的检测区域宽度 */
const RESIZE_EDGE = 8;

export function AgentCard({ agent }: AgentCardProps) {
  const { t } = useTranslation();
  const {
    selectedAgentId,
    selectAgent,
    updateAgentPosition,
    updateAgentSize,
    updateAgentStatus,
    removeAgent,
    setCardDisplayMode,
    getCardDisplayMode,
    bringAgentToFront,
    enterCardMaximize,
    exitCardMaximize,
  } = useCanvasStore();

  const zOrder = useCanvasStore((s) => s.cardZOrder[agent.id] ?? 1);

  const cardRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const resizeDir = useRef<ResizeDirection>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });
  const rafId = useRef<number>(0);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [hoverEdge, setHoverEdge] = useState<ResizeDirection>(null);

  const [dragging, setDragging] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isSelected = selectedAgentId === agent.id;
  const displayMode = getCardDisplayMode(agent.id);
  const statusInfo = STATUS_INDICATOR[agent.status];
  const colorHex = AGENT_COLOR_HEX[agent.color];

  const terminalCommand = useMemo(() => {
    if (agent.command) return agent.command;
    return AGENT_COMMANDS[agent.agentType] ?? null;
  }, [agent.agentType, agent.command]);

  const handleTerminalReady = useCallback(() => {
    updateAgentStatus(agent.id, "running");
  }, [agent.id, updateAgentStatus]);

  const handleTerminalExit = useCallback((code: number) => {
    updateAgentStatus(agent.id, code === 0 ? "stopped" : "error");
  }, [agent.id, updateAgentStatus]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const getResizeCursor = (dir: ResizeDirection): string => {
    switch (dir) {
      case "n": case "s": return "ns-resize";
      case "e": case "w": return "ew-resize";
      case "ne": case "sw": return "nesw-resize";
      case "nw": case "se": return "nwse-resize";
      default: return "default";
    }
  };

  const detectEdge = useCallback(
    (e: React.MouseEvent): ResizeDirection => {
      if (displayMode !== "normal") return null;
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      const onLeft = x < RESIZE_EDGE;
      const onRight = x > w - RESIZE_EDGE;
      const onTop = y < RESIZE_EDGE;
      const onBottom = y > h - RESIZE_EDGE;

      if (onTop && onLeft) return "nw";
      if (onTop && onRight) return "ne";
      if (onBottom && onLeft) return "sw";
      if (onBottom && onRight) return "se";
      if (onTop) return "n";
      if (onBottom) return "s";
      if (onLeft) return "w";
      if (onRight) return "e";
      return null;
    },
    [displayMode]
  );

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (displayMode === "maximized") return;
      if (isEditingName) return;
      e.stopPropagation();
      e.preventDefault();
      isDragging.current = true;
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      startPos.current = { ...agent.position };
      selectAgent(agent.id);

      const handleMove = (me: MouseEvent) => {
        if (!isDragging.current) return;
        if (rafId.current) cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => {
          const currentZoom = useCanvasStore.getState().zoom;
          const dx = (me.clientX - dragStart.current.x) / currentZoom;
          const dy = (me.clientY - dragStart.current.y) / currentZoom;
          updateAgentPosition(agent.id, {
            x: startPos.current.x + dx,
            y: startPos.current.y + dy,
          });
        });
      };

      const handleUp = () => {
        isDragging.current = false;
        setDragging(false);
        if (rafId.current) cancelAnimationFrame(rafId.current);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [agent.id, agent.position, displayMode, isEditingName, selectAgent, updateAgentPosition]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, dir: ResizeDirection) => {
      if (!dir || displayMode !== "normal") return;
      e.stopPropagation();
      e.preventDefault();
      isResizing.current = true;
      resizeDir.current = dir;
      dragStart.current = { x: e.clientX, y: e.clientY };
      startPos.current = { ...agent.position };
      startSize.current = { ...agent.size };
      selectAgent(agent.id);

      const handleMove = (me: MouseEvent) => {
        if (!isResizing.current) return;
        if (rafId.current) cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => {
          const currentZoom = useCanvasStore.getState().zoom;
          const dx = (me.clientX - dragStart.current.x) / currentZoom;
          const dy = (me.clientY - dragStart.current.y) / currentZoom;
          const d = resizeDir.current;

          let newX = startPos.current.x;
          let newY = startPos.current.y;
          let newW = startSize.current.width;
          let newH = startSize.current.height;

          if (d?.includes("e")) newW = Math.max(MIN_WIDTH, startSize.current.width + dx);
          if (d?.includes("w")) {
            newW = Math.max(MIN_WIDTH, startSize.current.width - dx);
            if (newW > MIN_WIDTH) newX = startPos.current.x + dx;
          }
          if (d?.includes("s")) newH = Math.max(MIN_HEIGHT, startSize.current.height + dy);
          if (d?.includes("n")) {
            newH = Math.max(MIN_HEIGHT, startSize.current.height - dy);
            if (newH > MIN_HEIGHT) newY = startPos.current.y + dy;
          }

          updateAgentPosition(agent.id, { x: newX, y: newY });
          updateAgentSize(agent.id, { width: newW, height: newH });
        });
      };

      const handleUp = () => {
        isResizing.current = false;
        resizeDir.current = null;
        if (rafId.current) cancelAnimationFrame(rafId.current);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [agent.id, agent.position, agent.size, displayMode, selectAgent, updateAgentPosition, updateAgentSize]
  );

  const handleCardMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging.current || isResizing.current) return;
      const edge = detectEdge(e);
      setHoverEdge(edge);
    },
    [detectEdge]
  );

  const handleCardMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const edge = detectEdge(e);
      if (edge) {
        handleResizeStart(e, edge);
      }
    },
    [detectEdge, handleResizeStart]
  );

  const handleHeaderDoubleClick = useCallback(() => {
    if (displayMode === "maximized") {
      exitCardMaximize();
    } else {
      enterCardMaximize(agent.id);
    }
  }, [agent.id, displayMode, enterCardMaximize, exitCardMaximize]);

  const handleNameDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(agent.name);
    setIsEditingName(true);
  }, [agent.name]);

  const confirmRename = useCallback(() => {
    const newName = editName.trim();
    if (newName && newName !== agent.name) {
      const state = useCanvasStore.getState();
      const agents = state.agents.map((a) =>
        a.id === agent.id ? { ...a, name: newName } : a
      );
      useCanvasStore.setState({ agents });
    }
    setIsEditingName(false);
  }, [agent.id, agent.name, editName]);

  const cancelRename = useCallback(() => {
    setIsEditingName(false);
    setEditName(agent.name);
  }, [agent.name]);

  const handleMinimize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (displayMode === "minimized") {
        setCardDisplayMode(agent.id, "normal");
      } else {
        setCardDisplayMode(agent.id, "minimized");
      }
    },
    [agent.id, displayMode, setCardDisplayMode]
  );

  const handleMaximize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleHeaderDoubleClick();
    },
    [handleHeaderDoubleClick]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (agent.status === "running") {
        setShowCloseConfirm(true);
      } else {
        setIsExiting(true);
      }
    },
    [agent.status]
  );

  const confirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    setIsExiting(true);
  }, []);

  const handleAnimationEnd = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>) => {
      if (isExiting && e.animationName === "sg-card-exit") {
        removeAgent(agent.id);
      }
    },
    [isExiting, agent.id, removeAgent],
  );

  const getCardStyle = (): React.CSSProperties => {
    if (displayMode === "maximized") {
      return {
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        borderRadius: 0,
      };
    }

    return {
      left: agent.position.x,
      top: agent.position.y,
      width: agent.size.width,
      height: displayMode === "minimized" ? HEADER_HEIGHT : agent.size.height,
      zIndex: zOrder,
    };
  };

  const animationStyle: React.CSSProperties = {
    animation: !hasEntered
      ? undefined
      : isExiting
        ? "sg-card-exit 200ms var(--sg-ease-in) forwards"
        : "sg-card-enter 300ms var(--sg-ease-spring) forwards",
    transform: dragging ? "scale(1.02)" : undefined,
    boxShadow: dragging
      ? `var(--sg-shadow-card-dragging), 0 0 16px ${colorHex}40`
      : isSelected || isHovered
        ? `var(--sg-shadow-card), 0 0 12px ${colorHex}30`
        : "var(--sg-shadow-card)",
    transition: dragging
      ? "none"
      : "transform 150ms var(--sg-ease-out), box-shadow 200ms var(--sg-ease-in-out), border-color 200ms var(--sg-ease-in-out)",
    borderColor:
      dragging || isSelected || isHovered
        ? `${colorHex}80`
        : "var(--sg-border-secondary)",
  };

  return (
    <>
      <div
        ref={cardRef}
        className="absolute rounded-xl border overflow-hidden"
        style={{
          ...getCardStyle(),
          ...animationStyle,
          background: "var(--sg-bg-card)",
          cursor: hoverEdge ? getResizeCursor(hoverEdge) : undefined,
        }}
        onClick={() => selectAgent(agent.id)}
        onMouseDownCapture={() => bringAgentToFront(agent.id)}
        onAnimationEnd={handleAnimationEnd}
        onMouseMove={handleCardMouseMove}
        onMouseDown={handleCardMouseDown}
        onMouseLeave={() => {
          setHoverEdge(null);
          setIsHovered(false);
        }}
        onMouseEnter={() => {
          setIsHovered(true);
        }}
        data-agent-id={agent.id}
        data-agent-color={agent.color}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between cursor-move select-none"
          style={{
            height: HEADER_HEIGHT,
            padding: "10px 14px",
            background: "var(--sg-bg-card-header)",
            borderBottom:
              displayMode === "minimized"
                ? "none"
                : "1px solid var(--sg-border-secondary)",
          }}
          onMouseDown={handleDragStart}
          onDoubleClick={handleHeaderDoubleClick}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: colorHex,
                boxShadow: `0 0 6px ${colorHex}60`,
              }}
            />
            {isEditingName ? (
              <input
                ref={nameInputRef}
                className="text-xs font-semibold bg-transparent outline-none px-1 py-0.5 rounded min-w-[60px] max-w-[160px]"
                style={{
                  color: "var(--sg-text-primary)",
                  border: `1px solid ${colorHex}60`,
                }}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={confirmRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRename();
                  if (e.key === "Escape") cancelRename();
                  e.stopPropagation();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="text-xs font-semibold truncate max-w-[160px] cursor-text"
                style={{ color: "var(--sg-text-primary)" }}
                onDoubleClick={handleNameDoubleClick}
              >
                {agent.name}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide flex-shrink-0"
              style={{
                background: `${statusInfo.color}18`,
                color: statusInfo.color,
                transition: "all var(--sg-duration-slow) var(--sg-ease-in-out)",
              }}
            >
              {statusInfo.animate && (
                <PulsingDot
                  color={agent.status === "error" ? "red" : agent.status === "waiting" ? "yellow" : "green"}
                  size={4}
                />
              )}
              {t(statusInfo.key)}
            </span>
            {agent.cwd && (
              <span
                className="text-[10px] truncate max-w-[100px] flex-shrink-0"
                style={{ color: "var(--sg-text-hint)", marginLeft: "auto" }}
                title={agent.cwd}
              >
                {agent.cwd.split("/").pop() || ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              className="p-1 rounded-md hover:bg-white/5 transition-colors"
              style={{ color: "var(--sg-text-hint)" }}
              onClick={handleMinimize}
              title={displayMode === "minimized" ? t("card.expand") : t("card.minimize")}
            >
              {displayMode === "minimized" ? (
                <Maximize2 className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
            </button>
            <button
              className="p-1 rounded-md hover:bg-white/5 transition-colors"
              style={{ color: "var(--sg-text-hint)" }}
              onClick={handleMaximize}
              title={displayMode === "maximized" ? t("card.restore") : t("card.maximize")}
            >
              {displayMode === "maximized" ? (
                <Minimize2 className="w-3 h-3" />
              ) : (
                <Maximize2 className="w-3 h-3" />
              )}
            </button>
            <button
              className="p-1 rounded-md hover:bg-red-500/20 transition-colors"
              style={{ color: "var(--sg-text-hint)" }}
              onClick={handleClose}
              title={t("card.close")}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Resize 边框 */}
        {displayMode === "normal" && (
          <>
            <div className="absolute top-0 left-0 right-0 cursor-ns-resize" style={{ height: RESIZE_EDGE, zIndex: 10 }}
              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, "n"); }} />
            <div className="absolute bottom-0 left-0 right-0 cursor-ns-resize" style={{ height: RESIZE_EDGE, zIndex: 10 }}
              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, "s"); }} />
            <div className="absolute top-0 left-0 bottom-0 cursor-ew-resize" style={{ width: RESIZE_EDGE, zIndex: 10 }}
              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, "w"); }} />
            <div className="absolute top-0 right-0 bottom-0 cursor-ew-resize" style={{ width: RESIZE_EDGE, zIndex: 10 }}
              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, "e"); }} />
            <div className="absolute top-0 left-0 cursor-nwse-resize" style={{ width: RESIZE_EDGE * 2, height: RESIZE_EDGE * 2, zIndex: 11 }}
              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, "nw"); }} />
            <div className="absolute top-0 right-0 cursor-nesw-resize" style={{ width: RESIZE_EDGE * 2, height: RESIZE_EDGE * 2, zIndex: 11 }}
              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, "ne"); }} />
            <div className="absolute bottom-0 left-0 cursor-nesw-resize" style={{ width: RESIZE_EDGE * 2, height: RESIZE_EDGE * 2, zIndex: 11 }}
              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, "sw"); }} />
            <div className="absolute bottom-0 right-0 cursor-nwse-resize" style={{ width: RESIZE_EDGE * 2, height: RESIZE_EDGE * 2, zIndex: 11 }}
              onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, "se"); }} />
          </>
        )}

        {/*
         * 终端区域
         *
         * 最小化时用 display:none 隐藏，**不要**用 `{!minimized && ...}` 条件渲染：
         * 后者会 unmount TerminalView，useTerminal 的 cleanup 会调 closeTerminal
         * 发 SIGTERM/SIGKILL 杀掉 PTY 里跑的程序，展开时只能重开。
         * display:none 保持挂载，ResizeObserver 在 0 尺寸时由 fit() 的 guard 跳过。
         */}
        <div
          className="flex flex-col"
          style={{
            display: displayMode === "minimized" ? "none" : "flex",
            height:
              displayMode === "maximized"
                ? `calc(100% - ${HEADER_HEIGHT}px)`
                : agent.size.height - HEADER_HEIGHT,
            background: "var(--sg-bg-code)",
          }}
        >
          <div className="flex-1 min-h-0">
            <TerminalView
              terminalId={agent.terminalId}
              cwd={agent.cwd}
              agentId={agent.id}
              command={terminalCommand}
              onReady={handleTerminalReady}
              onExit={handleTerminalExit}
            />
          </div>
          {agent.status === "waiting" && agent.approvalMessage && (
            <div
              className="mx-2 mb-2 px-2.5 py-1.5 rounded"
              style={{
                background: "rgba(254, 188, 46, 0.1)",
                border: "1px solid rgba(254, 188, 46, 0.35)",
                color: "#febc2e",
                fontSize: "10px",
                fontFamily: "'SF Mono', monospace",
              }}
            >
              {agent.approvalMessage}
            </div>
          )}
        </div>
      </div>

      {/* 关闭确认对话框 — Portal 到 body，避免被卡片的 transform/z-index stacking context 遮挡 */}
      {showCloseConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setShowCloseConfirm(false)}
          >
            <div
              className="w-[340px] rounded-xl overflow-hidden"
              style={{
                background: "var(--sg-bg-card)",
                border: "1px solid var(--sg-border-secondary)",
                boxShadow: "var(--sg-shadow-2xl)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-5 py-4"
                style={{
                  background: "var(--sg-bg-card-header)",
                  borderBottom: "1px solid var(--sg-border-secondary)",
                }}
              >
                <h3
                  className="text-sm font-semibold"
                  style={{ color: "var(--sg-text-primary)" }}
                >
                  {t("card.confirmClose")}
                </h3>
              </div>
              <div className="p-5">
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--sg-text-tertiary)" }}
                >
                  {t("card.confirmCloseMessage", { name: agent.name })}
                </p>
              </div>
              <div
                className="flex items-center justify-end gap-3 px-5 py-4"
                style={{ borderTop: "1px solid var(--sg-border-secondary)" }}
              >
                <button
                  className="px-4 py-2 rounded-lg text-xs hover:bg-white/10 transition-colors"
                  style={{ color: "var(--sg-text-tertiary)" }}
                  onClick={() => setShowCloseConfirm(false)}
                >
                  {t("card.cancel")}
                </button>
                <button
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
                  onClick={confirmClose}
                >
                  {t("card.confirmCloseButton")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
