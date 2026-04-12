/**
 * 项目列表项组件
 *
 * 支持点击切换、右键上下文菜单
 *
 * 右键菜单（按 PRD 规格）：
 * - New Claude Code (Cmd+1)
 * - New OpenCode (Cmd+2)
 * - New Codex (Cmd+3)
 * - New Custom Command...
 * ---
 * - Reveal in Finder
 * - Close Project
 * - Remove from Star Gazer
 */
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Trash2,
  ExternalLink,
  Terminal,
  XCircle,
  Code,
  Cpu,
  Settings,
  FolderGit2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useCanvasStore } from "@/stores/canvasStore";
import type { Project } from "@/types/project";

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  isExpanded: boolean;
}

export function ProjectItem({ project, isActive, isExpanded }: ProjectItemProps) {
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const toggleProjectExpanded = useProjectStore((s) => s.toggleProjectExpanded);
  const removeProject = useProjectStore((s) => s.removeProject);
  const agents = useCanvasStore((s) => s.agents);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 该项目下是否有运行中的 agent
  const hasRunningAgent = agents.some(
    (a) => a.cwd.startsWith(project.path) && a.status === "running"
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // 点击外部关闭上下文菜单
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

  const closeMenu = () => setContextMenu(null);

  const handleRemove = async () => {
    // 从后端持久化中移除
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_project", { id: project.id });
    } catch (err) {
      console.warn("Backend remove_project failed:", err);
    }
    removeProject(project.id);
    closeMenu();
  };

  const handleCloseProject = async () => {
    if (isActive) {
      setActiveProject(null);
    }
    // 从后端持久化中移除
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_project", { id: project.id });
    } catch (err) {
      console.warn("Backend remove_project failed:", err);
    }
    removeProject(project.id);
    closeMenu();
  };

  const handleRevealInFinder = async () => {
    try {
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(project.path);
    } catch {
      console.warn("Reveal in Finder not available");
    }
    closeMenu();
  };

  // Agent 创建 - 会发送到画布
  const handleNewAgent = (agentType: string) => {
    // TODO: 实际创建 agent 时需要调用 canvas store
    console.log(`Creating ${agentType} agent for ${project.name}`);
    closeMenu();
  };

  // 获取本项目自己的 git 分支名（从 gitStatusByProject 派生）
  // 以前用的是全局 s.gitBranch —— 那是 active project 的分支，多项目场景下
  // 所有项目都会显示同一个分支，是错的。现在按 project.id 精确取本项目的。
  const gitBranch = useProjectStore(
    (s) => s.gitStatusByProject[project.id]?.branch ?? "",
  );

  return (
    <>
      <button
        className="w-full flex items-center cursor-pointer select-none group"
        style={{
          padding: "9px 12px 9px 10px",
          gap: 8,
          fontSize: 12,
          color: isActive ? "#ffffff" : "#c8ccd3",
          fontWeight: 600,
          letterSpacing: "0.2px",
          textTransform: "uppercase",
          /* 项目作为一级容器：顶部分隔线 + 浅色背景 */
          background: isActive
            ? "linear-gradient(90deg, rgba(74,158,255,0.08) 0%, rgba(74,158,255,0.02) 100%)"
            : "#0b0c11",
          borderTop: "1px solid #1a1c23",
          borderBottom: isExpanded ? "1px solid #13151b" : "none",
          position: "relative",
        }}
        onClick={() => {
          toggleProjectExpanded(project.id);
          setActiveProject(project);
        }}
        onContextMenu={handleContextMenu}
      >
        {/* 左侧高亮竖条 — active 状态 */}
        {isActive && (
          <span
            className="absolute left-0 top-0 bottom-0"
            style={{
              width: 2,
              backgroundColor: "#4a9eff",
              boxShadow: "0 0 8px rgba(74,158,255,0.6)",
            }}
          />
        )}
        {/* Caret — lucide 图标 */}
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: "#8b92a3" }} />
        ) : (
          <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: "#8b92a3" }} />
        )}
        {/* 项目图标 — FolderGit2 强化区分 */}
        <FolderGit2
          className="w-4 h-4 flex-shrink-0"
          style={{ color: isActive ? "#4a9eff" : "#8b92a3" }}
        />
        {/* 项目名 */}
        <span
          className="truncate flex-1 text-left"
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: "none",
            letterSpacing: 0,
            color: isActive ? "#ffffff" : "#e4e6eb",
          }}
        >
          {project.name}
        </span>
        {/* 运行状态指示 */}
        {hasRunningAgent && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: "#22c55e",
              boxShadow: "0 0 6px rgba(34,197,94,0.6)",
            }}
          />
        )}
        {/* Git 分支标签 — 小型 badge */}
        {isExpanded && gitBranch && (
          <span
            className="flex-shrink-0 tabular-nums"
            style={{
              fontSize: 9,
              color: "#8b92a3",
              fontWeight: 500,
              fontFamily: "'SF Mono', Menlo, monospace",
              padding: "2px 6px",
              borderRadius: 3,
              background: "rgba(139,146,163,0.08)",
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {gitBranch}
          </span>
        )}
      </button>

      {/* 右键上下文菜单 — 通过 Portal 渲染到 body，避免被 Sidebar/Panel 遮挡 */}
      {contextMenu && createPortal(
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
          {/* 新建 Agent 部分 */}
          <div
            className="px-2 py-1 text-[10px] uppercase tracking-wider"
            style={{ color: "#6b7280" }}
          >
            新建 Agent
          </div>
          <ContextMenuItem
            icon={<Terminal className="w-3.5 h-3.5" />}
            label="New Claude Code"
            shortcut="⌘1"
            onClick={() => handleNewAgent("claude-code")}
          />
          <ContextMenuItem
            icon={<Code className="w-3.5 h-3.5" />}
            label="New OpenCode"
            shortcut="⌘2"
            onClick={() => handleNewAgent("opencode")}
          />
          <ContextMenuItem
            icon={<Cpu className="w-3.5 h-3.5" />}
            label="New Codex"
            shortcut="⌘3"
            onClick={() => handleNewAgent("codex")}
          />
          <ContextMenuItem
            icon={<Settings className="w-3.5 h-3.5" />}
            label="New Custom Command..."
            onClick={() => handleNewAgent("custom")}
          />

          <MenuDivider />

          {/* 项目管理部分 */}
          <ContextMenuItem
            icon={<ExternalLink className="w-3.5 h-3.5" />}
            label="Reveal in Finder"
            onClick={handleRevealInFinder}
          />
          <ContextMenuItem
            icon={<XCircle className="w-3.5 h-3.5" />}
            label="Close Project"
            onClick={handleCloseProject}
          />

          <MenuDivider />

          <ContextMenuItem
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label="Remove from Star Gazer"
            onClick={handleRemove}
            danger
          />
        </div>,
        document.body
      )}
    </>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t" style={{ borderColor: "#2a2d36" }} />;
}

function ContextMenuItem({
  icon,
  label,
  shortcut,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
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
      {shortcut && (
        <span className="text-[10px]" style={{ color: "#6b7280" }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}
