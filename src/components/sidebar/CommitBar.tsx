/**
 * Commit / Push / Pull / Sync 操作 — 拆为两段渲染
 *
 * 视觉布局参考 VSCode SCM：
 * - CommitHeader：分支名 + ahead/behind 角标 + sync/fetch 图标按钮
 *   渲染在变更文件列表上方（项目头紧下方），始终显示
 * - CommitForm：Message 多行输入 + 主按钮 + 错误反馈
 *   渲染在变更文件列表下方
 *
 * 状态由 `useCommitController(project)` 集中托管，两个子组件共享同一份。
 *
 * 主按钮状态机：
 * - 有 changes → "Commit"
 * - 无 changes + ahead/behind 任一 > 0 → "Sync Changes ↓N ↑M"
 * - 完全干净 → 禁用
 *
 * 行为：
 * - Commit 后端会 smart-stage：若无 staged 改动自动 `git add -A`
 * - Sync 等价于 pull --rebase 后 push（diverged 时把本地 commits rebase 到远端之上）
 * - Fetch 只跑 `git fetch --all --prune`，更新 ahead/behind 显示但不动 HEAD
 * - 任何操作完成后立即拉一次 gitStatus，避免 2s 轮询的延迟感
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

type BusyKind = "commit" | "sync" | "fetch" | null;

/** 主按钮派生状态 */
type Primary =
  | { kind: "commit" }
  | { kind: "sync"; ahead: number; behind: number }
  | { kind: "idle" };

export interface CommitController {
  branch: string;
  ahead: number;
  behind: number;
  message: string;
  setMessage: (v: string) => void;
  busy: BusyKind;
  error: string | null;
  primary: Primary;
  canPrimary: boolean;
  handlePrimary: () => void;
  handleSync: () => void;
  handleFetch: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function useCommitController(project: Project): CommitController {
  const { t } = useTranslation();
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

  const hasChanges =
    !!status &&
    (status.staged.length > 0 ||
      status.unstaged.length > 0 ||
      status.untracked.length > 0);

  const primary: Primary = useMemo(() => {
    if (hasChanges) return { kind: "commit" };
    if (ahead > 0 || behind > 0) return { kind: "sync", ahead, behind };
    return { kind: "idle" };
  }, [hasChanges, ahead, behind]);

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
        try {
          const next = await gitStatus(project.path);
          useProjectStore.getState().setGitStatus(project.id, next);
        } catch {
          // 忽略：轮询会兜底
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.trim() || t("error.operationFailed"));
      } finally {
        setBusy(null);
      }
    },
    [project.id, project.path, t],
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
      await gitPull(project.path);
      await gitPush(project.path);
    });
  }, [project.path, runWithBusy]);

  const handleFetch = useCallback(() => {
    runWithBusy("fetch", async () => {
      await gitFetch(project.path);
    });
  }, [project.path, runWithBusy]);

  const handlePrimary = useCallback(() => {
    if (!canPrimary) return;
    if (primary.kind === "commit") handleCommit();
    else if (primary.kind === "sync") handleSync();
  }, [canPrimary, primary.kind, handleCommit, handleSync]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePrimary();
    }
  };

  return {
    branch,
    ahead,
    behind,
    message,
    setMessage,
    busy,
    error,
    primary,
    canPrimary,
    handlePrimary,
    handleSync,
    handleFetch,
    handleKeyDown,
  };
}

/** 顶栏：分支 + ahead/behind + sync/fetch — 渲染在变更列表上方 */
export function CommitHeader({ controller }: { controller: CommitController }) {
  const { t } = useTranslation();
  const { branch, ahead, behind, busy, handleSync, handleFetch } = controller;

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 select-none"
      style={{
        padding: "6px 12px",
        borderBottom: "1px solid var(--sg-border-primary)",
        background: "var(--sg-bg-elevated)",
        gap: 6,
      }}
    >
      <div
        className="flex items-center min-w-0"
        style={{ gap: 4, fontSize: 11, color: "var(--sg-text-tertiary)" }}
        title={branch}
      >
        <GitBranch className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">{branch}</span>
        {behind > 0 && (
          <span
            className="flex items-center tabular-nums"
            style={{ color: "var(--sg-text-tertiary)", marginLeft: 2 }}
            title={t("git.behindTooltip", { count: behind })}
          >
            <ArrowDown className="w-2.5 h-2.5" />
            {behind}
          </span>
        )}
        {ahead > 0 && (
          <span
            className="flex items-center tabular-nums"
            style={{ color: "var(--sg-text-tertiary)" }}
            title={t("git.aheadTooltip", { count: ahead })}
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
              ? t("git.syncWithCounts", { behind, ahead })
              : t("git.syncTooltip")
          }
          onClick={handleSync}
          disabled={busy !== null}
          spinning={busy === "sync"}
        >
          <RefreshCw className="w-3 h-3" />
        </IconButton>
        <IconButton
          title={t("git.fetchTooltip")}
          onClick={handleFetch}
          disabled={busy !== null}
          spinning={busy === "fetch"}
        >
          <RotateCw className="w-3 h-3" />
        </IconButton>
      </div>
    </div>
  );
}

/** Message 表单 + 主按钮 + 错误反馈 — 渲染在变更列表下方 */
export function CommitForm({ controller }: { controller: CommitController }) {
  const { t } = useTranslation();
  const {
    branch,
    message,
    setMessage,
    busy,
    error,
    primary,
    canPrimary,
    handlePrimary,
    handleKeyDown,
  } = controller;

  return (
    <div
      className="flex flex-col flex-shrink-0 select-none"
      style={{
        padding: "8px 12px 10px",
        borderTop: "1px solid var(--sg-border-primary)",
        background: "var(--sg-bg-elevated)",
        gap: 6,
      }}
    >
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("git.commitPlaceholder", { branch })}
        rows={1}
        spellCheck={false}
        style={{
          width: "100%",
          resize: "none",
          padding: "5px 8px",
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: "inherit",
          color: "var(--sg-text-primary)",
          /* 容器已经是 sg-bg-elevated（浮起来的层），textarea 用同色 + 1px 边框
             让它"溶进"容器，避免嵌套出黑色块；focus 时才高亮边框 */
          background: "transparent",
          border: "1px solid var(--sg-border-primary)",
          borderRadius: 4,
          outline: "none",
          minHeight: 26,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--sg-accent)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--sg-border-primary)";
        }}
      />

      <PrimaryButton
        primary={primary}
        canPrimary={canPrimary}
        busy={busy}
        onClick={handlePrimary}
      />

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
  const isBusy =
    (primary.kind === "commit" && busy === "commit") ||
    (primary.kind === "sync" && busy === "sync");

  let label: React.ReactNode;
  let icon: React.ReactNode;
  if (primary.kind === "commit") {
    label = "Commit";
    icon = <Check className="w-3 h-3" />;
  } else if (primary.kind === "sync") {
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
        color: canPrimary ? "var(--sg-text-primary)" : "var(--sg-text-tertiary)",
        /* 不可用态用比 elevated 略亮的 card 色，配合实边框 — 避免在
           elevated 容器上塌成"黑色按钮空洞"。可用态走 accent 半透明 */
        background: canPrimary
          ? "rgba(74, 158, 255, 0.18)"
          : "var(--sg-bg-card)",
        border: `1px solid ${
          canPrimary ? "rgba(74, 158, 255, 0.3)" : "var(--sg-border-secondary)"
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
        color: disabled ? "var(--sg-text-placeholder)" : "var(--sg-text-tertiary)",
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
