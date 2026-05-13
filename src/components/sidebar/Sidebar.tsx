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
import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { FolderOpen } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useProjectGitSync } from "@/hooks/useProjectGitSync";
import { useFlipReorder } from "@/hooks/useFlipReorder";
import { FileTree } from "./FileTree";
import { ProjectItem } from "./ProjectItem";
import { ProjectGroupItem } from "./ProjectGroupItem";
import { AddProjectButton } from "./AddProjectButton";
import { ScopeSwitcher } from "./ScopeSwitcher";
import { ChangesView } from "./ChangesView";
import { HistoryView } from "./HistoryView";
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher";
import type { Project, ProjectGroup } from "@/types/project";

/** Sidebar 宽度可拖拽范围 */
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;

export function Sidebar() {
  const { sidebarWidth, sidebarOpen, sidebarCollapsedWidth, toggleSidebar } =
    useSettingsStore();
  const setSidebarWidth = useSettingsStore((s) => s.setSidebarWidth);
  const { projects, activeProject, expandedProjectIds } = useProjectStore();
  const projectGroups = useProjectStore((s) => s.projectGroups);
  const toggleProjectExpanded = useProjectStore((s) => s.toggleProjectExpanded);

  // 把 active project 的 git 状态派生出全局 UI 用的 gitBranch / fileDiffStats
  // （StatusBar 顶栏、PanelToolbar 等消费这两个派生值；
  //  真正的每项目 sync 由 ProjectBody 里的 useProjectGitSync 承担）
  const activeProjectGitStatus = useProjectStore((s) =>
    activeProject ? s.gitStatusByProject[activeProject.id] : undefined,
  );
  useEffect(() => {
    if (!activeProject || !activeProjectGitStatus) {
      useProjectStore.getState().setGitBranch("");
      useProjectStore.getState().setFileDiffStats({});
      return;
    }
    useProjectStore.getState().setGitBranch(activeProjectGitStatus.branch);
    const diffStats: Record<string, { additions: number; deletions: number }> = {};
    for (const change of [
      ...activeProjectGitStatus.staged,
      ...activeProjectGitStatus.unstaged,
    ]) {
      const fullPath = activeProject.path + "/" + change.path;
      diffStats[fullPath] = {
        additions: change.additions,
        deletions: change.deletions,
      };
    }
    useProjectStore.getState().setFileDiffStats(diffStats);
  }, [activeProject, activeProjectGitStatus]);

  // 右缘宽度拖拽 —
  // 拖拽期间关掉 200ms 的 width 过渡，避免光标和面板边缘有延迟感
  const [isResizing, setIsResizing] = useState(false);
  const resizeStateRef = useRef({ startX: 0, startWidth: 0 });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (!sidebarOpen) return;
      e.preventDefault();
      resizeStateRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      setIsResizing(true);

      const handleMove = (me: MouseEvent) => {
        const delta = me.clientX - resizeStateRef.current.startX;
        const next = Math.max(
          MIN_SIDEBAR_WIDTH,
          Math.min(MAX_SIDEBAR_WIDTH, resizeStateRef.current.startWidth + delta),
        );
        setSidebarWidth(next);
      };
      const handleUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [sidebarOpen, sidebarWidth, setSidebarWidth],
  );

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

  // 兜底：active project 未展开时也保持一份 git 同步（否则 StatusBar 上的
  // 分支名和全局 fileDiffStats 无源数据）。展开的项目由 ProjectBody 自己
  // 挂 sync；FileWatcherManager 按 path 去重避免重复 watcher。
  const viewMode = useProjectStore((s) => s.viewMode);
  const reorderSidebarEntries = useProjectStore(
    (s) => s.reorderSidebarEntries,
  );
  const createGroupFromProjects = useProjectStore(
    (s) => s.createGroupFromProjects,
  );
  const moveProjectIntoGroup = useProjectStore((s) => s.moveProjectIntoGroup);
  const detachProjectToTopLevel = useProjectStore(
    (s) => s.detachProjectToTopLevel,
  );
  const activeProjectExpanded = activeProject
    ? !!expandedProjectIds[activeProject.id]
    : false;

  /**
   * 构建 sidebar 顶层行列表 —— 组整体占一行，独立项目各占一行。
   * 顺序取自 `projects` 数组：遇到带 groupId 的成员就把 group 行插在该组
   * 首次出现的位置，后续同组成员不再重复产出行。
   */
  type SidebarRow =
    | { kind: "group"; group: ProjectGroup; members: Project[] }
    | { kind: "project"; project: Project };
  const sidebarRows = useMemo<SidebarRow[]>(() => {
    const rows: SidebarRow[] = [];
    const seen = new Set<string>();
    for (const p of projects) {
      if (p.groupId) {
        if (seen.has(p.groupId)) continue;
        seen.add(p.groupId);
        const group = projectGroups.find((g) => g.id === p.groupId);
        // group 必须同时有 path + name 才算有效 —— 兜底老 workspace 文件里
        // 出现过的"只有 id"的坏 group 数据
        if (!group || !group.path || !group.name) {
          rows.push({ kind: "project", project: p });
          continue;
        }
        const members = projects.filter((x) => x.groupId === p.groupId);
        rows.push({ kind: "group", group, members });
      } else {
        rows.push({ kind: "project", project: p });
      }
    }
    return rows;
  }, [projects, projectGroups]);

  // FLIP 的 key：group 和 project 走不同前缀避免 id 碰撞
  const rowKeys = useMemo(
    () =>
      sidebarRows.map((r) =>
        r.kind === "group" ? `g-${r.group.id}` : `p-${r.project.id}`,
      ),
    [sidebarRows],
  );
  const registerFlipRef = useFlipReorder(rowKeys);

  // ========================================
  // 拖拽排序 / 分组
  // ========================================
  //
  // 三区识别（顶层 project / group header 行）：
  //   top 25%   → "before"（行前插入）
  //   mid 50%   → "into"（合入/加入组）
  //   bot 25%   → "after"（行后插入）
  //
  // 成员行（组内）只有 2 区：top 50% = before，bottom 50% = after；
  // 拖拽源是 group 时也只给 2 区（组不允许嵌套到另一个组里）。
  //
  // 拖拽组合 → 调用哪个 store action：
  //   project → top-level project, into  → createGroupFromProjects
  //   project → group header,       into  → moveProjectIntoGroup（append）
  //   project → member,             b/a   → moveProjectIntoGroup（refMember）
  //   组内成员 → 顶层 project/group,  b/a   → detachProjectToTopLevel
  //   独立 project → 顶层 project/group, b/a → reorderSidebarEntries
  //   group → 顶层 project/group,     b/a   → reorderSidebarEntries
  type DropKind = "project-top" | "group" | "member";
  type DropZone = "before" | "into" | "after";
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    zone: DropZone;
    kind: DropKind;
  } | null>(null);

  const draggingIsGroup = useMemo(
    () =>
      draggingId
        ? projectGroups.some((g) => g.id === draggingId)
        : false,
    [draggingId, projectGroups],
  );

  const handleRowDragStart = useCallback(
    (e: React.DragEvent, id: string) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-stargazer-project", id);
      setDraggingId(id);
    },
    [],
  );

  const handleRowDragOver = useCallback(
    (e: React.DragEvent, targetId: string, kind: DropKind) => {
      if (!draggingId || draggingId === targetId) return;

      // 组不允许被当成"合入/嵌套"的源：
      // - 拖组到组/项目的 into 区 → 无效
      // - 拖组到 member 行（任何区）→ 无效（组不能变成另一个组的成员）
      if (draggingIsGroup && kind === "member") return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;

      let zone: DropZone;
      // member 行 + 拖组，都走 2 区
      const twoZone = kind === "member" || draggingIsGroup;
      if (twoZone) {
        zone = ratio < 0.5 ? "before" : "after";
      } else {
        if (ratio < 0.25) zone = "before";
        else if (ratio > 0.75) zone = "after";
        else zone = "into";
      }

      // 拖组到自己的 into 永不合法（虽然 id 相等已经提前返回）
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget((prev) => {
        if (
          prev &&
          prev.id === targetId &&
          prev.zone === zone &&
          prev.kind === kind
        ) {
          return prev;
        }
        return { id: targetId, zone, kind };
      });
    },
    [draggingId, draggingIsGroup],
  );

  const handleRowDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  const handleRowDrop = useCallback(
    (e: React.DragEvent, targetId: string, kind: DropKind) => {
      e.preventDefault();
      e.stopPropagation();
      const fromId = draggingId;
      const zone = dropTarget?.zone ?? "before";
      const resolvedKind = dropTarget?.kind ?? kind;
      setDraggingId(null);
      setDropTarget(null);
      if (!fromId || fromId === targetId) return;

      const fromIsGroup = projectGroups.some((g) => g.id === fromId);

      // into 区：合成组 / 加入组
      if (zone === "into") {
        if (fromIsGroup) return; // 组不允许合并/嵌套
        if (resolvedKind === "group") {
          void moveProjectIntoGroup(fromId, targetId);
          return;
        }
        if (resolvedKind === "project-top") {
          // 顺序：被拖的放后面（点哪个就把另一个拖过来是更自然的心智）
          void createGroupFromProjects([targetId, fromId]);
          return;
        }
        return;
      }

      // before / after 区
      if (resolvedKind === "member") {
        if (fromIsGroup) return;
        const memberProject = projects.find((p) => p.id === targetId);
        if (!memberProject?.groupId) return;
        moveProjectIntoGroup(fromId, memberProject.groupId, {
          refMemberId: targetId,
          position: zone,
        });
        return;
      }

      // 目标是顶层 project / group
      if (fromIsGroup) {
        reorderSidebarEntries(fromId, targetId, zone);
        return;
      }
      const fromProject = projects.find((p) => p.id === fromId);
      if (!fromProject) return;
      if (fromProject.groupId) {
        // 从组里拖出来 → 变独立项目
        detachProjectToTopLevel(fromId, { refKey: targetId, position: zone });
        return;
      }
      reorderSidebarEntries(fromId, targetId, zone);
    },
    [
      draggingId,
      dropTarget,
      projects,
      projectGroups,
      reorderSidebarEntries,
      createGroupFromProjects,
      moveProjectIntoGroup,
      detachProjectToTopLevel,
    ],
  );

  return (
    <aside
      className="relative flex flex-col border-r h-full flex-shrink-0 overflow-hidden select-none"
      data-active-not-expanded={!activeProjectExpanded && !!activeProject}
      style={{
        /* 宽度平滑过渡：240px ↔ 48px；拖拽时关闭过渡避免延迟感 */
        width: sidebarOpen ? sidebarWidth : sidebarCollapsedWidth,
        minWidth: sidebarOpen ? sidebarWidth : sidebarCollapsedWidth,
        backgroundColor: "var(--sg-bg-sidebar, #0d0e13)",
        borderColor: "var(--sg-border-primary, #1a1c23)",
        transition: isResizing
          ? "none"
          : "width 200ms var(--sg-ease-out, ease-out), min-width 200ms var(--sg-ease-out, ease-out)",
      }}
    >
      {/* 兜底 sync：active project 未展开时也保持 git 状态实时 */}
      {activeProject && !activeProjectExpanded && (
        <HiddenProjectGitSync project={activeProject} />
      )}

      {/*
        Changes 视图下，ProjectItem header 会在折叠态展示项目总 +/- 统计，
        所以折叠的项目也必须保持 git 状态同步。active project 已经由上面那段
        兜底（若未展开），这里只补剩下的折叠项目。
      */}
      {viewMode === "changes" &&
        projects.map((p) => {
          if (expandedProjectIds[p.id]) return null;
          if (activeProject && p.id === activeProject.id) return null;
          return <HiddenProjectGitSync key={p.id} project={p} />;
        })}

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

          {/* Workspace Switcher —— 折叠态的图标入口 */}
          <WorkspaceSwitcher collapsed />

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

      {/* 右缘拖拽握把 — 4px 命中区，hover 时在 1px 边线处显示蓝色高亮 */}
      {sidebarOpen && (
        <div
          className="absolute top-0 right-0 h-full group z-10"
          style={{
            width: 4,
            cursor: "col-resize",
            transform: "translateX(2px)", // 跨越边框，让命中区包含边框两侧
          }}
          onMouseDown={handleResizeStart}
        >
          <div
            className="absolute top-0 bottom-0 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ width: 2, backgroundColor: "var(--sg-accent)" }}
          />
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
          {/* sb-head — workspace switcher + add project (设计稿 grid 1fr auto) */}
          <div
            className="flex items-center flex-shrink-0"
            style={{
              padding: "0 6px 0 0",
              gap: 4,
              borderBottom: "1px solid var(--sg-border-primary)",
            }}
          >
            <div className="flex-1 min-w-0">
              <WorkspaceSwitcher />
            </div>
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
              <>
                {/* 全局视图切换条 — 所有项目共享的 Files/Changes/History 切换 */}
                <ScopeSwitcher />
                <div className="flex-1 overflow-y-auto">
                  {sidebarRows.map((row) => {
                    if (row.kind === "project") {
                      const project = row.project;
                      const isActive = activeProject?.id === project.id;
                      const isExpanded = !!expandedProjectIds[project.id];
                      const isDragging = draggingId === project.id;
                      const target =
                        dropTarget?.id === project.id ? dropTarget : null;
                      return (
                        <div
                          key={`p-${project.id}`}
                          ref={registerFlipRef(`p-${project.id}`)}
                          className="flex flex-col flex-shrink-0 relative"
                          style={{
                            opacity: isDragging ? 0.4 : 1,
                            willChange: isDragging
                              ? "transform, opacity"
                              : undefined,
                          }}
                        >
                          <div className="relative">
                            <ProjectItem
                              project={project}
                              isActive={isActive}
                              isExpanded={isExpanded}
                              dragProps={{
                                draggable: true,
                                onDragStart: (e) =>
                                  handleRowDragStart(e, project.id),
                                onDragOver: (e) =>
                                  handleRowDragOver(
                                    e,
                                    project.id,
                                    "project-top",
                                  ),
                                onDragEnd: handleRowDragEnd,
                                onDrop: (e) =>
                                  handleRowDrop(e, project.id, "project-top"),
                              }}
                            />
                            {target && <DropIndicator zone={target.zone} />}
                          </div>
                          {isExpanded && <ProjectBody project={project} />}
                        </div>
                      );
                    }

                    // row.kind === "group"
                    const group = row.group;
                    const groupExpanded = !!expandedProjectIds[group.id];
                    const isDragging = draggingId === group.id;
                    const groupTarget =
                      dropTarget?.id === group.id ? dropTarget : null;
                    return (
                      <div
                        key={`g-${group.id}`}
                        ref={registerFlipRef(`g-${group.id}`)}
                        className="flex flex-col flex-shrink-0 relative"
                        style={{
                          opacity: isDragging ? 0.4 : 1,
                          willChange: isDragging
                            ? "transform, opacity"
                            : undefined,
                        }}
                      >
                        <div className="relative">
                          <ProjectGroupItem
                            group={group}
                            members={row.members}
                            isExpanded={groupExpanded}
                            onToggleExpanded={() =>
                              toggleProjectExpanded(group.id)
                            }
                            dragProps={{
                              draggable: true,
                              onDragStart: (e) =>
                                handleRowDragStart(e, group.id),
                              onDragOver: (e) =>
                                handleRowDragOver(e, group.id, "group"),
                              onDragEnd: handleRowDragEnd,
                              onDrop: (e) =>
                                handleRowDrop(e, group.id, "group"),
                            }}
                          />
                          {groupTarget && (
                            <DropIndicator zone={groupTarget.zone} />
                          )}
                        </div>
                        {/* 组展开 → 成员（ProjectItem，depth=1） */}
                        {groupExpanded &&
                          row.members.map((member) => {
                            const memberActive =
                              activeProject?.id === member.id;
                            const memberExpanded =
                              !!expandedProjectIds[member.id];
                            const memberDragging = draggingId === member.id;
                            const memberTarget =
                              dropTarget?.id === member.id ? dropTarget : null;
                            return (
                              <div
                                key={member.id}
                                className="flex flex-col flex-shrink-0"
                                style={{
                                  opacity: memberDragging ? 0.4 : 1,
                                  willChange: memberDragging
                                    ? "transform, opacity"
                                    : undefined,
                                }}
                              >
                                <div className="relative">
                                  <ProjectItem
                                    project={member}
                                    isActive={memberActive}
                                    isExpanded={memberExpanded}
                                    depth={1}
                                    dragProps={{
                                      draggable: true,
                                      onDragStart: (e) =>
                                        handleRowDragStart(e, member.id),
                                      onDragOver: (e) =>
                                        handleRowDragOver(
                                          e,
                                          member.id,
                                          "member",
                                        ),
                                      onDragEnd: handleRowDragEnd,
                                      onDrop: (e) =>
                                        handleRowDrop(e, member.id, "member"),
                                    }}
                                  />
                                  {memberTarget && (
                                    <DropIndicator zone={memberTarget.zone} />
                                  )}
                                </div>
                                {memberExpanded && (
                                  <ProjectBody project={member} />
                                )}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

/** 展开后的项目内容 — 按全局 viewMode 切视图
 *
 * 这里挂 useProjectGitSync 是关键：每个展开的项目都有独立的 git 同步，
 * 切换 active 项目不会影响其他展开项目的状态实时性。
 *
 * 当 project 是 group member（有 groupId）时，整块内容（FileTree / ChangesView /
 * HistoryView）套一层左缘 tree-guide 竖线，视觉上和父 group member 绑定。
 * 只吃 10px 左侧 gutter，不做真正意义的缩进，避免压缩内部横向空间。
 */
function ProjectBody({ project }: { project: Project }) {
  const mode = useProjectStore((s) => s.viewMode);
  useProjectGitSync(project);
  const content = (
    <>
      {mode === "files" && <FileTree project={project} />}
      {mode === "changes" && <ChangesView project={project} />}
      {mode === "history" && <HistoryView project={project} />}
    </>
  );
  if (!project.groupId) return content;
  return (
    <div className="relative" style={{ paddingLeft: 10 }}>
      {/* tree guide rail —— 左缘 2px 蓝色竖线，视觉上把这块内容挂在父 group member 下 */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: 3,
          top: 0,
          bottom: 0,
          width: 2,
          borderRadius: 1,
          background: "rgba(74, 158, 255, 0.32)",
        }}
      />
      {content}
    </div>
  );
}

/** 兜底组件：用在 active project 未展开的场景。无 UI，只负责挂 hook */
function HiddenProjectGitSync({ project }: { project: Project }) {
  useProjectGitSync(project);
  return null;
}

/**
 * 拖拽落点指示器
 * - before / after：蓝色横线（2px 全宽）
 * - into：蓝色内嵌外框 + 半透明填色（合入组 / 合成组）
 */
function DropIndicator({ zone }: { zone: "before" | "into" | "after" }) {
  if (zone === "into") {
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          border: "1.5px solid #4a9eff",
          borderRadius: 3,
          background: "rgba(74,158,255,0.10)",
          boxShadow: "0 0 0 1px rgba(74,158,255,0.25) inset",
          zIndex: 10,
        }}
      />
    );
  }
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none"
      style={{
        [zone === "before" ? "top" : "bottom"]: -1,
        height: 2,
        background: "#4a9eff",
        boxShadow: "0 0 6px rgba(74,158,255,0.7)",
        zIndex: 10,
      }}
    />
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
