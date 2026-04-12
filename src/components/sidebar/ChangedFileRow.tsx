/**
 * 通用文件行组件 — FileTree / ChangesView / HistoryView 共用
 *
 * 像素规格：
 * - 行高 28px
 * - padding: 左 14 + depth*16，右 14
 * - 字体 13px，Geist UI
 * - Git 状态颜色：deleted 红/删除线、added 绿、untracked 斜体
 * - gitignore 灰色 #4a5263
 * - +X -Y 右对齐 10px SF Mono
 * - active-in-panel 蓝条 + 淡蓝背景
 * - Agent hover 关联高亮：背景渐变 + 颜色竖条
 */
import type { CSSProperties, ReactNode } from "react";
import { usePanelStore } from "@/stores/panelStore";
import { useProjectStore } from "@/stores/projectStore";
import { FileIcon } from "@/utils/fileIcon";

/** Agent 颜色到 HEX 值映射 */
export const AGENT_COLOR_HEX: Record<string, string> = {
  blue: "#4a9eff",
  orange: "#ff8c42",
  purple: "#a78bfa",
  green: "#22c55e",
  pink: "#ec4899",
  yellow: "#eab308",
  cyan: "#06b6d4",
  red: "#ef4444",
};

export interface ChangedFileRowProps {
  /** 完整路径（用于判断 active-in-panel / agent hover 命中） */
  fullPath: string;
  /** 显示的文件名 */
  name: string;
  /** 相对路径前缀（flat 模式下在文件名前显示的灰色路径；可选） */
  pathPrefix?: string;
  /** 是否目录 */
  isDir?: boolean;
  /** 是否展开（目录） */
  isOpen?: boolean;
  /** 缩进层级（每级 16px） */
  depth?: number;
  /** git 状态 */
  status?: "modified" | "added" | "deleted" | "untracked" | "renamed" | "unchanged";
  /** git diff 统计 */
  diffStat?: { additions: number; deletions: number };
  /** 是否被 gitignore */
  isGitIgnored?: boolean;
  /** agent 色（关联高亮用） */
  agentColor?: string;
  /** 右侧附加内容（可选，例如状态字母） */
  trailing?: ReactNode;
  /** 点击回调 */
  onClick?: (e: React.MouseEvent) => void;
  /** 自定义样式（覆盖 padding 等） */
  style?: CSSProperties;
}

const ROW_HEIGHT = 22;

