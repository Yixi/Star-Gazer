/**
 * Commit Hover Tooltip —— 悬停 CommitRow 时展示完整 commit 信息
 *
 * 参考 GitHub / GitLens 的 hover card 设计：
 * - 头像 + 作者 + 相对时间 + 绝对日期
 * - 完整 subject + body（多行保留换行）
 * - 文件数 / +insertions / -deletions 统计
 * - 短 hash


 
 * 交互：
 * - 400ms hover 延迟后才 fetch + 显示
 * - 鼠标离开 row 时延迟 120ms 关闭，方便移动到 tooltip 上继续查看
 * - 模块级 LRU 缓存按 `repoPath|hash` 命中，避免重复 IPC
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GitCommit } from "lucide-react";
import { gitCommitDetail, type GitCommitDetail } from "@/services/git";

/**
 * 计算 Gravatar URL
 *
 * Gravatar 2024 起支持 SHA-256 哈希（旧的 MD5 也保留兼容）。用 Web Crypto API
 * 原生计算，不额外引入 md5/sha 依赖。哈希结果按 email 缓存避免重复计算。
 *
 * `d=retro` — 未注册 Gravatar 的邮箱也会返回一个确定性生成的 8-bit 风格头像，
 * 视觉上每个 commit 作者都有自己独特的像素头像，不容易撞车。
 * `s=80`   — 请求 2x 分辨率，在 Retina 屏更清晰（显示尺寸 20×20 / 40×40 都 OK）
 */
const gravatarCache = new Map<string, string>();

async function hashEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const cached = gravatarCache.get(normalized);
  if (cached) return cached;
  const data = new TextEncoder().encode(normalized);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  gravatarCache.set(normalized, hex);
  return hex;
}

function useGravatarUrl(email: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!email) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    hashEmail(email).then((hex) => {
      if (cancelled) return;
      setUrl(`https://www.gravatar.com/avatar/${hex}?s=80&d=retro`);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);
  return url;
}

/** LRU 缓存（同 commit hover 多次不重复 fetch） */
const detailCache = new Map<string, GitCommitDetail>();
const CACHE_MAX = 64;
function cacheGet(key: string): GitCommitDetail | undefined {
  const v = detailCache.get(key);
  if (v) {
    detailCache.delete(key);
    detailCache.set(key, v);
  }
  return v;
}
function cacheSet(key: string, v: GitCommitDetail) {
  if (detailCache.has(key)) detailCache.delete(key);
  detailCache.set(key, v);
  while (detailCache.size > CACHE_MAX) {
    const first = detailCache.keys().next().value;
    if (first === undefined) break;
    detailCache.delete(first);
  }
}

export interface CommitTooltipProps {
  repoPath: string;
  hash: string;
  /** 触发 tooltip 的 row DOMRect（屏幕坐标） */
  anchorRect: DOMRect;
  /** 鼠标重新进入 tooltip 时取消待关闭 */
  onMouseEnter: () => void;
  /** 鼠标离开 tooltip 时关闭 */
  onMouseLeave: () => void;
}

const TOOLTIP_WIDTH = 440;
const TOOLTIP_MAX_HEIGHT = 480;
const VIEWPORT_MARGIN = 12;

