/**
 * 面板工具栏
 *
 * 左：面包屑路径 `project / folder / file.ts`
 * 右：Diff 统计 `+24 -8`、模式切换 diff/file、布局切换 split/unified
 */
import { useTranslation } from "react-i18next";
import { Columns2, AlignJustify, Copy, Eye, FileCode } from "lucide-react";
import { usePanelStore } from "@/stores/panelStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { PanelTab } from "@/types/panel";

interface PanelToolbarProps {
  tab: PanelTab;
}

export function PanelToolbar({ tab }: PanelToolbarProps) {
  const { t } = useTranslation();
  const setTabType = usePanelStore((s) => s.setTabType);
  const diffStats = usePanelStore((s) => s.diffStats);
  const activeProject = useProjectStore((s) => s.activeProject);
  const { diffLayout, setDiffLayout } = useSettingsStore();

  // 生成面包屑路径 — 优先用 tab 自己记的 projectPath，保证切换 active project
  // 后，旧 tab 的面包屑仍显示它所属项目的相对路径
  const effectiveProjectPath = tab.projectPath ?? activeProject?.path;
  const breadcrumbs = generateBreadcrumbs(tab.filePath, effectiveProjectPath);
  const stat = diffStats[tab.id];

  // 是否有 Git 改动（可以切换到 diff 模式）
  //
  // 关键点：`fileDiffStats` 只包含 tracked 且有 staged/unstaged 行数的文件，
  // **untracked 新文件不在里面**。之前的判断只查 fileDiffStats，一旦用户把
  // untracked 文件从 diff 切到 file 模式，`tab.type === "diff"` 也变 false，
  // 整个 toggle 就消失再也切不回去了。这里额外从该项目的 gitStatusByProject
  // 的 `untracked` 列表查一下，untracked 文件一样显示 diff/file toggle。
  const fileDiffStats = useProjectStore((s) => s.fileDiffStats);
  const projects = useProjectStore((s) => s.projects);
  const gitStatusByProject = useProjectStore((s) => s.gitStatusByProject);

  const owningProject = effectiveProjectPath
    ? projects.find((p) => p.path === effectiveProjectPath)
    : undefined;
  const projectGitStatus = owningProject
    ? gitStatusByProject[owningProject.id]
    : undefined;
  const relativeFilePath =
    effectiveProjectPath && tab.filePath.startsWith(effectiveProjectPath)
      ? tab.filePath.slice(effectiveProjectPath.length).replace(/^\//, "")
      : tab.filePath;
  const isUntracked =
    projectGitStatus?.untracked.includes(relativeFilePath) ?? false;

  const hasChanges =
    !!fileDiffStats[tab.filePath] || isUntracked || tab.type === "diff";

  // 是否为可预览文件（markdown、图片等）
  const ext = tab.filePath.split(".").pop()?.toLowerCase() ?? "";
  const isPreviewable = ["md", "mdx"].includes(ext);
  const isImageFile = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(ext);

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(tab.filePath);
    } catch {
      console.warn("Failed to copy path");
    }
  };

  return (
    <div
      className="flex items-center flex-shrink-0"
      style={{
        height: 32,
        padding: "0 12px",
        gap: 8,
        borderBottom: "1px solid var(--sg-border-primary)",
        background: "var(--sg-bg-canvas)",
        fontFamily: "var(--sg-font-mono)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        color: "var(--sg-text-tertiary)",
      }}
    >
      {/* 左：面包屑路径 seg / seg.last */}
      <div className="flex items-center min-w-0 flex-1 overflow-hidden">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <span key={index} className="flex items-center flex-shrink-0">
              {index > 0 && (
                <span
                  className="flex-shrink-0"
                  style={{ color: "var(--sg-text-hint)", padding: "0 4px" }}
                >
                  /
                </span>
              )}
              <span
                className="truncate"
                style={{
                  color: isLast ? "var(--sg-text-primary)" : "var(--sg-text-hint)",
                  maxWidth: isLast ? "none" : 100,
                }}
              >
                {crumb}
              </span>
            </span>
          );
        })}
      </div>

      {/* 右：操作区 — 各种 view-toggle 段 */}
      <div className="flex items-center flex-shrink-0" style={{ gap: 4, marginLeft: "auto" }}>
        {/* Diff 统计 (仅 diff 模式) */}
        {tab.type === "diff" && stat && (
          <span
            className="inline-flex items-center tabular-nums"
            style={{
              gap: 4,
              padding: "3px 7px",
              borderRadius: 4,
              fontFamily: "var(--sg-font-mono)",
              fontSize: 10.5,
              fontWeight: 500,
            }}
          >
            {stat.additions > 0 && (
              <span style={{ color: "var(--sg-success)" }}>+{stat.additions}</span>
            )}
            {stat.deletions > 0 && (
              <span style={{ color: "var(--sg-error)" }}>−{stat.deletions}</span>
            )}
          </span>
        )}

        {/* 模式切换 diff/file */}
        {hasChanges && (
          <ViewToggle>
            <ViewToggleBtn
              active={tab.type === "diff"}
              onClick={() => setTabType(tab.id, "diff")}
            >
              Diff
            </ViewToggleBtn>
            <ViewToggleBtn
              active={tab.type === "file"}
              onClick={() => setTabType(tab.id, "file")}
            >
              File
            </ViewToggleBtn>
          </ViewToggle>
        )}

        {/* Markdown/可预览文件 — preview/source 切换 */}
        {(isPreviewable || isImageFile) && (
          <ViewToggle>
            <ViewToggleBtn
              active={tab.type === "markdown"}
              onClick={() => setTabType(tab.id, "markdown")}
              title={t("panel.previewMode")}
            >
              <Eye className="w-3 h-3" />
              <span>Preview</span>
            </ViewToggleBtn>
            <ViewToggleBtn
              active={tab.type === "file"}
              onClick={() => setTabType(tab.id, "file")}
              title={t("panel.sourceMode")}
            >
              <FileCode className="w-3 h-3" />
              <span>Source</span>
            </ViewToggleBtn>
          </ViewToggle>
        )}

        {/* Diff 布局切换 split/unified (仅 diff 模式) */}
        {tab.type === "diff" && (
          <ViewToggle>
            <ViewToggleBtn
              active={diffLayout === "unified"}
              onClick={() => setDiffLayout("unified")}
              title={t("panel.unifiedView")}
            >
              <AlignJustify className="w-3 h-3" />
            </ViewToggleBtn>
            <ViewToggleBtn
              active={diffLayout === "split"}
              onClick={() => setDiffLayout("split")}
              title={t("panel.splitView")}
            >
              <Columns2 className="w-3 h-3" />
            </ViewToggleBtn>
          </ViewToggle>
        )}

        {/* 复制路径 */}
        <button
          type="button"
          className="inline-flex items-center justify-center transition-colors"
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: "transparent",
            color: "var(--sg-text-hint)",
            border: "none",
            cursor: "pointer",
          }}
          onClick={handleCopyPath}
          title={t("panel.copyPath")}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            e.currentTarget.style.color = "var(--sg-text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--sg-text-hint)";
          }}
        >
          <Copy className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/** 设计稿的 view-toggle 容器 — 圆角边框 + 内嵌按钮 */
function ViewToggle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inline-flex items-center"
      style={{
        background: "var(--sg-bg-elevated)",
        border: "1px solid var(--sg-border-secondary)",
        borderRadius: 5,
        padding: 2,
      }}
    >
      {children}
    </div>
  );
}

/** view-toggle 内部按钮 */
function ViewToggleBtn({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center justify-center transition-colors"
      style={{
        gap: 4,
        padding: "3px 8px",
        borderRadius: 3,
        fontFamily: "var(--sg-font-mono)",
        fontSize: 10.5,
        fontWeight: 500,
        lineHeight: 1,
        background: active ? "var(--sg-bg-card)" : "transparent",
        color: active ? "var(--sg-text-primary)" : "var(--sg-text-tertiary)",
        border: "none",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** 生成面包屑路径 */
function generateBreadcrumbs(filePath: string, projectPath?: string): string[] {
  if (!projectPath) return [filePath];

  // 获取相对路径
  let relativePath = filePath;
  if (filePath.startsWith(projectPath)) {
    relativePath = filePath.slice(projectPath.length).replace(/^\//, "");
  }

  const parts = relativePath.split("/").filter(Boolean);
  // 添加项目名
  const projectName = projectPath.split("/").pop() || "project";
  return [projectName, ...parts];
}
