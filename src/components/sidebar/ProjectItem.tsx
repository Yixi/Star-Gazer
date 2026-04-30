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
  FolderGit2,
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

  // 该项目下第一个运行中 agent 的颜色 —— 圆点跟着这个 agent 的色盘走，
  // 视觉上和 AgentCard header 上的圆点对齐，不再固定绿色。
  //
  // 匹配优先级：
  // 1. agent.scope.kind === "project" 显式关联这个 project
  // 2. agent.scope.kind === "group" 关联这个 project 所属的组
  // 3. 老 agent 没 scope 字段 → 降级到 cwd.startsWith(project.path)
  const runningAgentColorHex = (() => {
    const match = agents.find((a) => {
      if (a.status !== "running") return false;
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
    return match ? AGENT_COLOR_HEX[match.color] : null;
  })();

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

  // Changes 视图下，折叠态也要在 header 展示项目总 +/- 统计
  const viewMode = useProjectStore((s) => s.viewMode);
  const projectGitStatus = useProjectStore(
    (s) => s.gitStatusByProject[project.id],
  );
  const diffSummary = useMemo(() => {
    if (viewMode !== "changes" || !projectGitStatus) return null;
    // staged + unstaged 全部累加。ChangesView 的合并策略是按 path dedupe 后
    // 再各自 += additions/deletions —— 总和等价于这里的简单相加。
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
  }, [viewMode, projectGitStatus]);

  return (
    <>
      <button
        className="w-full flex items-center cursor-pointer select-none group"
        style={{
          padding: `9px 12px 9px ${10 + depth * 16}px`,
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
        {...(dragProps ?? {})}
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
        {/* 运行状态指示 —— 颜色跟第一个匹配 running agent 对齐 */}
        {runningAgentColorHex && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: runningAgentColorHex,
              boxShadow: `0 0 6px ${runningAgentColorHex}60`,
            }}
          />
        )}
        {/* Git 分支切换器 — badge 形态，点击弹下拉 */}
        {isExpanded && gitBranch && (
          <BranchSwitcher
            projectId={project.id}
            projectPath={project.path}
            currentBranch={gitBranch}
          />
        )}
        {/* Changes 视图折叠态：项目级 +/- 统计 */}
        {!isExpanded && diffSummary && (
          <span
            className="flex-shrink-0 tabular-nums flex items-center gap-1"
            style={{
              fontSize: 10,
              fontFamily: "'SF Mono', Menlo, monospace",
              fontWeight: 500,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            {diffSummary.add > 0 && (
              <span style={{ color: "#22c55e" }}>+{diffSummary.add}</span>
            )}
            {diffSummary.del > 0 && (
              <span style={{ color: "#ef4444" }}>-{diffSummary.del}</span>
            )}
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
