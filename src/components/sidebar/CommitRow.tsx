/**
 * Commit 行组件 — History 视图的 commit 列表项
 *
 * 布局（高度 32px）：
 * - 最左：分支图 SVG 列（CommitGraphColumn）
 * - short hash（mono 11px #8b92a3）
 * - 分支/tag badges（可选）
 * - message（13px #b8bcc4 truncate）
 * - 右：相对时间（9px #6b7280）
 *
 * 交互：
 * - 单击 → single 选择
 * - Cmd/Ctrl+Click → toggle
 * - Shift+Click → range
 */
import type { GitLogEntry } from "@/services/git";
import type { GraphNode } from "@/lib/commitGraph";
import { CommitGraphColumn } from "./CommitGraphColumn";

interface CommitRowProps {
  entry: GitLogEntry;
  selected: boolean;
  graphNode?: GraphNode;
  onClick: (e: React.MouseEvent, hash: string) => void;
}

export function CommitRow({ entry, selected, graphNode, onClick }: CommitRowProps) {
  const relTime = formatRelativeTime(entry.timestamp);
  const parsedRefs = parseRefs(entry.refs);

  return (
    <div
      className="flex items-center cursor-pointer select-none"
      style={{
        height: 32,
        paddingLeft: 8,
        paddingRight: 10,
        gap: 6,
        background: selected ? "rgba(74, 158, 255, 0.12)" : "transparent",
        borderLeft: selected ? "2px solid #4a9eff" : "2px solid transparent",
        transition: "background 150ms ease, border-color 150ms ease",
      }}
      onClick={(e) => onClick(e, entry.hash)}
    >
      {/* 分支图列 */}
      {graphNode && <CommitGraphColumn node={graphNode} selected={selected} />}

      {/* Short hash */}
      <span
        className="flex-shrink-0 tabular-nums"
        style={{
          fontSize: 10,
          color: selected ? "#4a9eff" : "#6b7280",
          fontFamily: "'SF Mono', Menlo, monospace",
          fontWeight: selected ? 600 : 400,
        }}
      >
        {entry.shortHash}
      </span>

      {/* 分支/tag badges（最多 2 个） */}
      {parsedRefs.slice(0, 2).map((r, i) => (
        <span
          key={i}
          className="flex-shrink-0"
          style={{
            fontSize: 8,
            padding: "1px 5px",
            borderRadius: 3,
            fontFamily: "'SF Mono', Menlo, monospace",
            fontWeight: 600,
            letterSpacing: 0.1,
            backgroundColor: r.isHead ? "rgba(74,158,255,0.18)" : "rgba(255,255,255,0.06)",
            color: r.isHead ? "#4a9eff" : r.isTag ? "#eab308" : "#8b92a3",
            border: r.isHead ? "1px solid rgba(74,158,255,0.5)" : "1px solid transparent",
            maxWidth: 60,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={r.name}
        >
          {r.isTag ? `🏷 ${r.shortName}` : r.shortName}
        </span>
      ))}

      {/* Message */}
      <span
        className="flex-1 min-w-0 truncate"
        style={{
          fontSize: 12,
          color: selected ? "#e4e6eb" : "#b8bcc4",
          fontWeight: selected ? 500 : 400,
        }}
      >
        {entry.message}
      </span>

      {/* 相对时间 */}
      <span className="flex-shrink-0" style={{ fontSize: 9, color: "#6b7280" }}>
        {relTime}
      </span>
    </div>
  );
}

/** 解析 git refs 装饰字符串 */
interface ParsedRef {
  name: string;
  shortName: string;
  isHead: boolean;
  isTag: boolean;
}

function parseRefs(refs: string[]): ParsedRef[] {
  return refs.map((ref) => {
    const isHead = ref.startsWith("HEAD ->") || ref === "HEAD";
    const isTag = ref.startsWith("tag:");
    let name = ref;
    if (isHead) {
      name = ref.replace(/^HEAD ->\s*/, "").trim() || "HEAD";
    } else if (isTag) {
      name = ref.replace(/^tag:\s*/, "").trim();
    }
    const shortName = name.replace(/^origin\//, "").replace(/^refs\/heads\//, "");
    return { name, shortName, isHead, isTag };
  });
}

function formatRelativeTime(unix: number): string {
  const now = Date.now() / 1000;
  const diff = now - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo`;
  return `${Math.floor(diff / 31536000)}y`;
}
