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
      className="flex items-center justify-between flex-shrink-0"
      style={{
        padding: '8px 14px',
        gap: 10,
        borderBottom: "1px solid #1a1c23",
        backgroundColor: "#0f1116",
      }}
    >
      {/* 左：面包屑路径 */}
      <div className="flex items-center min-w-0 flex-1 overflow-hidden" style={{ fontFamily: "'SF Mono', Menlo, monospace" }}>
        {breadcrumbs.map((crumb, index) => (
          <span key={index} className="flex items-center flex-shrink-0">
            {index > 0 && (
              <span
                className="flex-shrink-0"
                style={{ color: "#3a4150", margin: '0 4px', fontSize: 11 }}
              >/</span>
            )}
            <span
              className="text-[11px] truncate"
              style={{
                color:
                  index === breadcrumbs.length - 1 ? "#e4e6eb" : "#6b7280",
                fontWeight: index === breadcrumbs.length - 1 ? 500 : 400,
                maxWidth: index === breadcrumbs.length - 1 ? "none" : 100,
              }}
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>

      {/* 右：操作区 */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Diff 统计 (仅 diff 模式) */}
        {tab.type === "diff" && stat && (
          <span
            className="flex items-center gap-1 text-[11px] tabular-nums"
            style={{
              padding: "3px 8px",
              background: "#0d0e13",
              border: "1px solid #1a1c23",
              borderRadius: 4,
            }}
          >
            {stat.additions > 0 && (
              <span style={{ color: "#22c55e" }}>+{stat.additions}</span>
            )}
            {stat.deletions > 0 && (
              <span style={{ color: "#ef4444" }}>-{stat.deletions}</span>
            )}
          </span>
        )}

        {/* 模式切换 diff/file */}
        {hasChanges && (
          <div
            className="flex items-center overflow-hidden"
            style={{
              background: '#0d0e13',
              border: '1px solid #1a1c23',
              borderRadius: 5,
              padding: 2,
            }}
          >
            <button
              className="text-[10px] uppercase transition-colors"
              style={{
                padding: '4px 10px',
                borderRadius: 3,
                fontWeight: 500,
                backgroundColor:
                  tab.type === "diff" ? "#2a2f3b" : "transparent",
                color: tab.type === "diff" ? "#e4e6eb" : "#6b7280",
              }}
              onClick={() => setTabType(tab.id, "diff")}
            >
              diff
            </button>
            <button
              className="text-[10px] uppercase transition-colors"
              style={{
                padding: '4px 10px',
                borderRadius: 3,
                fontWeight: 500,
                backgroundColor:
                  tab.type === "file" ? "#2a2f3b" : "transparent",
                color: tab.type === "file" ? "#e4e6eb" : "#6b7280",
              }}
              onClick={() => setTabType(tab.id, "file")}
            >
              file
            </button>
          </div>
        )}

        {/* Markdown/可预览文件 — preview/source 切换 */}
        {(isPreviewable || isImageFile) && (
          <div
            className="flex items-center overflow-hidden"
            style={{
              background: '#0d0e13',
              border: '1px solid #1a1c23',
              borderRadius: 5,
              padding: 2,
            }}
          >
            <button
              className="flex items-center gap-1 transition-colors"
              style={{
                padding: '4px 10px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 500,
                backgroundColor:
                  tab.type === "markdown" ? "#2a2f3b" : "transparent",
                color: tab.type === "markdown" ? "#e4e6eb" : "#6b7280",
              }}
              onClick={() => setTabType(tab.id, "markdown")}
              title={t("panel.previewMode")}
            >
              <Eye className="w-3 h-3" />
              <span className="uppercase">Preview</span>
            </button>
            <button
              className="flex items-center gap-1 transition-colors"
              style={{
                padding: '4px 10px',
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 500,
                backgroundColor:
                  tab.type === "file" ? "#2a2f3b" : "transparent",
                color: tab.type === "file" ? "#e4e6eb" : "#6b7280",
              }}
              onClick={() => setTabType(tab.id, "file")}
              title={t("panel.sourceMode")}
            >
              <FileCode className="w-3 h-3" />
              <span className="uppercase">Source</span>
            </button>
          </div>
        )}

        {/* Diff 布局切换 split/unified (仅 diff 模式) */}
        {tab.type === "diff" && (
          <div
            className="flex items-center overflow-hidden"
            style={{
              background: '#0d0e13',
              border: '1px solid #1a1c23',
              borderRadius: 5,
              padding: 2,
            }}
          >
            <button
              className="flex items-center justify-center transition-colors"
              style={{
                padding: '4px 10px',
                borderRadius: 3,
                backgroundColor:
                  diffLayout === "split" ? "#2a2f3b" : "transparent",
                color: diffLayout === "split" ? "#e4e6eb" : "#6b7280",
              }}
              onClick={() => setDiffLayout("split")}
              title={t("panel.splitView")}
            >
              <Columns2 className="w-3 h-3" />
            </button>
            <button
              className="flex items-center justify-center transition-colors"
              style={{
                padding: '4px 10px',
                borderRadius: 3,
                backgroundColor:
                  diffLayout === "unified" ? "#2a2f3b" : "transparent",
                color: diffLayout === "unified" ? "#e4e6eb" : "#6b7280",
              }}
              onClick={() => setDiffLayout("unified")}
              title={t("panel.unifiedView")}
            >
              <AlignJustify className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* 复制路径 */}
        <button
          className="p-1 rounded hover:bg-white/5 transition-colors"
          style={{ color: "#8b92a3" }}
          onClick={handleCopyPath}
          title={t("panel.copyPath")}
        >
          <Copy className="w-3 h-3" />
        </button>
      </div>
    </div>
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
