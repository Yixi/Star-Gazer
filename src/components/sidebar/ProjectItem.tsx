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
import {
  ChevronRight,
  Folder,
  Trash2,
  ExternalLink,
  Terminal,
  XCircle,
  Code,
  Cpu,
  Settings,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useCanvasStore } from "@/stores/canvasStore";
import type { Project } from "@/types/project";

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
}

export function ProjectItem({ project, isActive }: ProjectItemProps) {
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
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

  const handleRemove = () => {
    removeProject(project.id);
    closeMenu();
  };

  const handleCloseProject = () => {
    if (isActive) {
      setActiveProject(null);
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

  return (
    <>
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors group"
        style={{
          backgroundColor: isActive ? "rgba(74, 158, 255, 0.1)" : "transparent",
          color: isActive ? "#e4e6eb" : "#b8bcc4",
        }}
        onClick={() => setActiveProject(project)}
        onContextMenu={handleContextMenu}
      >
        <ChevronRight
          className="w-3 h-3 flex-shrink-0 transition-transform"
          style={{
            transform: isActive ? "rotate(90deg)" : "rotate(0deg)",
            color: "#8b92a3",
          }}
        />
        <Folder
          className="w-4 h-4 flex-shrink-0"
          style={{ color: isActive ? "#4a9eff" : "#8b92a3" }}
        />
        <span className="truncate flex-1 text-left">{project.name}</span>
        {/* 运行状态指示 */}
        {hasRunningAgent && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: "#22c55e" }}
          />
        )}
      </button>

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 rounded-lg shadow-xl py-1 min-w-[200px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
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
        </div>
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
