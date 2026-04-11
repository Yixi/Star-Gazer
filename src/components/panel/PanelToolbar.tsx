/**
 * 面板工具栏
 *
 * 左：面包屑路径 `project / folder / file.ts`
 * 右：Diff 统计 `+24 -8`、模式切换 diff/file、布局切换 split/unified
 */
import { ChevronRight, Columns2, AlignJustify, Copy } from "lucide-react";
import { usePanelStore } from "@/stores/panelStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { PanelTab } from "@/types/panel";

interface PanelToolbarProps {
  tab: PanelTab;
}

export function PanelToolbar({ tab }: PanelToolbarProps) {
  const setTabType = usePanelStore((s) => s.setTabType);
  const diffStats = usePanelStore((s) => s.diffStats);
  const activeProject = useProjectStore((s) => s.activeProject);
  const { diffLayout, setDiffLayout } = useSettingsStore();

  // 生成面包屑路径
  const breadcrumbs = generateBreadcrumbs(tab.filePath, activeProject?.path);
  const stat = diffStats[tab.id];

  // 是否有 Git 改动（可以切换到 diff 模式）
  const fileDiffStats = useProjectStore((s) => s.fileDiffStats);
  const hasChanges = !!fileDiffStats[tab.filePath] ||
    tab.type === "diff";

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(tab.filePath);
    } catch {
      console.warn("Failed to copy path");
    }
  };

  return (
    <div
      className="flex items-center justify-between px-3 flex-shrink-0"
      style={{
        height: 32,
        borderBottom: "1px solid #1a1c23",
        backgroundColor: "#0d0e13",
      }}
    >
      {/* 左：面包屑路径 */}
      <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
        {breadcrumbs.map((crumb, index) => (
          <span key={index} className="flex items-center gap-1 flex-shrink-0">
            {index > 0 && (
              <ChevronRight
                className="w-3 h-3 flex-shrink-0"
                style={{ color: "#6b7280" }}
              />
            )}
            <span
              className="text-[11px] truncate"
              style={{
                color:
                  index === breadcrumbs.length - 1 ? "#e4e6eb" : "#8b92a3",
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
          <span className="flex items-center gap-1 text-[11px] tabular-nums">
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
            className="flex items-center rounded-md overflow-hidden"
            style={{ border: "1px solid #2a2d36" }}
          >
            <button
              className="px-2 py-0.5 text-[10px] uppercase transition-colors"
              style={{
                backgroundColor:
                  tab.type === "diff" ? "rgba(74, 158, 255, 0.15)" : "transparent",
                color: tab.type === "diff" ? "#4a9eff" : "#8b92a3",
              }}
              onClick={() => setTabType(tab.id, "diff")}
            >
              diff
            </button>
            <button
              className="px-2 py-0.5 text-[10px] uppercase transition-colors"
              style={{
                backgroundColor:
                  tab.type === "file" ? "rgba(139, 146, 163, 0.1)" : "transparent",
                color: tab.type === "file" ? "#e4e6eb" : "#8b92a3",
              }}
              onClick={() => setTabType(tab.id, "file")}
            >
              file
            </button>
          </div>
        )}

        {/* Diff 布局切换 split/unified (仅 diff 模式) */}
        {tab.type === "diff" && (
          <div
            className="flex items-center rounded-md overflow-hidden"
            style={{ border: "1px solid #2a2d36" }}
          >
            <button
              className="p-1 transition-colors"
              style={{
                backgroundColor:
                  diffLayout === "split" ? "rgba(74, 158, 255, 0.15)" : "transparent",
                color: diffLayout === "split" ? "#4a9eff" : "#8b92a3",
              }}
              onClick={() => setDiffLayout("split")}
              title="Split 视图"
            >
              <Columns2 className="w-3 h-3" />
            </button>
            <button
              className="p-1 transition-colors"
              style={{
                backgroundColor:
                  diffLayout === "unified"
                    ? "rgba(74, 158, 255, 0.15)"
                    : "transparent",
                color: diffLayout === "unified" ? "#4a9eff" : "#8b92a3",
              }}
              onClick={() => setDiffLayout("unified")}
              title="Unified 视图"
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
          title="复制文件路径"
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