export function ChangedFileRow({
  fullPath,
  name,
  pathPrefix,
  isDir,
  isOpen,
  depth = 0,
  status,
  diffStat,
  isGitIgnored,
  agentColor,
  trailing,
  onClick,
  style,
}: ChangedFileRowProps) {
  const activeTabId = usePanelStore((s) => s.activeTabId);
  const writingFiles = useProjectStore((s) => s.writingFiles);
  const hoveredAgentId = useProjectStore((s) => s.hoveredAgentId);
  const agentFileMap = useProjectStore((s) => s.agentFileMap);

  const isWriting = writingFiles.has(fullPath);
  const isActiveInPanel = !isDir && activeTabId === fullPath;

  const isHighlightedByAgent =
    hoveredAgentId !== null && agentFileMap[hoveredAgentId]?.includes(fullPath);
  const isDimmed = hoveredAgentId !== null && !isHighlightedByAgent;
  const highlightColor = isHighlightedByAgent
    ? AGENT_COLOR_HEX[agentColor ?? "blue"] ?? "#4a9eff"
    : undefined;

  const isDeleted = status === "deleted";
  const isAdded = status === "added";
  const isUntracked = status === "untracked";

  const basePaddingLeft = 14 + depth * 16;

  return (
    <div
      style={{
        height: ROW_HEIGHT,
        paddingLeft: basePaddingLeft,
        paddingRight: 14,
        paddingTop: 2,
        paddingBottom: 2,
        transition: "opacity 300ms ease, background 300ms ease",
        opacity: isDimmed ? 0.35 : 1,
        background: isHighlightedByAgent
          ? `linear-gradient(90deg, ${highlightColor}18 0%, transparent 100%)`
          : isActiveInPanel
            ? "rgba(74, 158, 255, 0.08)"
            : "transparent",
        position: "relative",
        ...style,
      }}
      className="flex items-center cursor-pointer hover:bg-white/[0.04]"
      onClick={onClick}
    >
      {/* 左侧 2px 颜色竖条 */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{
          width: isHighlightedByAgent || isActiveInPanel ? 2 : 0,
          backgroundColor: isHighlightedByAgent
            ? (highlightColor ?? "transparent")
            : isActiveInPanel
              ? "#4a9eff"
              : "transparent",
          boxShadow: isHighlightedByAgent ? `0 0 6px ${highlightColor}60` : "none",
          transition: "width 300ms ease, box-shadow 300ms ease",
        }}
      />

      <div className="flex items-center flex-1 min-w-0" style={{ gap: 6 }}>
        {/* Caret（仅目录） */}
        {isDir ? (
          <span
            className="flex-shrink-0 text-center leading-none select-none"
            style={{ color: "#6b7280", fontSize: 9, width: 10 }}
          >
            {isOpen ? "▼" : "▶"}
          </span>
        ) : (
          <span className="flex-shrink-0" style={{ width: 10 }} />
        )}

        {/* 图标 — vscode-icons 彩色 SVG，14px */}
        <span
          className="flex-shrink-0 inline-flex items-center justify-center"
          style={{ width: 14, height: 14 }}
        >
          <FileIcon name={name} isDir={!!isDir} isOpen={isOpen} size={14} />
        </span>

        {/* 相对路径前缀（flat 模式用） */}
        {pathPrefix && (
          <span
            className="truncate flex-shrink-0"
            style={{
              fontSize: 11,
              color: "#6b7280",
              fontFamily: "'SF Mono', Menlo, monospace",
              maxWidth: 110,
            }}
            title={pathPrefix}
          >
            {pathPrefix}
          </span>
        )}

        {/* 文件名 */}
        <span
          className="truncate"
          style={{
            fontSize: 13,
            color: isHighlightedByAgent || isActiveInPanel
              ? "#ffffff"
              : isGitIgnored
                ? "#4a5263"
                : isDeleted
                  ? "#ef4444"
                  : isAdded
                    ? "#22c55e"
                    : "#b8bcc4",
            fontStyle: isUntracked ? "italic" : "normal",
            textDecoration: isDeleted ? "line-through" : "none",
            fontWeight: isHighlightedByAgent ? 600 : isActiveInPanel ? 500 : 400,
            transition: "color 300ms ease, font-weight 300ms ease",
          }}
        >
          {name}
        </span>

        {/* 写入脉动 */}
        {isWriting && (
          <span className="flex-shrink-0">
            <span className="writing-pulse" />
          </span>
        )}

        {/* 右侧状态栏：diff 统计优先，否则用状态字母 badge */}
        {!isDir && (() => {
          const hasDiff = diffStat && (diffStat.additions > 0 || diffStat.deletions > 0);
          if (hasDiff) {
            return (
              <span
                className="ml-auto flex items-center flex-shrink-0 tabular-nums"
                style={{ gap: 4, fontSize: 10, fontFamily: "'SF Mono', Menlo, monospace" }}
              >
                {diffStat!.additions > 0 && <span style={{ color: "#22c55e" }}>+{diffStat!.additions}</span>}
                {diffStat!.deletions > 0 && <span style={{ color: "#ef4444" }}>-{diffStat!.deletions}</span>}
              </span>
            );
          }
          // 无 diff 数据时显示状态字母
          const badge = statusBadge(status);
          if (badge) {
            return (
              <span
                className="ml-auto flex items-center justify-center flex-shrink-0"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: "'SF Mono', Menlo, monospace",
                  backgroundColor: badge.bg,
                  color: badge.color,
                  letterSpacing: 0,
                }}
                title={badge.label}
              >
                {badge.letter}
              </span>
            );
          }
          return null;
        })()}

        {/* Agent 颜色标记圆点 */}
        {agentColor && !isWriting && !diffStat && (
          <span
            className="w-2 h-2 rounded-full ml-auto flex-shrink-0"
            style={{
              backgroundColor: AGENT_COLOR_HEX[agentColor] ?? "#4a9eff",
              boxShadow: isHighlightedByAgent
                ? `0 0 6px ${AGENT_COLOR_HEX[agentColor]}80`
                : "none",
              transition: "box-shadow 300ms ease",
            }}
          />
        )}

        {trailing}
      </div>
    </div>
  );
}

/** 文件状态字母 badge 配置 */
function statusBadge(
  status: ChangedFileRowProps["status"],
): { letter: string; label: string; bg: string; color: string } | null {
  switch (status) {
    case "added":
      return { letter: "A", label: "Added", bg: "rgba(34, 197, 94, 0.16)", color: "#22c55e" };
    case "deleted":
      return { letter: "D", label: "Deleted", bg: "rgba(239, 68, 68, 0.16)", color: "#ef4444" };
    case "modified":
      return { letter: "M", label: "Modified", bg: "rgba(74, 158, 255, 0.16)", color: "#4a9eff" };
    case "untracked":
      return { letter: "U", label: "Untracked", bg: "rgba(6, 182, 212, 0.16)", color: "#06b6d4" };
    case "renamed":
      return { letter: "R", label: "Renamed", bg: "rgba(234, 179, 8, 0.16)", color: "#eab308" };
    default:
      return null;
  }
}

export { ROW_HEIGHT };
