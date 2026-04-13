/**
 * Commit / Push / Pull / Sync 操作条
 *
 * 参考 VSCode Source Control 面板：
 * - 顶栏：分支名 + ahead/behind 角标 + 同步按钮（pull+push）+ fetch 按钮
 * - Message 多行输入框（⌘↩ 提交，placeholder 含分支名）
 * - 主按钮 = 状态机：
 *   · 有 changes → "Commit"
 *   · 无 changes + ahead/behind 任一 > 0 → "Sync Changes ↓N ↑M"
 *   · 完全干净 → 禁用
 *
 * 行为：
 * - Commit 后端会 smart-stage：若无 staged 改动自动 `git add -A`
 * - Sync 等价于 pull --ff-only 后 push（任何一步失败都会回报）
 * - Fetch 只跑 `git fetch --all --prune`，更新 ahead/behind 显示但不动 HEAD
 * - 任何操作完成后立即拉一次 gitStatus 写回 store，避免 2s 轮询的延迟感
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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

/** 主按钮派生状态 */
type Primary =
  | { kind: "commit" }
  | { kind: "sync"; ahead: number; behind: number }
  | { kind: "idle" };

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

  /**
   * 主按钮状态机 — 模仿 VSCode SCM actionButton 派生：
   * - 有改动：commit（即使同时也有 ahead/behind，也优先让用户先提交）
   * - 无改动 + ahead/behind 任一 > 0：sync（pull + push）
   * - 完全干净：idle（按钮 disabled）
   */
  const primary: Primary = useMemo(() => {
    if (hasChanges) return { kind: "commit" };
    if (ahead > 0 || behind > 0) return { kind: "sync", ahead, behind };
    return { kind: "idle" };
  }, [hasChanges, ahead, behind]);

  // commit 需要非空 message；sync 不需要任何输入
  const canPrimary =
    busy === null &&
    (primary.kind === "commit"
      ? !!message.trim()
      : primary.kind === "sync");

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
    if (busy !== null || !message.trim() || !hasChanges) return;
    runWithBusy("commit", async () => {
      await gitCommit(project.path, message);
      setMessage("");
    });
  }, [busy, message, hasChanges, project.path, runWithBusy]);

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

  /** 主按钮 — 根据状态机分发 */
  const handlePrimary = useCallback(() => {
    if (!canPrimary) return;
    if (primary.kind === "commit") handleCommit();
    else if (primary.kind === "sync") handleSync();
  }, [canPrimary, primary.kind, handleCommit, handleSync]);

  // ⌘↩ / Ctrl+Enter 触发主按钮（commit 或 sync，由当前状态决定）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePrimary();
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

      {/* Message 输入框 — 默认单行高度，输入多行时浏览器自动滚动；用户也可以手动 resize */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`Message (⌘⏎ to commit on "${branch}")`}
        rows={1}
        spellCheck={false}
        style={{
          width: "100%",
          resize: "none",
          padding: "5px 8px",
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: "inherit",
          color: "#e4e6eb",
          background: "#0e1017",
          border: "1px solid #1f232c",
          borderRadius: 4,
          outline: "none",
          minHeight: 26,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#4a9eff";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "#1f232c";
        }}
      />

      {/* 主按钮 — 状态机派生：commit / sync changes / idle */}
      <PrimaryButton
        primary={primary}
        canPrimary={canPrimary}
        busy={busy}
        onClick={handlePrimary}
      />

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

/** 主按钮 — 根据 primary 状态机渲染不同 label / icon / 行为 */
function PrimaryButton({
  primary,
  canPrimary,
  busy,
  onClick,
}: {
  primary: Primary;
  canPrimary: boolean;
  busy: BusyKind;
  onClick: () => void;
}) {
  // 文字 + 图标 + busy 判定
  const isBusy =
    (primary.kind === "commit" && busy === "commit") ||
    (primary.kind === "sync" && busy === "sync");

  let label: React.ReactNode;
  let icon: React.ReactNode;
  if (primary.kind === "commit") {
    label = "Commit";
    icon = <Check className="w-3 h-3" />;
  } else if (primary.kind === "sync") {
    // VSCode 风格："Sync Changes ↓N ↑M" — 没有的方向不显示
    const parts: string[] = [];
    if (primary.behind > 0) parts.push(`↓${primary.behind}`);
    if (primary.ahead > 0) parts.push(`↑${primary.ahead}`);
    label = (
      <>
        Sync Changes
        {parts.length > 0 && (
          <span
            className="tabular-nums"
            style={{ marginLeft: 4, opacity: 0.85 }}
          >
            {parts.join(" ")}
          </span>
        )}
      </>
    );
    icon = <RefreshCw className="w-3 h-3" />;
  } else {
    // idle — 按钮在视觉上保持 commit 形态但完全 disabled
    label = "Commit";
    icon = <Check className="w-3 h-3" />;
  }

  return (
    <button
      onClick={onClick}
      disabled={!canPrimary}
      className="flex items-center justify-center transition-colors"
      style={{
        height: 26,
        fontSize: 12,
        fontWeight: 500,
        color: canPrimary ? "#e4e6eb" : "#6b7280",
        background: canPrimary
          ? "rgba(74, 158, 255, 0.18)"
          : "rgba(255, 255, 255, 0.04)",
        border: `1px solid ${
          canPrimary ? "rgba(74, 158, 255, 0.3)" : "#1f232c"
        }`,
        borderRadius: 4,
        gap: 6,
      }}
      onMouseEnter={(e) => {
        if (canPrimary)
          e.currentTarget.style.background = "rgba(74, 158, 255, 0.28)";
      }}
      onMouseLeave={(e) => {
        if (canPrimary)
          e.currentTarget.style.background = "rgba(74, 158, 255, 0.18)";
      }}
    >
      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
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
