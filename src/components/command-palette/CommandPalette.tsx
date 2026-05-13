/**
 * 命令面板 - 基于 cmdk 的全局命令搜索
 *
 * 快捷键：
 * - Cmd+K 呼出/关闭命令面板
 * - Cmd+P 快速打开文件
 * - Cmd+O 直接触发"添加项目"
 *
 * 前缀过滤：
 * - > 命令
 * - # 文件
 * - @ agent
 *
 * 选中 Agent/终端相关命令会通过 window CustomEvent 通知 Canvas 打开 AgentPicker。
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Command } from "cmdk";
import {
  Plus,
  FolderOpen,
  Search,
  Terminal,
  Eye,
  EyeOff,
  PanelRightOpen,
  PanelRightClose,
  Bot,
  Layers,
} from "lucide-react";
import { FileIcon } from "@/utils/fileIcon";
import { useProjectStore } from "@/stores/projectStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { usePanelStore } from "@/stores/panelStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import * as workspaceService from "@/services/workspace";
import type { FileNode } from "@/types/project";
import type { RecentEntry } from "@/types/workspace";

const SGW_FILTERS = [
  { name: "Star Gazer Workspace", extensions: ["sgw"] },
];

/** 稳定空数组，避免 Zustand selector 无限循环 */
const EMPTY_FILE_TREE: FileNode[] = [];

type PaletteMode = "command" | "file" | "agent";

