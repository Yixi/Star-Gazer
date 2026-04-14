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
} from "lucide-react";
import { FileIcon } from "@/utils/fileIcon";
import { useProjectStore } from "@/stores/projectStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { usePanelStore } from "@/stores/panelStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { FileNode } from "@/types/project";

/** 稳定空数组，避免 Zustand selector 无限循环 */
const EMPTY_FILE_TREE: FileNode[] = [];

type PaletteMode = "command" | "file" | "agent";

export function CommandPalette() {
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
      if (e.key === "o" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleAddProject();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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

  // 添加项目 - 持久化到后端
  const handleAddProject = useCallback(async () => {
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择项目文件夹",
      });
      if (selected && typeof selected === "string") {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const project = await invoke<{
            id: string;
            name: string;
            path: string;
            lastOpened: number;
          }>("add_project", { path: selected });
          addProject(project);
          setActiveProject(project);
        } catch (backendErr) {
          console.warn("Backend add_project failed, creating locally:", backendErr);
          const name = selected.split("/").pop() || selected;
          const project = {
            id: `project-${Date.now()}`,
            name,
            path: selected,
            lastOpened: Date.now(),
          };
          addProject(project);
          setActiveProject(project);
        }
      }
    } catch (err) {
      console.warn("Tauri dialog not available:", err);
    }
    handleClose();
  }, [addProject, setActiveProject, handleClose]);

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
            {mode === "command" ? "命令" : mode === "file" ? "文件" : "Agent"}
          </span>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: "#6b7280" }} />
          <Command.Input
            ref={inputRef}
            autoFocus
            className="flex-1 h-11 bg-transparent text-sm outline-none"
            style={{ color: "#e4e6eb" }}
            placeholder={
              mode === "command"
                ? "输入命令..."
                : mode === "file"
                  ? "搜索文件名..."
                  : "搜索 Agent..."
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
            没有找到匹配结果
          </Command.Empty>

          {/* 命令模式 */}
          {mode === "command" && (
            <>
              {/* 项目 */}
              <Command.Group heading={<GroupHeading>项目</GroupHeading>}>
                <CommandItem
                  icon={<Plus className="w-4 h-4" />}
                  label="添加项目"
                  shortcut="⌘O"
                  onSelect={handleAddProject}
                />
                {projects.map((p) => (
                  <CommandItem
                    key={p.id}
                    icon={<FolderOpen className="w-4 h-4" />}
                    label={`切换到 ${p.name}`}
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
                  label="新建 Agent"
                  shortcut="⌘N"
                  keywords={["new", "agent", "create"]}
                  onSelect={() => openAgentPicker()}
                />
                <CommandItem
                  icon={<Terminal className="w-4 h-4" />}
                  label="新建终端"
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
              <Command.Group heading={<GroupHeading>视图</GroupHeading>}>
                <CommandItem
                  icon={
                    sidebarOpen ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )
                  }
                  label={sidebarOpen ? "折叠侧边栏" : "展开侧边栏"}
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
                  label={panelIsOpen ? "关闭面板" : "打开面板"}
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
            <Command.Group heading={<GroupHeading>文件</GroupHeading>}>
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
                  请先添加项目
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
                  没有运行中的 Agent
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
              命令
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded" style={{ backgroundColor: "#2a2d36" }}>
                #
              </kbd>{" "}
              文件
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
            导航
            <kbd className="px-1 py-0.5 rounded ml-1" style={{ backgroundColor: "#2a2d36" }}>
              ↵
            </kbd>{" "}
            选择
            <kbd className="px-1 py-0.5 rounded ml-1" style={{ backgroundColor: "#2a2d36" }}>
              Esc
            </kbd>{" "}
            关闭
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
