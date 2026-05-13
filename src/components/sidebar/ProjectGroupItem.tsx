/**
 * 项目组头部行
 *
 * 显示：Folders 图标 + 组名 + 成员计数 + caret（展开/折叠）+ 运行指示点。
 * 展开状态由父组件（Sidebar）管理，通过 expandedProjectIds 里以 group.id
 * 为 key 的条目控制（和 project 展开状态共享 namespace —— 两者 id 不会
 * 冲突，因为 group id 带 `group-` 前缀）。
 *
 * 右键菜单：重命名 / 删除整个组 / 解组（成员转为独立项目）。
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  FolderMinus,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useCanvasStore } from "@/stores/canvasStore";
import type { ProjectGroup, Project } from "@/types/project";

interface ProjectGroupItemProps {
  group: ProjectGroup;
  members: Project[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  /** 透传到内部 <button> 的 drag props（见 ProjectItem 同名 prop 的说明） */
  dragProps?: {
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
  };
}

/** 防御性取显示名：group.name 为空时降级到 path 的 basename */
function resolveGroupDisplayName(group: ProjectGroup): string {
  if (group.name && group.name.trim() !== "") return group.name;
  const seg = group.path.split("/").filter(Boolean).pop();
  return seg && seg !== "" ? seg : "项目组";
}

export function ProjectGroupItem({
  group,
  members,
  isExpanded,
  onToggleExpanded,
  dragProps,
}: ProjectGroupItemProps) {
  const removeProjectGroup = useProjectStore((s) => s.removeProjectGroup);
  const renameProjectGroup = useProjectStore((s) => s.renameProjectGroup);
  const projects = useProjectStore((s) => s.projects);
  const setProjects = (fn: (projects: Project[]) => Project[]) => {
    useProjectStore.setState((state) => ({ projects: fn(state.projects) }));
  };
  const agents = useCanvasStore((s) => s.agents);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 运行指示点：任一 agent 引用了这个组 → 亮
  const hasRunningAgent = useMemo(() => {
    return agents.some((a) => {
      if (a.status !== "running") return false;
      if (a.scope?.kind === "group" && a.scope.groupId === group.id) return true;
      // 向后兼容：老 agent 没 scope，按 cwd.startsWith(group.path) 判断
      if (!a.scope && a.cwd.startsWith(group.path)) return true;
      return false;
    });
  }, [agents, group.id, group.path]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isEditing]);

  const closeMenu = () => setContextMenu(null);

  const startRename = () => {
    setEditName(group.name);
    setIsEditing(true);
    closeMenu();
  };

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== group.name) {
      renameProjectGroup(group.id, trimmed);
    }
    setIsEditing(false);
  };

  const cancelRename = () => {
    setEditName(group.name);
    setIsEditing(false);
  };

  const handleDeleteGroup = () => {
    removeProjectGroup(group.id);
    closeMenu();
  };

  /**
   * 解组：成员变独立项目。
   * 做法：把成员的 groupId 清掉，删 group 本身。引用该组的 agent scope
   * 也失效 —— 复用 removeProjectGroup 不行（它会删成员），这里手写。
   */
  const handleUngroup = () => {
    const memberIds = new Set(
      projects.filter((p) => p.groupId === group.id).map((p) => p.id),
    );
    setProjects((list) =>
      list.map((p) => {
        if (!memberIds.has(p.id)) return p;
        const next: Project = { ...p };
        delete next.groupId;
        return next;
      }),
    );
    useProjectStore.setState((state) => ({
      projectGroups: state.projectGroups.filter((g) => g.id !== group.id),
    }));
    useCanvasStore.getState().clearAgentScopesForGroup(group.id);
    closeMenu();
  };

  const groupGlyph =
    resolveGroupDisplayName(group)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "GRP";

  return (
    <>
      <button
        className="w-full flex items-center cursor-pointer select-none group transition-colors"
        style={{
          height: 34,
          padding: "0 12px 0 10px",
          gap: 8,
          color: "var(--sg-text-secondary)",
          background: "var(--sg-bg-sidebar)",
          border: "none",
          borderTop: "1px solid var(--sg-border-primary)",
          borderBottom: isExpanded ? "1px solid var(--sg-border-primary)" : "none",
          position: "relative",
        }}
        onClick={() => {
          if (isEditing) return;
          onToggleExpanded();
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.025)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--sg-bg-sidebar)";
        }}
        {...(dragProps ?? {})}
      >
        {/* caret */}
        {isExpanded ? (
          <ChevronDown
            className="w-3 h-3 flex-shrink-0"
            style={{ color: "var(--sg-text-hint)" }}
          />
        ) : (
          <ChevronRight
            className="w-3 h-3 flex-shrink-0"
            style={{ color: "var(--sg-text-hint)" }}
          />
        )}
        {/* 22x22 组 glyph — 紫色渐变（区别于 project 的纯色） */}
        <span
          aria-hidden
          className="flex-shrink-0 inline-flex items-center justify-center"
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: "linear-gradient(135deg, #a78bfa, #4a9eff)",
            fontFamily: "var(--sg-font-mono)",
            fontWeight: 700,
            fontSize: 8.5,
            lineHeight: 1,
            color: "#06121f",
            boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.06) inset",
          }}
        >
          {groupGlyph}
        </span>
        {/* 组名（或编辑输入） */}
        {isEditing ? (
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none"
            style={{
              color: "var(--sg-text-primary)",
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              border: "1px solid var(--sg-accent)",
              borderRadius: 3,
              padding: "1px 4px",
            }}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            onBlur={commitRename}
          />
        ) : (
          <span
            className="truncate flex-1 text-left min-w-0"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              color: "var(--sg-text-primary)",
            }}
          >
            {resolveGroupDisplayName(group)}
          </span>
        )}
        {/* 成员计数 — 圆角胶囊 */}
        <span
          className="flex-shrink-0 tabular-nums"
          style={{
            fontSize: 9.5,
            color: "var(--sg-text-hint)",
            fontWeight: 500,
            fontFamily: "var(--sg-font-mono)",
            padding: "2px 5px",
            borderRadius: 999,
            background: "rgba(255, 255, 255, 0.04)",
          }}
        >
          {members.length}
        </span>
        {/* 运行指示点 */}
        {hasRunningAgent && (
          <span
            className="flex-shrink-0"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--sg-success)",
              boxShadow: "0 0 6px rgba(34, 197, 94, 0.6)",
            }}
          />
        )}
      </button>

      {contextMenu &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed rounded-lg shadow-xl py-1 min-w-[200px]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 9999,
              backgroundColor: "#1a1c23",
              border: "1px solid #2a2d36",
            }}
          >
            <MenuItem
              icon={<Edit2 className="w-3.5 h-3.5" />}
              label="重命名组"
              onClick={startRename}
            />
            <MenuItem
              icon={<FolderMinus className="w-3.5 h-3.5" />}
              label="解组（成员变独立项目）"
              onClick={handleUngroup}
            />
            <div className="my-1 border-t" style={{ borderColor: "#2a2d36" }} />
            <MenuItem
              icon={<Trash2 className="w-3.5 h-3.5" />}
              label="删除整组（含所有成员）"
              onClick={handleDeleteGroup}
              danger
            />
          </div>,
          document.body,
        )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
      style={{ color: danger ? "#ef4444" : "#e4e6eb" }}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