export function CommandPalette() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>("command");
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const projects = useProjectStore((s) => s.projects);
  const activeProject = useProjectStore((s) => s.activeProject);
  const fileTree = useProjectStore((s) => {
    if (!s.activeProject) return EMPTY_FILE_TREE;
    return s.projectFileTrees[s.activeProject.id] ?? EMPTY_FILE_TREE;
  });
  const agents = useCanvasStore((s) => s.agents);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);
  const togglePanel = usePanelStore((s) => s.togglePanel);
  const panelIsOpen = usePanelStore((s) => s.isOpen);
  const openTab = usePanelStore((s) => s.openTab);
  const addProject = useProjectStore((s) => s.addProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const currentWorkspaceName = useWorkspaceStore((s) => s.currentName);
  const recentWorkspaces = useWorkspaceStore((s) => s.recent);

  // Cmd+K 命令面板 / Cmd+P 文件搜索 / Cmd+O 添加项目
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open && mode === "command") {
          setOpen(false);
        } else {
          setMode("command");
          setSearch("");
          setOpen(true);
        }
      }
      if (e.key === "p" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        if (open && mode === "file") {
          setOpen(false);
        } else {
          setMode("file");
          setSearch("");
          setOpen(true);
        }
      }
      if (e.key === "o" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        handleAddProject();
      }
      // Shift+Cmd+O 打开 workspace 文件
      if (e.key === "O" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        handleOpenWorkspace();
      }
      // Shift+Cmd+N 新建 workspace
      if (e.key === "N" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        handleNewWorkspace();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    // 外部呼出（TitleBar 的 chip 点击等）
    const openCommandPalette = () => {
      setMode("command");
      setSearch("");
      setOpen(true);
    };
    window.addEventListener("stargazer:open-command-palette", openCommandPalette);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("stargazer:open-command-palette", openCommandPalette);
    };
    // handleAddProject 稳定引用来自 useCallback，依赖 addProject/setActiveProject
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  // 打开时把焦点强制落回输入框，避免被画布/侧边栏的 keydown 抢走
  useEffect(() => {
    if (!open) return;
    // 等 cmdk 挂载完再 focus
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, mode]);

  // 前缀过滤检测
  const handleSearchChange = useCallback((value: string) => {
    if (value.startsWith(">") && mode !== "command") {
      setMode("command");
      setSearch(value.slice(1).trimStart());
      return;
    }
    if (value.startsWith("#") && mode !== "file") {
      setMode("file");
      setSearch(value.slice(1).trimStart());
      return;
    }
    if (value.startsWith("@") && mode !== "agent") {
      setMode("agent");
      setSearch(value.slice(1).trimStart());
      return;
    }
    setSearch(value);
  }, [mode]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  // 收集所有文件（扁平化文件树）
  const allFiles = flattenFileTree(fileTree);

  // 添加项目 —— 智能分流：
  // - Single（目录是 git 仓库） → 直接添加
  // - Group（下面有子 git 仓库） → 关面板 + 派发事件，让 Sidebar 弹 ImportGroupDialog
  // - Empty → 降级为单目录添加
  // 持久化由 workspace autosave 负责。
  const handleAddProject = useCallback(async () => {
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t("project.selectFolder"),
      });
      if (!selected || typeof selected !== "string") {
        handleClose();
        return;
      }

      const newId = (prefix: string): string =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `${prefix}-${crypto.randomUUID()}`
          : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const basename = (p: string): string =>
        p.split("/").filter(Boolean).pop() ?? p;

      let scan: workspaceService.ScanGitReposResult;
      try {
        scan = await workspaceService.scanGitRepos(selected);
      } catch (err) {
        console.warn("scanGitRepos failed:", err);
        scan = { kind: "empty" };
      }

      if (scan.kind === "single") {
        const project = {
          id: newId("project"),
          name: scan.name,
          path: scan.path,
          lastOpened: Date.now(),
        };
        addProject(project);
        setActiveProject(project);
      } else if (scan.kind === "group") {
        const group = {
          id: newId("group"),
          name: scan.parentName,
          path: scan.parentPath,
        };
        const members = scan.members.map((m) => ({
          id: newId("project"),
          name: m.name,
          path: m.path,
          lastOpened: Date.now(),
        }));
        // 必须 await —— sync_workspace_project_paths 需要先落地，
        // 否则 FileTree 挂载后的 list_dir 会被后端沙箱拒
        await useProjectStore.getState().addProjectGroup(group, members);
        if (members.length > 0) {
          setActiveProject({ ...members[0], groupId: group.id });
        }
      } else {
        // empty：降级为单目录添加
        const project = {
          id: newId("project"),
          name: basename(selected),
          path: selected,
          lastOpened: Date.now(),
        };
        addProject(project);
        setActiveProject(project);
      }
    } catch (err) {
      console.warn("Tauri dialog not available:", err);
    }
    handleClose();
  }, [addProject, setActiveProject, handleClose]);

  // --- Workspace 操作 ---

  const handleOpenWorkspace = useCallback(async () => {
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openDialog({
        multiple: false,
        filters: SGW_FILTERS,
        title: t("workspace.openDialogTitle"),
      });
      if (selected && typeof selected === "string") {
        await workspaceService.openWorkspaceInWindow(selected);
      }
    } catch (err) {
      console.warn("打开 workspace 失败:", err);
    }
    handleClose();
  }, [handleClose]);

  const handleNewWorkspace = useCallback(async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const selected = await save({
        defaultPath: "workspace.sgw",
        filters: SGW_FILTERS,
        title: t("workspace.newDialogTitle"),
      });
      if (!selected) {
        handleClose();
        return;
      }
      const fileName =
        selected.split("/").pop() ?? selected.split("\\").pop() ?? "workspace";
      const name = fileName.replace(/\.sgw$/i, "") || "Workspace";
      await workspaceService.createWorkspaceFile(selected, name);
      await workspaceService.openWorkspaceInWindow(selected);
    } catch (err) {
      console.warn("新建 workspace 失败:", err);
    }
    handleClose();
  }, [handleClose]);

  const handleOpenRecentWorkspace = useCallback(
    async (entry: RecentEntry) => {
      try {
        await workspaceService.openWorkspaceInWindow(entry.path);
      } catch (err) {
        console.warn("打开 recent workspace 失败:", err);
      }
      handleClose();
    },
    [handleClose],
  );

  /** 通过 window 事件通知 Canvas 打开 AgentPicker，可选预设类型 */
  const openAgentPicker = useCallback(
    (initialType?: "claude-code" | "opencode" | "codex" | "custom") => {
      window.dispatchEvent(
        new CustomEvent("stargazer:open-agent-picker", {
          detail: { initialType },
        })
      );
      handleClose();
    },
    [handleClose]
  );

  /** 选中某个 agent 卡片：居中视图 + 关闭面板 */
  const focusAgent = useCallback(
    (id: string) => {
      useCanvasStore.getState().selectAgent(id);
      handleClose();
    },
    [handleClose]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* 遮罩 */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        onClick={handleClose}
      />

      {/* 命令面板 */}
      <Command
        loop
        className="relative w-[540px] rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "#1a1c23",
          border: "1px solid #2a2d36",
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Escape") handleClose();
        }}
      >
        {/* 搜索输入 */}
        <div
          className="flex items-center gap-2 px-4"
          style={{ borderBottom: "1px solid #2a2d36" }}
        >
          {/* 模式徽章 */}
          <span
            className="px-1.5 py-0.5 rounded text-[10px] uppercase flex-shrink-0"
            style={{
              backgroundColor:
                mode === "command"
                  ? "rgba(74, 158, 255, 0.15)"
                  : mode === "file"
                    ? "rgba(34, 197, 94, 0.15)"
                    : "rgba(167, 139, 250, 0.15)",
              color:
                mode === "command"
                  ? "#4a9eff"
                  : mode === "file"
                    ? "#22c55e"
                    : "#a78bfa",
            }}
          >
            {mode === "command" ? t("commandPalette.command") : mode === "file" ? t("commandPalette.file") : t("agent.title")}
          </span>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: "#6b7280" }} />
          <Command.Input
            ref={inputRef}
            autoFocus
            className="flex-1 h-11 bg-transparent text-sm outline-none"
            style={{ color: "#e4e6eb" }}
            placeholder={
              mode === "command"
                ? t("commandPalette.searchCommand")
                : mode === "file"
                  ? t("commandPalette.searchFile")
                  : t("commandPalette.searchAgent")
            }
            value={search}
            onValueChange={handleSearchChange}
          />
          {/* 快捷键提示 */}
          <span className="text-[10px] flex-shrink-0" style={{ color: "#6b7280" }}>
            {mode === "command" ? "⌘K" : mode === "file" ? "⌘P" : ""}
          </span>
        </div>

        <Command.List
          className="max-h-[340px] overflow-y-auto p-1.5"
          style={{ scrollbarWidth: "thin" }}
        >
          <Command.Empty
            className="py-8 text-center text-sm"
            style={{ color: "#6b7280" }}
          >
            {t("commandPalette.noMatch")}
          </Command.Empty>

          {/* 命令模式 */}
          {mode === "command" && (
            <>
              {/* Workspace */}
              <Command.Group heading={<GroupHeading>Workspace</GroupHeading>}>
                <CommandItem
                  icon={<FolderOpen className="w-4 h-4" />}
                  label={t("workspace.open")}
                  shortcut="⇧⌘O"
                  keywords={["open", "workspace", "sgw"]}
                  onSelect={handleOpenWorkspace}
                />
                <CommandItem
                  icon={<Plus className="w-4 h-4" />}
                  label={t("workspace.new") + "..."}
                  shortcut="⇧⌘N"
                  keywords={["new", "workspace", "create"]}
                  onSelect={handleNewWorkspace}
                />
                {currentWorkspaceName && (
                  <CommandItem
                    icon={<Layers className="w-4 h-4" />}
                    label={`${t("workspace.current")}: ${currentWorkspaceName}`}
                    keywords={["current", "workspace"]}
                    onSelect={handleClose}
                  />
                )}
                {recentWorkspaces.slice(0, 8).map((ws) => (
                  <CommandItem
                    key={ws.path}
                    icon={<Layers className="w-4 h-4" />}
                    label={`${t("workspace.recent")}: ${ws.name}`}
                    description={ws.path}
                    keywords={["recent", "workspace", ws.name, ws.path]}
                    onSelect={() => handleOpenRecentWorkspace(ws)}
                  />
                ))}
              </Command.Group>

              {/* 项目 */}
              <Command.Group heading={<GroupHeading>{t("project.title")}</GroupHeading>}>
                <CommandItem
                  icon={<Plus className="w-4 h-4" />}
                  label={t("project.addProject")}
                  shortcut="⌘O"
                  onSelect={handleAddProject}
                />
                {projects.map((p) => (
                  <CommandItem
                    key={p.id}
                    icon={<FolderOpen className="w-4 h-4" />}
                    label={t("project.switchTo", { name: p.name })}
                    keywords={["project", "switch", p.path]}
                    onSelect={() => {
                      setActiveProject(p);
                      handleClose();
                    }}
                  />
                ))}
              </Command.Group>

              {/* Agent */}
              <Command.Group heading={<GroupHeading>Agent</GroupHeading>}>
                <CommandItem
                  icon={<Plus className="w-4 h-4" />}
                  label={t("agent.newAgent")}
                  shortcut="⌘N"
                  keywords={["new", "agent", "create"]}
                  onSelect={() => openAgentPicker()}
                />
                <CommandItem
                  icon={<Terminal className="w-4 h-4" />}
                  label={t("agent.newTerminal")}
                  keywords={["terminal", "shell"]}
                  onSelect={() => openAgentPicker("custom")}
                />
                {agents.map((a) => (
                  <CommandItem
                    key={a.id}
                    icon={<Bot className="w-4 h-4" />}
                    label={a.name}
                    keywords={["agent", a.color, a.status]}
                    onSelect={() => focusAgent(a.id)}
                  />
                ))}
              </Command.Group>

              {/* 视图 */}
              <Command.Group heading={<GroupHeading>{t("commandPalette.view")}</GroupHeading>}>
                <CommandItem
                  icon={
                    sidebarOpen ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )
                  }
                  label={sidebarOpen ? t("commandPalette.collapseSidebar") : t("commandPalette.expandSidebar")}
                  shortcut="⌘B"
                  keywords={["sidebar", "toggle"]}
                  onSelect={() => {
                    toggleSidebar();
                    handleClose();
                  }}
                />
                <CommandItem
                  icon={
                    panelIsOpen ? (
                      <PanelRightClose className="w-4 h-4" />
                    ) : (
                      <PanelRightOpen className="w-4 h-4" />
                    )
                  }
                  label={panelIsOpen ? t("commandPalette.closePanel") : t("commandPalette.openPanel")}
                  shortcut="⌘\\"
                  keywords={["panel", "toggle"]}
                  onSelect={() => {
                    togglePanel();
                    handleClose();
                  }}
                />
              </Command.Group>

            </>
          )}

          {/* 文件搜索模式 */}
          {mode === "file" && (
            <Command.Group heading={<GroupHeading>{t("commandPalette.file")}</GroupHeading>}>
              {allFiles.map((file) => (
                <CommandItem
                  key={file.path}
                  icon={<FileIcon name={file.name} isDir={false} size={16} />}
                  label={file.name}
                  description={file.relativePath}
                  keywords={[file.path, file.name]}
                  onSelect={() => {
                    // 文件搜索只扫 activeProject 的文件树，
                    // 所以这里 projectPath 直接取 activeProject.path 是正确的。
                    // 命令面板的选择匹配 VSCode 行为：打开为 preview tab
                    openTab({
                      id: file.path,
                      title: file.name,
                      type: "file",
                      filePath: file.path,
                      projectPath: activeProject?.path,
                      isPreview: true,
                      isDirty: false,
                    });
                    handleClose();
                  }}
                />
              ))}
              {allFiles.length === 0 && (
                <div
                  className="py-4 text-center text-xs"
                  style={{ color: "#6b7280" }}
                >
                  {t("commandPalette.addProjectFirst")}
                </div>
              )}
            </Command.Group>
          )}

          {/* Agent 搜索模式 */}
          {mode === "agent" && (
            <Command.Group heading={<GroupHeading>Agent</GroupHeading>}>
              {agents.map((a) => (
                <CommandItem
                  key={a.id}
                  icon={<Bot className="w-4 h-4" />}
                  label={a.name}
                  description={`${a.status} - ${a.color}`}
                  keywords={[a.color, a.status]}
                  onSelect={() => focusAgent(a.id)}
                />
              ))}
              {agents.length === 0 && (
                <div
                  className="py-4 text-center text-xs"
                  style={{ color: "#6b7280" }}
                >
                  {t("agent.noRunningAgents")}
                </div>
              )}
            </Command.Group>
          )}
        </Command.List>

        {/* 底部提���栏 */}
        <div
          className="flex items-center justify-between px-4 py-2 text-[10px]"
          style={{
            borderTop: "1px solid #2a2d36",
            color: "#6b7280",
          }}
        >
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: "#2a2d36" }}>
                &gt;
              </kbd>{" "}
              {t("commandPalette.command")}
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: "#2a2d36" }}>
                #
              </kbd>{" "}
              {t("commandPalette.file")}
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: "#2a2d36" }}>
                @
              </kbd>{" "}
              Agent
            </span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: "#2a2d36" }}>
              ↑↓
            </kbd>{" "}
            {t("commandPalette.navigate")}
            <kbd className="px-1 py-0.5 rounded ml-1" style={{ backgroundColor: "#2a2d36" }}>
              ↵
            </kbd>{" "}
            {t("commandPalette.select")}
            <kbd className="px-1 py-0.5 rounded ml-1" style={{ backgroundColor: "#2a2d36" }}>
              Esc
            </kbd>{" "}
            {t("common.close")}
          </div>
        </div>
      </Command>
    </div>
  );
}

