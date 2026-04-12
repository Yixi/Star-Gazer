/**
 * Commit 行组件 — History 视图的 commit 列表项
 *
 * 布局（高度 32px）：
 * - 左：◉/○ 选中标记（11px）
 * - 7 字符 short hash（mono 11px #8b92a3）
 * - message（13px #b8bcc4 truncate，占用剩余空间）
 * - 右下：相对时间（9px #6b7280）
 *
 * 交互：
 * - 单击 → single 选择
 * - Cmd/Ctrl+Click → toggle
 * - Shift+Click → range
 */
import type { GitLogEntry } from "@/services/git";

interface CommitRowProps {
  entry: GitLogEntry;
  selected: boolean;
  onClick: (e: React.MouseEvent, hash: string) => void;
}

export function CommitRow({ entry, selected, onClick }: CommitRowProps) {
  const relTime = formatRelativeTime(entry.timestamp);

  return (
    <div
      className="flex items-center cursor-pointer select-none"
      style={{
        height: 32,
        padding: "0 14px",
        gap: 8,
        background: selected ? "rgba(74, 158, 255, 0.10)" : "transparent",
        borderLeft: selected ? "2px solid #4a9eff" : "2px solid transparent",
        transition: "background 150ms ease, border-color 150ms ease",
      }}
      onClick={(e) => onClick(e, entry.hash)}
    >
      {/* 选中指示圆圈 */}
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          border: `1.5px solid ${selected ? "#4a9eff" : "#3a4150"}`,
          backgroundColor: selected ? "#4a9eff" : "transparent",
          transition: "all 150ms ease",
        }}
      />

      {/* Short hash */}
      <span
        className="flex-shrink-0 tabular-nums"
        style={{
          fontSize: 11,
          color: selected ? "#4a9eff" : "#8b92a3",
          fontFamily: "'SF Mono', Menlo, monospace",
          fontWeight: selected ? 600 : 400,
        }}
      >
        {entry.shortHash}
      </span>

      {/* Message */}
      <span
        className="flex-1 min-w-0 truncate"
        style={{
          fontSize: 13,
          color: selected ? "#e4e6eb" : "#b8bcc4",
          fontWeight: selected ? 500 : 400,
        }}
      >
        {entry.message}
      </span>

      {/* 相对时间 */}
      <span
        className="flex-shrink-0"
        style={{ fontSize: 9, color: "#6b7280" }}
      >
        {relTime}
      </span>
    </div>
  );
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
