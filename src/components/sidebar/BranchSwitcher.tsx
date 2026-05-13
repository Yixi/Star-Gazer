/**
 * 分支切换器 — ProjectItem header 上的可点击 badge + 下拉浮层
 *
 * 视觉上替换原来的只读分支 badge（ProjectItem.tsx 中段）。点击 badge 弹出
 * 浮层，浮层里展示本地/远端分支两组，可搜索、可点击切换。
 *
 * 关键点：
 * - 触发器是 <span> 而非 <button>：父级 ProjectItem 已是 button，嵌 button
 *   会破坏 a11y。用 span + role + onClick 模拟。
 * - mousedown / click 都要 stopPropagation：父 button 在 mousedown 触发拖拽
 *   逻辑，click 触发 toggle 展开 + 切 active。
 * - 浮层走 portal，避免 sidebar 的 overflow:hidden / stacking context 把它
 *   裁掉。anchor 用触发器的 getBoundingClientRect。
 * - 浮层打开时才拉分支列表（每次都拉一遍最新的，不缓存 — git_branches < 50ms）。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, GitBranch, Loader2 } from "lucide-react";
import {
  gitBranches,
  gitCheckout,
  gitStatus,
  type GitBranch as GitBranchInfo,
} from "@/services/git";
import { useProjectStore } from "@/stores/projectStore";

interface BranchSwitcherProps {
  projectId: string;
  projectPath: string;
  currentBranch: string;
}

interface PopoverPos {
  left: number;
  top: number;
}

const POPOVER_WIDTH = 260;
const POPOVER_MAX_HEIGHT = 360;

/**
 * 把远端分支名拆成 (remote, shortName)。带斜杠的分支名（如
 * `origin/release/v1.2`）只 strip 第一段 remote 前缀。
 */
function splitRemoteName(name: string): { remote: string; short: string } | null {
  const idx = name.indexOf("/");
  if (idx <= 0) return null;
  return { remote: name.slice(0, idx), short: name.slice(idx + 1) };
}

/** 远端 HEAD 别名（如 `origin/HEAD`）不应当作可切换分支 */
function isRemoteHead(name: string): boolean {
  return /\/HEAD$/.test(name);
}

