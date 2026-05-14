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
import { useState, useMemo } from "react";
import {
  Trash2,
  ExternalLink,
  Terminal,
  XCircle,
  Code,
  Cpu,
  Settings,
  FilePlus,
  FolderPlus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useFileTreeUIStore } from "@/stores/fileTreeUIStore";
import { AGENT_COLOR_HEX } from "@/constants/agentColors";
import {
  ContextMenu,
  ContextMenuItem,
  MenuDivider,
} from "@/components/ui/ContextMenu";
import { BranchSwitcher } from "./BranchSwitcher";
import type { Project } from "@/types/project";

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  isExpanded: boolean;
  /** 缩进层级（组成员为 1，独立项目为 0） */
  depth?: number;
  /**
   * 拖拽相关 props —— 直接挂到内部 <button> 上。
   *
   * 注意：必须挂在 button 本身，不能套一层 draggable 的 wrapper div。
   * WKWebView（Tauri）下，button 的 mousedown 会压制外层 div 的 drag，
   * 导致拖不起来。Chromium 行为和 WebKit 不一致，踩过坑。
   */
  dragProps?: {
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
  };
}

export function ProjectItem({
  project,
  isActive,
  isExpanded,
  depth = 0,
  dragProps,
}: ProjectItemProps) {
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const toggleProjectExpanded = useProjectStore((s) => s.toggleProjectExpanded);
  const removeProject = useProjectStore((s) => s.removeProject);
  const agents = useCanvasStore((s) => s.agents);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const startCreate = useFileTreeUIStore((s) => s.startCreate);

  // 该项目下所有关联的 agent 颜色（去重 + 保序）
  // 匹配优先级：
  // 1. agent.scope.kind === "project" 显式关联这个 project
  // 2. agent.scope.kind === "group" 关联这个 project 所属的组
  // 3. 老 agent 没 scope 字段 → 降级到 cwd.startsWith(project.path)
  const projectAgents = useMemo(() => {
    return agents.filter((a) => {
      if (a.scope?.kind === "project" && a.scope.projectId === project.id) return true;
      if (
        a.scope?.kind === "group" &&
        project.groupId &&
        a.scope.groupId === project.groupId
      ) {
        return true;
      }
      if (!a.scope && a.cwd.startsWith(project.path)) return true;
      return false;
    });
  }, [agents, project.id, project.groupId, project.path]);

  const agentColors = useMemo(() => {
    const seen = new Set<string>();
    const colors: string[] = [];
    for (const a of projectAgents) {
      const hex = AGENT_COLOR_HEX[a.color];
      if (!seen.has(hex)) {
        seen.add(hex);
        colors.push(hex);
      }
    }
    return colors;
  }, [projectAgents]);

  const hasRunningAgent = projectAgents.some((a) => a.status === "running");

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setContextMenu(null);

  const handleNewFile = () => {
    // 项目根上新建文件 — 必须先把项目展开，否则占位 input 不会出现在视野里
    if (!isExpanded) toggleProjectExpanded(project.id);
    startCreate(project.id, "__root__", project.path, "create-file");
    closeMenu();
  };

  const handleNewFolder = () => {
    if (!isExpanded) toggleProjectExpanded(project.id);
    startCreate(project.id, "__root__", project.path, "create-dir");
    closeMenu();
  };

  const handleRemove = () => {
    // 纯前端操作，workspace autosave 会把新 projects 列表写回磁盘
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

  // 获取本项目自己的 git 分支名（从 gitStatusByProject 派生）
  // 以前用的是全局 s.gitBranch —— 那是 active project 的分支，多项目场景下
  // 所有项目都会显示同一个分支，是错的。现在按 project.id 精确取本项目的。
  const gitBranch = useProjectStore(
    (s) => s.gitStatusByProject[project.id]?.branch ?? "",
  );

  // Lane head 总览：ahead/behind + +/- 总改动 + agent stack
  // —— 任何视图下都显示在 header 右侧（设计稿的 lane-head .meta）
  const projectGitStatus = useProjectStore(
    (s) => s.gitStatusByProject[project.id],
  );
  const ahead = projectGitStatus?.ahead ?? 0;
  const behind = projectGitStatus?.behind ?? 0;
  const diffSummary = useMemo(() => {
    if (!projectGitStatus) return null;
    let add = 0;
    let del = 0;
    for (const c of projectGitStatus.staged) {
      add += c.additions;
      del += c.deletions;
    }
    for (const c of projectGitStatus.unstaged) {
      add += c.additions;
      del += c.deletions;
    }
    if (add === 0 && del === 0) return null;
    return { add, del };
  }, [projectGitStatus]);

  // 项目代表色 — 优先使用第一个 agent 颜色，否则 accent
  const projectColor = agentColors[0] ?? "#4a9eff";

  return (
    <>
      <button
        className="w-full flex items-center cursor-pointer select-none group transition-colors"
        style={{
          height: 34,
          padding: `0 12px 0 ${10 + depth * 16}px`,
          gap: 8,
          color: isActive ? "var(--sg-text-primary)" : "var(--sg-text-secondary)",
          background: isActive
            ? "rgba(74, 158, 255, 0.04)"
            : "var(--sg-bg-sidebar)",
          border: "none",
          borderTop: "1px solid var(--sg-border-primary)",
          borderBottom: isExpanded ? "1px solid var(--sg-border-primary)" : "none",
          position: "relative",
        }}
        onClick={() => {
          toggleProjectExpanded(project.id);
          setActiveProject(project);
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = "rgba(255, 255, 255, 0.025)";
        }}
        onMouseLeave={(e) => {
          if (!isActive)
            e.currentTarget.style.background = "var(--sg-bg-sidebar)";
        }}
        {...(dragProps ?? {})}
      >
        {/* 左侧高亮竖条 — active 状态，2px 项目色 + 发光 */}
        {isActive && (
          <span
            className="absolute left-0 top-0 bottom-0 pointer-events-none"
            style={{
              width: 2,
              background: projectColor,
              boxShadow: `0 0 8px ${projectColor}80`,
            }}
          />
        )}
        {/* Caret */}
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: "var(--sg-text-hint)" }} />
        ) : (
          <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: "var(--sg-text-hint)" }} />
        )}
        {/* 项目名 + branch 内联 — name 用 ui font，branch 用 mono / hint 色 */}
        <span
          className="truncate flex items-baseline min-w-0 flex-1"
          style={{ gap: 8 }}
        >
          <span
            className="truncate"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              color: "var(--sg-text-primary)",
            }}
          >
            {project.name}
          </span>
          {gitBranch && (
            <BranchSwitcher
              projectId={project.id}
              projectPath={project.path}
              currentBranch={gitBranch}
            />
          )}
        </span>

        {/* Lane meta：ahead/behind + +/- + agents stack + live dot */}
        <span
          className="flex-shrink-0 inline-flex items-center"
          style={{
            gap: 6,
            fontFamily: "var(--sg-font-mono)",
            fontSize: 10,
            fontWeight: 500,
            lineHeight: 1,
            color: "var(--sg-text-hint)",
          }}
        >
          {ahead > 0 && (
            <span style={{ color: "var(--sg-success)" }}>↑{ahead}</span>
          )}
          {behind > 0 && (
            <span style={{ color: "var(--sg-warning)" }}>↓{behind}</span>
          )}
          {diffSummary?.add ? (
            <span style={{ color: "var(--sg-success)" }}>+{diffSummary.add}</span>
          ) : null}
          {diffSummary?.del ? (
            <span style={{ color: "var(--sg-error)" }}>−{diffSummary.del}</span>
          ) : null}
          {hasRunningAgent && (
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--sg-accent)",
                boxShadow: "0 0 6px var(--sg-accent)",
                animation: "sg-breathe 1.4s ease-in-out infinite",
                marginLeft: 2,
              }}
            />
          )}
        </span>

        {/* Agents 色点 stack */}
        {agentColors.length > 0 && (
          <span
            className="flex-shrink-0 inline-flex items-center"
            style={{ gap: 3, marginLeft: 2 }}
          >
            {agentColors.slice(0, 4).map((c, i) => (
              <span
                key={i}
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: c,
                  boxShadow: `0 0 4px ${c}80`,
                }}
              />
            ))}
          </span>
        )}
      </button>

      {/* 右键上下文菜单 — 通过 Portal 渲染到 body，避免被 Sidebar/Panel 遮挡 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeMenu}
        >
          {/* 文件系统操作 */}
          <ContextMenuItem
            icon={<FilePlus className="w-3.5 h-3.5" />}
            label="New File"
            onClick={handleNewFile}
          />
          <ContextMenuItem
            icon={<FolderPlus className="w-3.5 h-3.5" />}
            label="New Folder"
            onClick={handleNewFolder}
          />

          <MenuDivider />

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
        </ContextMenu>
      )}
    </>
  );
}
