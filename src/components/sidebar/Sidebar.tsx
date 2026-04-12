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
import { useEffect, useCallback } from "react";
import { FolderOpen } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useFileWatcher } from "@/hooks/useFileWatcher";
import { useGitStatus } from "@/hooks/useGitStatus";
import { FileTree } from "./FileTree";
import { ProjectItem } from "./ProjectItem";
import { AddProjectButton } from "./AddProjectButton";
import { ScopeSwitcher } from "./ScopeSwitcher";
import { ChangesView } from "./ChangesView";
import { HistoryView } from "./HistoryView";
import type { FileChangeEvent } from "@/services/watcher";

export function Sidebar() {
  const { sidebarWidth, sidebarOpen, sidebarCollapsedWidth, toggleSidebar } =
    useSettingsStore();
  const { projects, activeProject, expandedProjectIds } = useProjectStore();

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

  // Git 状态 — 加载分支名和文件 diff 统计（单例，写入 projectStore 供各视图共享）
  const { status: gitStatus, refresh: refreshGitStatus } = useGitStatus(activeProject?.path ?? null);
  useEffect(() => {
    if (gitStatus && activeProject) {
      useProjectStore.getState().setGitStatus(activeProject.id, gitStatus);
    }
  }, [gitStatus, activeProject]);

  // 文件监听 — 变更时重新加载文件树 + 刷新 git 状态
  const handleFileChange = useCallback(
    (_event: FileChangeEvent) => {
      if (activeProject) {
        const loadFileTree = async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const entries = await invoke<Array<{
              name: string;
              path: string;
              isDir: boolean;
              size: number;
              modified: number;
            }>>("list_dir", { path: activeProject.path });
            const fileNodes = entries.map((entry) => {
              const relativePath = entry.path.startsWith(activeProject.path)
                ? entry.path.slice(activeProject.path.length).replace(/^\//, "")
                : entry.name;
              return {
                id: relativePath || entry.name,
                name: entry.name,
                path: entry.path,
                isDir: entry.isDir,
                children: entry.isDir ? [] : undefined,
              };
            });
            useProjectStore.getState().setProjectFileTree(activeProject.id, fileNodes);
          } catch (err) {
            console.warn("文件监听触发的文件树刷新失败:", err);
          }
        };
        loadFileTree();
        // 文件变化后也刷新 git 状态
        refreshGitStatus();
      }
    },
    [activeProject, refreshGitStatus]
  );
  useFileWatcher(activeProject?.path ?? null, handleFileChange);
  useEffect(() => {
    if (!gitStatus || !activeProject) return;
    // 更新 Git 分支名
    useProjectStore.getState().setGitBranch(gitStatus.branch);
    // 更新文件 diff 统计（拼接完整路径，使 FileTree 能匹配）
    const diffStats: Record<string, { additions: number; deletions: number }> = {};
    for (const change of [...gitStatus.staged, ...gitStatus.unstaged]) {
      const fullPath = activeProject.path + '/' + change.path;
      diffStats[fullPath] = {
        additions: change.additions,
        deletions: change.deletions,
      };
    }
    useProjectStore.getState().setFileDiffStats(diffStats);
  }, [gitStatus, activeProject]);

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
          {/* 标题栏 — 设计稿: padding 12px 14px */}
          <div
            className="flex items-center justify-between flex-shrink-0 border-b"
            style={{
              padding: "12px 14px",
              borderColor: "var(--sg-border-primary, #1a1c23)",
            }}
          >
            <h2
              className="font-semibold uppercase"
              style={{
                color: "var(--sg-text-tertiary, #8b92a3)",
                fontSize: 10,
                letterSpacing: "0.8px",
              }}
            >
              Projects
            </h2>
            <AddProjectButton />
          </div>

          {/* 项目 + 文件树统一区域 — 去掉容器 padding，由子项自行控制 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {projects.length === 0 ? (
              <div
                className="text-xs text-center py-4"
                style={{ color: "var(--sg-text-hint, #6b7280)" }}
              >
                点击 + 添加项目
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {projects.map((project) => {
                  const isActive = activeProject?.id === project.id;
                  const isExpanded = !!expandedProjectIds[project.id];
                  return (
                    <div key={project.id} className="flex flex-col flex-shrink-0">
                      <ProjectItem
                        project={project}
                        isActive={isActive}
                        isExpanded={isExpanded}
                      />
                      {isExpanded && <ProjectBody project={project} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

/** 展开后的项目内容 — ScopeSwitcher + 按 viewMode 切视图 */
function ProjectBody({ project }: { project: import("@/types/project").Project }) {
  const mode = useProjectStore((s) => s.viewModes[project.id] ?? "files");
  return (
    <>
      <ScopeSwitcher project={project} />
      {mode === "files" && <FileTree project={project} />}
      {mode === "changes" && <ChangesView project={project} />}
      {mode === "history" && <HistoryView project={project} />}
    </>
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