/** ��组标题 */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] font-medium uppercase tracking-wider px-2 py-1"
      style={{ color: "#6b7280" }}
    >
      {children}
    </span>
  );
}

/**
 * 命令项
 *
 * cmdk 会给当前选中的 item 打上 `data-selected="true"`，我们用 Tailwind 的
 * `data-[selected=true]:` 变体画出高亮 —— 这一块之前被漏了，直接导致方向键
 * "看起来没响应"（其实选中索引一直在动）。
 */
function CommandItem({
  icon,
  label,
  description,
  shortcut,
  keywords,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  shortcut?: string;
  keywords?: string[];
  onSelect: () => void;
}) {
  return (
    <Command.Item
      className="group flex items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer transition-colors text-[#e4e6eb] data-[selected=true]:bg-[#2a2d36] data-[selected=true]:text-white hover:bg-[#242731]"
      keywords={keywords}
      onSelect={onSelect}
      value={label}
    >
      <span className="text-[#8b92a3] group-data-[selected=true]:text-white">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {description && (
        <span
          className="text-[10px] truncate max-w-[200px] text-[#6b7280] group-data-[selected=true]:text-[#b8bcc4]"
        >
          {description}
        </span>
      )}
      {shortcut && (
        <kbd
          className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2d36] text-[#8b92a3] group-data-[selected=true]:bg-[#3a3d48] group-data-[selected=true]:text-[#e4e6eb]"
        >
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}

/** 文件树扁平化 */
interface FlatFile {
  name: string;
  path: string;
  relativePath: string;
}

function flattenFileTree(
  nodes: import("@/types/project").FileNode[],
  prefix: string = ""
): FlatFile[] {
  const result: FlatFile[] = [];
  for (const node of nodes) {
    const relativePath = prefix ? `${prefix}/${node.name}` : node.name;
    if (!node.isDir) {
      result.push({
        name: node.name,
        path: node.path,
        relativePath,
      });
    }
    if (node.children) {
      result.push(...flattenFileTree(node.children, relativePath));
    }
  }
  return result;
}
