/**
 * 全局视图切换条 — Files / Changes / History segmented control
 *
 * 设计稿规格：
 * - 外层 scope-row：padding 8px 12px
 * - 内部 scope 容器：bg-elevated + border + radius 6 + padding 2px
 * - 每个 button：flex:1，padding 5px 8px，radius 4，文字 + count badge
 * - active button：bg-card + 内嵌高光阴影
 * - count badge：mono 9.5px，rounded-full，hint 文字
 *   active 状态下 badge 是 accent 色 + accent-muted 底
 *
 * 右侧的 tree/flat 切换在设计稿中没有，但我们已有这个能力（Changes 模式下显示）。
 * 这里把它做成 scope 容器右侧的两个紧凑 icon 按钮，仅在 Changes 模式显示。
 */
import { FolderTree, LayoutList } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "@/stores/projectStore";
import { useMemo } from "react";

export function ScopeSwitcher() {
  const { t } = useTranslation();
  const mode = useProjectStore((s) => s.viewMode);
  const flat = useProjectStore((s) => s.flatMode);
  const setViewMode = useProjectStore((s) => s.setViewMode);
  const setFlatMode = useProjectStore((s) => s.setFlatMode);

  const gitStatusByProject = useProjectStore((s) => s.gitStatusByProject);
  const projectFileTrees = useProjectStore((s) => s.projectFileTrees);

  // 全局聚合计数 —
  //   files: 顶层文件树展开数（粗略指标，避免遍历整树）
  //   changes: staged + unstaged 总和
  //   history: 暂不计（git log 较重，按需触发）
  const counts = useMemo(() => {
    let filesN = 0;
    for (const tree of Object.values(projectFileTrees)) {
      filesN += tree?.length ?? 0;
    }
    let changesN = 0;
    for (const s of Object.values(gitStatusByProject)) {
      if (!s) continue;
      changesN += s.staged.length + s.unstaged.length;
    }
    return { files: filesN, changes: changesN };
  }, [projectFileTrees, gitStatusByProject]);

  const showFlat = mode === "changes";

  return (
    <div
      className="flex items-center flex-shrink-0 select-none"
      style={{
        padding: "8px 12px",
        gap: 6,
        borderBottom: "1px solid var(--sg-border-primary)",
        background: "var(--sg-bg-sidebar)",
      }}
    >
      {/* 三段 segmented control */}
      <div
        className="flex items-center flex-1 min-w-0"
        style={{
          background: "var(--sg-bg-elevated)",
          border: "1px solid var(--sg-border-secondary)",
          borderRadius: 6,
          padding: 2,
        }}
      >
        <ScopeBtn
          label={t("sidebar.files") ?? "Files"}
          count={counts.files}
          active={mode === "files"}
          onClick={() => setViewMode("files")}
        />
        <ScopeBtn
          label={t("sidebar.changes") ?? "Changes"}
          count={counts.changes}
          active={mode === "changes"}
          onClick={() => setViewMode("changes")}
        />
        <ScopeBtn
          label={t("sidebar.history") ?? "History"}
          active={mode === "history"}
          onClick={() => setViewMode("history")}
        />
      </div>

      {/*
        tree/flat 切换 — 仅 Changes 模式可见。
        始终渲染，通过 max-width / opacity / margin 平滑过渡，避免在 mode
        切换时 segmented control 因为右侧元素出现/消失而抖动。
      */}
      <div
        aria-hidden={!showFlat}
        className="flex items-center overflow-hidden flex-shrink-0"
        style={{
          maxWidth: showFlat ? 64 : 0,
          opacity: showFlat ? 1 : 0,
          marginLeft: showFlat ? 0 : -6, // 抵消父容器 gap
          pointerEvents: showFlat ? "auto" : "none",
          transition:
            "max-width 220ms var(--sg-ease-out, ease-out), opacity 180ms var(--sg-ease-out, ease-out), margin-left 220ms var(--sg-ease-out, ease-out)",
        }}
      >
        <div
          className="flex items-center"
          style={{
            background: "var(--sg-bg-elevated)",
            border: "1px solid var(--sg-border-secondary)",
            borderRadius: 6,
            padding: 2,
          }}
        >
          <MiniIconBtn
            active={!flat}
            onClick={() => setFlatMode(false)}
            title={t("sidebar.treeLayout") ?? "Tree"}
          >
            <FolderTree className="w-3 h-3" />
          </MiniIconBtn>
          <MiniIconBtn
            active={flat}
            onClick={() => setFlatMode(true)}
            title={t("sidebar.flatLayout") ?? "Flat"}
          >
            <LayoutList className="w-3 h-3" />
          </MiniIconBtn>
        </div>
      </div>
    </div>
  );
}

/** 三段选择器中的一段 */
function ScopeBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors inline-flex items-center justify-center"
      style={{
        flex: 1,
        gap: 5,
        padding: "5px 8px",
        borderRadius: 4,
        background: active ? "var(--sg-bg-card)" : "transparent",
        boxShadow: active
          ? "0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 3px rgba(0,0,0,0.4)"
          : undefined,
        color: active ? "var(--sg-text-primary)" : "var(--sg-text-tertiary)",
        fontFamily: "var(--sg-font-ui)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        border: "none",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          style={{
            fontFamily: "var(--sg-font-mono)",
            fontSize: 9.5,
            fontWeight: 500,
            lineHeight: 1,
            color: active ? "var(--sg-accent)" : "var(--sg-text-hint)",
            padding: "2px 5px",
            borderRadius: 999,
            background: active
              ? "var(--sg-accent-muted)"
              : "rgba(255, 255, 255, 0.04)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Changes 模式下的 tree/flat icon 切换按钮 */
function MiniIconBtn({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center justify-center transition-colors"
      style={{
        // 外层 segmented 内部 ScopeBtn 高度约 21px（5+11+5），这里对齐
        // 让两个胶囊等高，避免 Changes 模式下右侧按钮组比左侧矮一截
        width: 24,
        height: 21,
        borderRadius: 4,
        background: active ? "var(--sg-bg-card)" : "transparent",
        boxShadow: active
          ? "0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 3px rgba(0,0,0,0.4)"
          : undefined,
        color: active ? "var(--sg-accent)" : "var(--sg-text-tertiary)",
        border: "none",
        cursor: "pointer",
        transition: "background 120ms var(--sg-ease-out, ease-out), color 120ms var(--sg-ease-out, ease-out)",
      }}
    >
      {children}
    </button>
  );
}
