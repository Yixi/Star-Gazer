/**
 * Commit / Push / Pull / Sync 操作条
 *
 * 参考 VSCode Source Control 面板：
 * - 顶栏：分支名 + ahead/behind 角标 + 同步按钮（pull+push）+ fetch 按钮
 * - Message 多行输入框（⌘↩ 提交，placeholder 含分支名）
 * - Commit 主按钮（无 message 或无改动时禁用）
 *
 * 行为：
 * - Commit 后端会 smart-stage：若无 staged 改动自动 `git add -A`
 * - Sync 等价于 pull --ff-only 后 push（任何一步失败都会回报）
 * - Fetch 只跑 `git fetch --all --prune`，更新 ahead/behind 显示但不动 HEAD
 * - 任何操作完成后立即调用 useProjectGitSync 暴露的 refresh，让状态条同步
 */
import { useCallback, useEffect, useState } from "react";
import {
  GitBranch,
  RefreshCw,
  RotateCw,
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import {
  gitCommit,
  gitPush,
  gitPull,
  gitFetch,
  gitStatus,
} from "@/services/git";
import type { Project } from "@/types/project";

interface CommitBarProps {
  project: Project;
}

type BusyKind = "commit" | "sync" | "fetch" | null;

export function CommitBar({ project }: CommitBarProps) {
  const status = useProjectStore((s) => s.gitStatusByProject[project.id]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<BusyKind>(null);
  const [error, setError] = useState<string | null>(null);

  // 切项目时清空草稿（不同项目的 commit message 不应该串）
  useEffect(() => {
    setMessage("");
    setError(null);
  }, [project.id]);

  const branch = status?.branch || "—";
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;

  // 判定是否有可提交的改动：staged / unstaged / untracked 任一非空
  const hasChanges =
    !!status &&
    (status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.untracked.length > 0);

  const canCommit = !!message.trim() && hasChanges && busy === null;

  const runWithBusy = useCallback(
    async (kind: Exclude<BusyKind, null>, fn: () => Promise<void>) => {
      setBusy(kind);
      setError(null);
      try {
        await fn();
        // 操作成功后立即刷新 git 状态，避免依赖 2s 轮询的延迟感
        try {
          const next = await gitStatus(project.path);
          useProjectStore.getState().setGitStatus(project.id, next);
        } catch {
          // 忽略：轮询会兜底
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.trim() || "操作失败");
      } finally {
        setBusy(null);
      }
    },
    [project.id, project.path],
  );

  const handleCommit = useCallback(() => {
    if (!canCommit) return;
    runWithBusy("commit", async () => {
      await gitCommit(project.path, message);
      setMessage("");
    });
  }, [canCommit, message, project.path, runWithBusy]);

  const handleSync = useCallback(() => {
    runWithBusy("sync", async () => {
      // pull 然后 push —— 任一步失败立即报错，不掩盖
      await gitPull(project.path);
      // ahead === 0 时 push 也是 no-op，不必判断
      await gitPush(project.path);
    });
  }, [project.path, runWithBusy]);

  const handleFetch = useCallback(() => {
    runWithBusy("fetch", async () => {
      await gitFetch(project.path);
    });
  }, [project.path, runWithBusy]);

  // ⌘↩ / Ctrl+Enter 提交快捷键
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <div
      className="flex flex-col flex-shrink-0 select-none"
      style={{
        padding: "8px 12px 10px",
        borderBottom: "1px solid #161820",
        background: "#0b0c11",
        gap: 6,
      }}
    >
      {/* 顶栏：分支 + ahead/behind + sync/fetch 操作 */}
      <div className="flex items-center justify-between" style={{ gap: 6 }}>
        <div
          className="flex items-center min-w-0"
          style={{ gap: 4, fontSize: 11, color: "#8b92a3" }}
          title={branch}
        >
          <GitBranch className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{branch}</span>
          {behind > 0 && (
            <span
              className="flex items-center tabular-nums"
              style={{ color: "#8b92a3", marginLeft: 2 }}
              title={`${behind} 个 commit 落后于上游`}
            >
              <ArrowDown className="w-2.5 h-2.5" />
              {behind}
            </span>
          )}
          {ahead > 0 && (
            <span
              className="flex items-center tabular-nums"
              style={{ color: "#8b92a3" }}
              title={`${ahead} 个本地 commit 未推送`}
            >
              <ArrowUp className="w-2.5 h-2.5" />
              {ahead}
            </span>
          )}
        </div>

        <div className="flex items-center" style={{ gap: 2 }}>
          <IconButton
            title={
              ahead > 0 || behind > 0
                ? `同步 (pull ${behind} ↓ / push ${ahead} ↑)`
                : "同步（pull + push）"
            }
            onClick={handleSync}
            disabled={busy !== null}
            spinning={busy === "sync"}
          >
            <RefreshCw className="w-3 h-3" />
          </IconButton>
          <IconButton
            title="Fetch 远端（更新 ahead/behind 显示）"
            onClick={handleFetch}
            disabled={busy !== null}
            spinning={busy === "fetch"}
          >
            <RotateCw className="w-3 h-3" />
          </IconButton>
        </div>
      </div>

      {/* Message 输入框 */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Message (⌘⏎ to commit on "${branch}")`}
        rows={2}
        spellCheck={false}
        style={{
          width: "100%",
          resize: "none",
          padding: "6px 8px",
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: "inherit",
          color: "#e4e6eb",
          background: "#0e1017",
          border: "1px solid #1f232c",
          borderRadius: 4,
          outline: "none",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#4a9eff";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "#1f232c";
        }}
      />

      {/* Commit 按钮 */}
      <button
        onClick={handleCommit}
        disabled={!canCommit}
        className="flex items-center justify-center transition-colors"
        style={{
          height: 26,
          fontSize: 12,
          fontWeight: 500,
          color: canCommit ? "#e4e6eb" : "#6b7280",
          background: canCommit
            ? "rgba(74, 158, 255, 0.18)"
            : "rgba(255, 255, 255, 0.04)",
          border: `1px solid ${
            canCommit ? "rgba(74, 158, 255, 0.3)" : "#1f232c"
          }`,
          borderRadius: 4,
          gap: 6,
        }}
        onMouseEnter={(e) => {
          if (canCommit)
            e.currentTarget.style.background = "rgba(74, 158, 255, 0.28)";
        }}
        onMouseLeave={(e) => {
          if (canCommit)
            e.currentTarget.style.background = "rgba(74, 158, 255, 0.18)";
        }}
      >
        {busy === "commit" ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Check className="w-3 h-3" />
        )}
        Commit
      </button>

      {/* 错误反馈 */}
      {error && (
        <div
          style={{
            fontSize: 10,
            lineHeight: 1.4,
            color: "#ef4444",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: 3,
            padding: "4px 6px",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
            maxHeight: 80,
            overflow: "auto",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

/** 顶栏图标按钮 — 24x20 命中区，busy 时显示 spinning */
function IconButton({
  children,
  title,
  onClick,
  disabled,
  spinning,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center transition-colors"
      style={{
        width: 22,
        height: 20,
        borderRadius: 3,
        color: disabled ? "#4a5263" : "#8b92a3",
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {spinning ? <Loader2 className="w-3 h-3 animate-spin" /> : children}
    </button>
  );
}
