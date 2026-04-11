/**
 * 左侧边栏 — 项目管理和文件树
 *
 * 折叠动画：
 * - 展开：240px，内容淡入
 * - 折叠：48px 图标条，内容淡出
 * - 宽度变化使用 200ms ease-out 平滑过渡
 * - 内容使用 150ms 淡入/淡出
 * - Cmd+B 快捷键切换
 */
import { useEffect } from "react";
import { FolderOpen } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { FileTree } from "./FileTree";
import { ProjectItem } from "./ProjectItem";
import { AddProjectButton } from "./AddProjectButton";

export function Sidebar() {
  const { sidebarWidth, sidebarOpen, sidebarCollapsedWidth, toggleSidebar } =
    useSettingsStore();
  const { projects, activeProject } = useProjectStore();

  // Cmd+B 切换侧边栏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <aside
      className="flex flex-col border-r h-full flex-shrink-0 overflow-hidden"
      style={{
        /* 宽度平滑过渡：240px ↔ 48px */
        width: sidebarOpen ? sidebarWidth : sidebarCollapsedWidth,
        minWidth: sidebarOpen ? sidebarWidth : sidebarCollapsedWidth,
        backgroundColor: "var(--sg-bg-sidebar, #0d0e13)",
        borderColor: "var(--sg-border-primary, #1a1c23)",
        transition: "width 200ms var(--sg-ease-out, ease-out), min-width 200ms var(--sg-ease-out, ease-out)",
      }}
    >
      {/* ====== 折叠模式：48px 图标条 ====== */}
      {!sidebarOpen && (
        <div
          className="flex flex-col items-center py-2 gap-1 h-full"
          style={{
            animation: "sg-fade-in 150ms var(--sg-ease-out, ease-out) both",
          }}
        >
          {/* 展开按钮 */}
          <button
            className="p-2 rounded-md hover:bg-white/5 transition-colors"
            style={{ color: "var(--sg-text-tertiary, #8b92a3)" }}
            onClick={toggleSidebar}
            title="展开侧边栏 (Cmd+B)"
          >
            <FolderOpen className="w-5 h-5" />
          </button>

          {/* 项目图标列表 */}
          {projects.map((project) => (
            <CollapsedProjectIcon
              key={project.id}
              name={project.name}
              isActive={activeProject?.id === project.id}
              onClick={() => useProjectStore.getState().setActiveProject(project)}
            />
          ))}

          {/* 添加项目 */}
          <AddProjectButton collapsed />
        </div>
      )}

      {/* ====== 展开模式：完整侧边栏 ====== */}
      {sidebarOpen && (
        <div
          className="flex flex-col h-full min-w-0"
          style={{
            /* 内容淡入 */
            animation: "sg-fade-in 150ms var(--sg-ease-out, ease-out) both",
          }}
        >
          {/* 标题栏 */}
          <div
            className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b"
            style={{ borderColor: "var(--sg-border-primary, #1a1c23)" }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--sg-text-tertiary, #8b92a3)" }}
            >
              Projects
            </h2>
            <AddProjectButton />
          </div>

          {/* 项目列表区域 */}
          <div
            className="flex-shrink-0 border-b overflow-y-auto"
            style={{
              borderColor: "var(--sg-border-primary, #1a1c23)",
              maxHeight: "30%",
            }}
          >
            <div className="p-1">
              {projects.map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  isActive={activeProject?.id === project.id}
                />
              ))}
              {projects.length === 0 && (
                <div
                  className="text-xs text-center py-4"
                  style={{ color: "var(--sg-text-hint, #6b7280)" }}
                >
                  点击 + 添加项目
                </div>
              )}
            </div>
          </div>

          {/* 文件树区域 */}
          <div className="flex-1 overflow-hidden">
            {activeProject ? (
              <FileTree />
            ) : (
              <div
                className="flex items-center justify-center h-full text-sm"
                style={{ color: "var(--sg-text-hint, #6b7280)" }}
              >
                请选择或添加项目
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

/** 折叠模式下的项目图标 */
function CollapsedProjectIcon({
  name,
  isActive,
  onClick,
}: {
  name: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const initial = name.charAt(0).toUpperCase();

  return (
    <button
      className="relative w-8 h-8 rounded-md flex items-center justify-center text-xs font-semibold transition-colors"
      style={{
        backgroundColor: isActive ? "rgba(74, 158, 255, 0.15)" : "transparent",
        color: isActive ? "var(--sg-accent, #4a9eff)" : "var(--sg-text-tertiary, #8b92a3)",
      }}
      onClick={onClick}
      title={name}
    >
      {initial}
      {/* 状态圆点 */}
      <span
        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
        style={{
          backgroundColor: isActive ? "var(--sg-success, #22c55e)" : "var(--sg-text-hint, #6b7280)",
        }}
      />
    </button>
  );
}