export function CommitTooltip({
  repoPath,
  hash,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: CommitTooltipProps) {
  const cacheKey = `${repoPath}|${hash}`;
  const [detail, setDetail] = useState<GitCommitDetail | null>(
    cacheGet(cacheKey) ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await gitCommitDetail(repoPath, hash);
        if (cancelled) return;
        cacheSet(cacheKey, d);
        setDetail(d);
      } catch (err) {
        if (cancelled) return;
        setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail, repoPath, hash, cacheKey]);

  // 定位：优先放在 row 右侧；右侧不够就放左侧；高度溢出时向上对齐底部
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let left = anchorRect.right + 8;
  if (left + TOOLTIP_WIDTH > viewportW - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, anchorRect.left - TOOLTIP_WIDTH - 8);
  }
  let top = anchorRect.top;
  if (top + TOOLTIP_MAX_HEIGHT > viewportH - VIEWPORT_MARGIN) {
    top = Math.max(VIEWPORT_MARGIN, viewportH - TOOLTIP_MAX_HEIGHT - VIEWPORT_MARGIN);
  }

  return createPortal(
    <div
      className="fixed pointer-events-auto"
      style={{
        top,
        left,
        width: TOOLTIP_WIDTH,
        maxHeight: TOOLTIP_MAX_HEIGHT,
        zIndex: 300,
        overflowY: "auto",
        backgroundColor: "var(--sg-bg-elevated)",
        border: "1px solid var(--sg-border-primary)",
        borderRadius: "var(--sg-radius-lg)",
        boxShadow: "var(--sg-shadow-xl)",
        padding: "12px 14px",
        animation: "sg-fade-in 120ms var(--sg-ease-out) both",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {error ? (
        <div style={{ fontSize: 12, color: "var(--sg-error)" }}>
          加载失败：{error}
        </div>
      ) : detail ? (
        <TooltipContent detail={detail} />
      ) : (
        <div
          style={{
            fontSize: 12,
            color: "var(--sg-text-hint)",
            padding: "4px 0",
          }}
        >
          加载 commit...
        </div>
      )}
    </div>,
    document.body,
  );
}

function TooltipContent({ detail }: { detail: GitCommitDetail }) {
  const relTime = formatRelativeTime(detail.timestamp);
  const absTime = formatAbsoluteTime(detail.timestamp);

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {/* 作者行 */}
      <div className="flex items-center" style={{ gap: 8 }}>
        <Avatar name={detail.authorName} email={detail.authorEmail} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--sg-text-primary)",
          }}
        >
          {detail.authorName}
        </span>
        <span style={{ fontSize: 11, color: "var(--sg-text-hint)" }}>
          {relTime}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--sg-text-placeholder)",
            marginLeft: "auto",
          }}
          title={absTime}
        >
          {absTime}
        </span>
      </div>

      {/* Subject */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--sg-text-primary)",
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {detail.subject}
      </div>

      {/* Body（如果有） */}
      {detail.body && (
        <div
          style={{
            fontSize: 12,
            color: "var(--sg-text-secondary)",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {detail.body}
        </div>
      )}

      {/* 变更统计 */}
      <div
        className="flex items-center"
        style={{
          gap: 10,
          fontSize: 11,
          paddingTop: 8,
          borderTop: "1px solid var(--sg-border-primary)",
        }}
      >
        <span style={{ color: "var(--sg-text-tertiary)" }}>
          {detail.filesChanged} file{detail.filesChanged !== 1 ? "s" : ""} changed
        </span>
        {detail.insertions > 0 && (
          <span
            style={{
              color: "var(--sg-success)",
              fontFamily: "var(--sg-font-mono)",
            }}
          >
            +{detail.insertions}
          </span>
        )}
        {detail.deletions > 0 && (
          <span
            style={{
              color: "var(--sg-error)",
              fontFamily: "var(--sg-font-mono)",
            }}
          >
            −{detail.deletions}
          </span>
        )}
        {/* hash */}
        <span
          className="ml-auto inline-flex items-center"
          style={{
            gap: 4,
            padding: "2px 6px",
            borderRadius: 3,
            backgroundColor: "var(--sg-border-primary)",
            color: "var(--sg-accent)",
            fontFamily: "var(--sg-font-mono)",
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          <GitCommit className="w-3 h-3" />
          {detail.shortHash}
        </span>
      </div>
    </div>
  );
}

/**
 * Gravatar 头像 — 加载失败时回落到首字母块
 *
 * `d=retro` 已经保证每个 email 都能拿到确定性头像，但离线 / DNS 失败时
 * 仍会 onError，此时 `imgFailed` 置 true 切到字母块。
 */
function Avatar({ name, email }: { name: string; email: string }) {
  const url = useGravatarUrl(email);
  const [imgFailed, setImgFailed] = useState(false);
  const initial = useMemo(
    () => (name || "?").charAt(0).toUpperCase(),
    [name],
  );

  const size = 20;
  const commonStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
  };

  if (url && !imgFailed) {
    return (
      <img
        src={url}
        alt={name}
        title={email}
        style={{ ...commonStyle, objectFit: "cover" }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center"
      style={{
        ...commonStyle,
        fontSize: 10,
        fontWeight: 600,
        backgroundColor: "var(--sg-accent-muted)",
        color: "var(--sg-accent)",
      }}
      title={email}
    >
      {initial}
    </div>
  );
}

function formatRelativeTime(unix: number): string {
  const now = Date.now() / 1000;
  const diff = now - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} mo ago`;
  return `${Math.floor(diff / 31536000)} yr ago`;
}

function formatAbsoluteTime(unix: number): string {
  const d = new Date(unix * 1000);
  const year = d.getFullYear();
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const hour = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${year} ${hour}:${min}`;
}
