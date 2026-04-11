/**
 * Agent 终端卡片 - 画布上的可拖拽卡片
 * 包含 Agent 标题栏和嵌入的 xterm.js 终端
 */
import { useRef, useCallback } from "react";
import { GripHorizontal, X, Minimize2, Maximize2 } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";
import { AGENT_COLORS } from "@/lib/colors";
import { TerminalView } from "@/components/terminal/TerminalView";
import type { Agent } from "@/types/agent";

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const { selectedAgentId, selectAgent, updateAgentPosition, removeAgent } =
    useCanvasStore();
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const colors = AGENT_COLORS[agent.color];
  const isSelected = selectedAgentId === agent.id;

  /** 卡片拖拽 */
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      isDragging.current = true;
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
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [agent.id, agent.position, selectAgent, updateAgentPosition]
  );

  return (
    <div
      className={`absolute rounded-lg border-2 bg-card shadow-lg overflow-hidden ${
        isSelected ? colors.border : "border-border"
      }`}
      style={{
        left: agent.position.x,
        top: agent.position.y,
        width: agent.size.width,
        height: agent.size.height,
      }}
      onClick={() => selectAgent(agent.id)}
    >
      {/* 标题栏 */}
      <div
        className={`flex items-center justify-between px-2 py-1 ${colors.bg} cursor-move`}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-3 h-3 text-muted-foreground" />
          <span className={`text-xs font-medium ${colors.text}`}>
            {agent.name}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
          >
            {agent.status}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button className="p-0.5 rounded hover:bg-accent/50">
            <Minimize2 className="w-3 h-3 text-muted-foreground" />
          </button>
          <button className="p-0.5 rounded hover:bg-accent/50">
            <Maximize2 className="w-3 h-3 text-muted-foreground" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-destructive/50"
            onClick={(e) => {
              e.stopPropagation();
              removeAgent(agent.id);
            }}
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* 终端区域 */}
      <div className="flex-1 h-[calc(100%-28px)]">
        <TerminalView terminalId={agent.terminalId} cwd={agent.cwd} />
      </div>
    </div>
  );
}
