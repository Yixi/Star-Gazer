/**
 * 文件树节点组件
 *
 * Hover 关联高亮效果：
 * - 当 Agent 卡片被悬停时，该 Agent 修改的文件会高亮
 * - 高亮样式：背景渐变 + 左侧 2px 颜色竖条 + 文件名白色加粗
 * - 其他文件变暗到 35% 透明度
 * - 离开时 300ms transition 平滑恢复
 */
import { useState } from "react";
import { ChevronRight, File, FolderOpen, Folder } from "lucide-react";
import { usePanelStore } from "@/stores/panelStore";
import { useHoverStore } from "@/stores/hoverStore";
import type { FileNode as FileNodeType } from "@/types/project";

interface FileNodeProps {
  node: FileNodeType;
  depth: number;
}

/** Git 状态颜色映射 */
const GIT_STATUS_COLORS: Record<string, string> = {
  modified: "text-agent-yellow",
  added: "text-agent-green",
  deleted: "text-agent-red",
  untracked: "text-agent-cyan",
  conflicted: "text-agent-orange",
};

/** Agent 颜色到 HEX 值 */
const AGENT_COLOR_HEX: Record<string, string> = {
  blue: "#4a9eff",
  orange: "#ff8c42",
  purple: "#a78bfa",
  green: "#22c55e",
  pink: "#ec4899",
  yellow: "#eab308",
  cyan: "#06b6d4",
  red: "#ef4444",
};

export function FileNode({ node, depth }: FileNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const openTab = usePanelStore((s) => s.openTab);

  /* 从 hover store 获取关联高亮状态 */
  const hoveredAgentColor = useHoverStore((s) => s.hoveredAgentColor);
  const hoveredAgentId = useHoverStore((s) => s.hoveredAgentId);

  /* 判断文件是否被当前悬停的 Agent 修改 */
  const isHighlighted =
    hoveredAgentId !== null &&
    node.agentColor !== undefined &&
    node.agentColor === hoveredAgentColor;

  /* 判断是否需要变暗（有 agent 悬停但当前文件不属于该 agent） */
  const isDimmed = hoveredAgentId !== null && !isHighlighted;

  /* 高亮颜色 */
  const highlightColor = isHighlighted
    ? AGENT_COLOR_HEX[node.agentColor ?? "blue"]
    : undefined;

  const handleClick = () => {
    if (node.isDir) {
      setExpanded(!expanded);
    } else {
      openTab({
        id: node.path,
        title: node.name,
        type: "file",
        filePath: node.path,
        isDirty: false,
      });
    }
  };

  const statusColor = node.gitStatus
    ? GIT_STATUS_COLORS[node.gitStatus] ?? ""
    : "";

  return (
    <div>
      <button
        className={`w-full flex items-center gap-1 px-1 py-0.5 rounded-sm text-sm hover:bg-accent/50 ${statusColor}`}
        style={{
          paddingLeft: `${depth * 16 + 4}px`,
          position: "relative",
          /* 关联高亮 — 300ms 平滑过渡 */
          transition:
            "opacity 300ms var(--sg-ease-in-out), background 300ms var(--sg-ease-in-out)",
          /* 高亮时的背景渐变 */
          background: isHighlighted
            ? `linear-gradient(90deg, ${highlightColor}15 0%, transparent 100%)`
            : undefined,
          /* 变暗效果 */
          opacity: isDimmed ? 0.35 : 1,
        }}
        onClick={handleClick}
      >
        {/* 左侧颜色竖条 — 仅高亮文件显示 */}
        {isHighlighted && (
          <span
            className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full"
            style={{
              backgroundColor: highlightColor,
              boxShadow: `0 0 4px ${highlightColor}60`,
            }}
          />
        )}

        {node.isDir && (
          <ChevronRight
            className={`w-3 h-3 transition-transform flex-shrink-0 ${
              expanded ? "rotate-90" : ""
            }`}
          />
        )}
        {node.isDir ? (
          expanded ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0" />
          )
        ) : (
          <File className="w-4 h-4 flex-shrink-0 ml-3" />
        )}
        <span
          className="truncate"
          style={{
            /* 高亮文件白色加粗 */
            color: isHighlighted ? "#ffffff" : undefined,
            fontWeight: isHighlighted ? 500 : undefined,
            transition: "color 300ms var(--sg-ease-in-out), font-weight 300ms var(--sg-ease-in-out)",
          }}
        >
          {node.name}
        </span>
        {/* Agent 颜色标记 */}
        {node.agentColor && (
          <span
            className="w-2 h-2 rounded-full ml-auto flex-shrink-0"
            style={{
              backgroundColor: AGENT_COLOR_HEX[node.agentColor] ?? `var(--color-agent-${node.agentColor})`,
              boxShadow: isHighlighted
                ? `0 0 6px ${AGENT_COLOR_HEX[node.agentColor]}80`
                : undefined,
              transition: "box-shadow 300ms var(--sg-ease-in-out)",
            }}
          />
        )}
      </button>
      {expanded &&
        node.children?.map((child) => (
          <FileNode key={child.id} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}