export function BranchSwitcher({
  projectId,
  projectPath,
  currentBranch,
}: BranchSwitcherProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos>({ left: 0, top: 0 });
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // 打开时定位浮层 + 拉分支列表
  const openPopover = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ left: rect.left, top: rect.bottom + 4 });
    }
    setOpen(true);
    setError(null);
    setQuery("");
    setLoading(true);
    gitBranches(projectPath)
      .then((list) => setBranches(list))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.trim() || "加载分支失败");
        setBranches([]);
      })
      .finally(() => setLoading(false));
  }, [projectPath]);

  const closePopover = useCallback(() => {
    setOpen(false);
    setBranches([]);
    setQuery("");
    setError(null);
  }, []);

  // 关闭：点外部 + Esc
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      closePopover();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopover();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, closePopover]);

  // 测量后做边缘夹紧（贴右/下边缘时往内收）
  useLayoutEffect(() => {
    if (!open) return;
    const el = popoverRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = pos.left;
    let top = pos.top;
    if (left + rect.width > vw - 8) left = Math.max(8, vw - rect.width - 8);
    if (top + rect.height > vh - 8) {
      // 往触发器上方放
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (triggerRect) {
        top = Math.max(8, triggerRect.top - rect.height - 4);
      } else {
        top = Math.max(8, vh - rect.height - 8);
      }
    }
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
    // 故意只在 open 切换时夹紧；branches/query 变化导致高度变也无所谓，列表自带滚动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSelect = useCallback(
    async (branchName: string) => {
      // 远端分支：strip remote 前缀让 git DWIM 自动建跟踪分支
      const remoteSplit = splitRemoteName(branchName);
      const localName = remoteSplit ? remoteSplit.short : branchName;
      if (localName === currentBranch) {
        closePopover();
        return;
      }
      setBusy(branchName);
      setError(null);
      try {
        await gitCheckout(projectPath, localName);
        // 主动刷一次 status，UI 立即反映新分支（轮询也会兜底）
        try {
          const next = await gitStatus(projectPath);
          useProjectStore.getState().setGitStatus(projectId, next);
        } catch {
          // 忽略：轮询会兜底
        }
        closePopover();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg.trim() || "切换分支失败");
      } finally {
        setBusy(null);
      }
    },
    [projectPath, projectId, currentBranch, closePopover],
  );

  // 过滤 + 分组
  const { localBranches, remoteBranches } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local: GitBranchInfo[] = [];
    const remote: GitBranchInfo[] = [];
    for (const b of branches) {
      if (isRemoteHead(b.name)) continue;
      if (q && !b.name.toLowerCase().includes(q)) continue;
      // is_head 一定是 local；含 `/` 且第一段是 remote 名的视为远端
      // git_service 的 `--format=%(refname:short)` 让 remote 分支输出形如 `origin/foo`
      const isRemote = !b.isHead && b.name.includes("/");
      if (isRemote) remote.push(b);
      else local.push(b);
    }
    return { localBranches: local, remoteBranches: remote };
  }, [branches, query]);

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={`当前分支 ${currentBranch}，点击切换`}
        className="flex-shrink-0 tabular-nums inline-flex items-center cursor-pointer transition-colors truncate"
        style={{
          fontSize: 10.5,
          color: open ? "var(--sg-text-secondary)" : "var(--sg-text-tertiary)",
          fontWeight: 500,
          fontFamily: "var(--sg-font-mono)",
          letterSpacing: 0,
          maxWidth: 180,
          textDecoration: "underline dotted",
          textUnderlineOffset: 3,
          textDecorationColor: "var(--sg-border-divider)",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.color = "var(--sg-text-secondary)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.color = "var(--sg-text-tertiary)";
        }}
        onMouseDown={(e) => {
          // 阻止父 button 把 mousedown 当成拖拽起点
          e.stopPropagation();
        }}
        onClick={(e) => {
          // 阻止 ProjectItem 的 onClick（toggle 展开 + 切 active）
          e.stopPropagation();
          e.preventDefault();
          if (open) closePopover();
          else openPopover();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            if (open) closePopover();
            else openPopover();
          }
        }}
      >
        <span className="truncate">{currentBranch}</span>
      </span>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed rounded-lg shadow-xl flex flex-col"
            style={{
              left: pos.left,
              top: pos.top,
              width: POPOVER_WIDTH,
              maxHeight: POPOVER_MAX_HEIGHT,
              zIndex: 9999,
              backgroundColor: "#1a1c23",
              border: "1px solid #2a2d36",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 搜索框 */}
            <div
              className="px-2 py-2 border-b"
              style={{ borderColor: "#2a2d36" }}
            >
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索分支…"
                className="w-full px-2 py-1 outline-none rounded"
                style={{
                  fontSize: 11,
                  color: "#e4e6eb",
                  background: "#0b0c11",
                  border: "1px solid #2a2d36",
                }}
              />
            </div>

            {/* 列表区 */}
            <div
              className="flex-1 overflow-y-auto py-1"
              style={{ scrollbarWidth: "thin" }}
            >
              {loading && (
                <div
                  className="flex items-center gap-2 px-3 py-2"
                  style={{ fontSize: 11, color: "#8b92a3" }}
                >
                  <Loader2
                    className="w-3 h-3 animate-spin"
                    style={{ color: "#8b92a3" }}
                  />
                  <span>加载分支…</span>
                </div>
              )}

              {!loading && localBranches.length === 0 && remoteBranches.length === 0 && (
                <div
                  className="px-3 py-3"
                  style={{ fontSize: 11, color: "#6b7280" }}
                >
                  {query ? "没有匹配的分支" : "没有分支"}
                </div>
              )}

              {localBranches.length > 0 && (
                <BranchGroup label="本地分支">
                  {localBranches.map((b) => (
                    <BranchRow
                      key={`local-${b.name}`}
                      branchName={b.name}
                      displayName={b.name}
                      upstream={b.upstream}
                      isCurrent={b.isHead || b.name === currentBranch}
                      isBusy={busy === b.name}
                      disabled={busy !== null}
                      onClick={() => handleSelect(b.name)}
                    />
                  ))}
                </BranchGroup>
              )}

              {remoteBranches.length > 0 && (
                <BranchGroup label="远端分支">
                  {remoteBranches.map((b) => {
                    const split = splitRemoteName(b.name);
                    return (
                      <BranchRow
                        key={`remote-${b.name}`}
                        branchName={b.name}
                        displayName={split?.short ?? b.name}
                        remoteHint={split?.remote}
                        isCurrent={false}
                        isBusy={busy === b.name}
                        disabled={busy !== null}
                        onClick={() => handleSelect(b.name)}
                      />
                    );
                  })}
                </BranchGroup>
              )}
            </div>

            {/* 错误条 */}
            {error && (
              <div
                className="px-3 py-2 border-t"
                style={{
                  borderColor: "#2a2d36",
                  fontSize: 10,
                  color: "#ef4444",
                  fontFamily: "'SF Mono', Menlo, monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 80,
                  overflowY: "auto",
                }}
              >
                {error}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function BranchGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div
        className="px-3 pb-1 uppercase tracking-wider"
        style={{ fontSize: 9, color: "#6b7280", fontWeight: 600 }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

interface BranchRowProps {
  branchName: string;
  displayName: string;
  remoteHint?: string;
  upstream?: string;
  isCurrent: boolean;
  isBusy: boolean;
  disabled: boolean;
  onClick: () => void;
}

function BranchRow({
  displayName,
  remoteHint,
  upstream,
  isCurrent,
  isBusy,
  disabled,
  onClick,
}: BranchRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
      style={{ fontSize: 11, color: "#e4e6eb" }}
    >
      <span className="flex-shrink-0 w-3 inline-flex items-center justify-center">
        {isBusy ? (
          <Loader2
            className="w-3 h-3 animate-spin"
            style={{ color: "#4a9eff" }}
          />
        ) : isCurrent ? (
          <Check className="w-3 h-3" style={{ color: "#4a9eff" }} />
        ) : (
          <GitBranch className="w-3 h-3" style={{ color: "#6b7280" }} />
        )}
      </span>
      <span className="flex-1 text-left truncate" style={{ fontFamily: "'SF Mono', Menlo, monospace" }}>
        {displayName}
      </span>
      {remoteHint && (
        <span
          className="flex-shrink-0"
          style={{ fontSize: 9, color: "#6b7280", fontFamily: "'SF Mono', Menlo, monospace" }}
        >
          {remoteHint}
        </span>
      )}
      {!remoteHint && upstream && (
        <span
          className="flex-shrink-0 truncate"
          style={{ fontSize: 9, color: "#6b7280", fontFamily: "'SF Mono', Menlo, monospace", maxWidth: 90 }}
        >
          ↑ {upstream}
        </span>
      )}
    </button>
  );
}
