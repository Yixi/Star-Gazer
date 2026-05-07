/**
 * 文件树组件 - 使用 react-arborist 渲染虚拟化文件树
 * 深度融合 Git 状态和 Agent 颜色标记
 *
 * 功能：
 * - 基于 list_directory 后端命令获取文件列表
 * - 支持展开/折叠文件夹
 * - 隐藏 .git, node_modules, .DS_Store 等
 * - 每级缩进 16px
 * - Git 状态展示（+X -Y）
 * - Agent 颜色标记
 * - 实时写入指示（脉动蓝点）
 * - Hover 关联高亮
 */
import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { Tree, NodeRendererProps } from "react-arborist";
import { useProjectStore } from "@/stores/projectStore";
import { usePanelStore } from "@/stores/panelStore";
import { useFileTreeUIStore } from "@/stores/fileTreeUIStore";
import { useFileTreeActions, type FileTreeActions } from "@/hooks/useFileTreeActions";
import { useFileTreeShortcuts } from "@/hooks/useFileTreeShortcuts";
import type { FileNode } from "@/types/project";
import { FileIcon } from "@/utils/fileIcon";
import { AGENT_COLOR_HEX } from "@/constants/agentColors";
import { FileTreeInlineInput } from "./FileTreeInlineInput";
import { FileTreeContextMenu } from "./FileTreeContextMenu";
import { FileTreeDeleteDialog } from "./FileTreeDeleteDialog";

/** 占位节点的 id 前缀 — 用于在 fileTree 数据中临时插入 inline create 行 */
const PLACEHOLDER_ID = "__creating__";

/** 始终隐藏的条目（git 内部目录和 macOS 系统文件） */
const ALWAYS_HIDDEN = new Set([".git", ".DS_Store"]);

import type { Project } from "@/types/project";

/** 稳定的空数组引用，避免 Zustand selector 返回新引用导致无限循环 */
const EMPTY_TREE: FileNode[] = [];

interface FileTreeProps {
  project: Project;
}

const ROW_HEIGHT = 22;

export function FileTree({ project }: FileTreeProps) {
  const fileTree = useProjectStore((s) => s.projectFileTrees[project.id] ?? EMPTY_TREE);
  const isLoading = useProjectStore((s) => s.isLoading);
  /**
   * 订阅该项目自己的 git 状态 — 关键：不能用全局 fileDiffStats
   * （那个在多项目切换时会被 active project 覆盖导致非 active 项目的 FileTree
   * 完全丢失 +X -Y 徽章）
   */
  const projectGitStatus = useProjectStore((s) => s.gitStatusByProject[project.id]);
  /** 当前激活的 tab — 用于自动展开并高亮对应文件 */
  const activeTabId = usePanelStore((s) => s.activeTabId);

  /**
   * 从 projectGitStatus 派生 "绝对路径 → diff 统计 / 状态" 的两个本地 map。
   * 这样 FileTreeNode 就不依赖全局 fileDiffStats，每个项目都有自己的数据。
   */
  const { diffByPath, statusByPath } = useMemo(() => {
    const diff: Record<string, { additions: number; deletions: number }> = {};
    const status: Record<string, string> = {};
    if (!projectGitStatus) return { diffByPath: diff, statusByPath: status };

    const addEntry = (
      relPath: string,
      additions: number,
      deletions: number,
      statusStr: string,
    ) => {
      const absPath = `${project.path}/${relPath}`;
      if (diff[absPath]) {
        diff[absPath] = {
          additions: diff[absPath].additions + additions,
          deletions: diff[absPath].deletions + deletions,
        };
      } else if (additions > 0 || deletions > 0) {
        diff[absPath] = { additions, deletions };
      }
      // status 优先保留 unstaged（更接近用户正在编辑的状态）
      if (!status[absPath]) status[absPath] = statusStr;
    };

    for (const c of projectGitStatus.unstaged) {
      addEntry(c.path, c.additions, c.deletions, c.status);
    }
    for (const c of projectGitStatus.staged) {
      addEntry(c.path, c.additions, c.deletions, c.status);
    }
    for (const relPath of projectGitStatus.untracked) {
      const absPath = `${project.path}/${relPath}`;
      if (!status[absPath]) status[absPath] = "untracked";
    }
    return { diffByPath: diff, statusByPath: status };
  }, [projectGitStatus, project.path]);
  /** 已加载过子节点的目录 ID 集合，避免重复请求 */
  const loadedDirsRef = useRef<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const treeRef = useRef<any>(null);
  /** 记录上一次 auto-reveal 的 key，防止 fileTree 变化时重复 reveal 打扰用户滚动 */
  const lastRevealedRef = useRef<string | null>(null);
  const [treeHeight, setTreeHeight] = useState(0);
  /** gitignore 忽略的相对路径集合 */
  const [ignoredPaths, setIgnoredPaths] = useState<Set<string>>(new Set());

  /** 从 tree ref 重新计算实际内容高度 */
  const recalcHeight = useCallback(() => {
    requestAnimationFrame(() => {
      const count = treeRef.current?.visibleNodes?.length;
      if (count != null && count > 0) {
        setTreeHeight(count * ROW_HEIGHT);
      }
    });
  }, []);

  // 初始加载文件树
  useEffect(() => {
    loadedDirsRef.current.clear();
    loadFileTree(project.id, project.path);
  }, [project.id, project.path]);

  // 文件树数据变化时：重算高度 + 批量检查 gitignore
  useEffect(() => {
    setTreeHeight(filterHidden(fileTree).length * ROW_HEIGHT);
    recalcHeight();

    // 收集所有文件路径（相对路径），批量查询 gitignore
    const allPaths: string[] = [];
    const collectPaths = (nodes: FileNode[]) => {
      for (const node of nodes) {
        const rel = node.path.startsWith(project.path)
          ? node.path.slice(project.path.length).replace(/^\//, "")
          : node.name;
        if (rel) allPaths.push(rel);
        if (node.children) collectPaths(node.children);
      }
    };
    collectPaths(fileTree);

    if (allPaths.length === 0) return;

    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const ignored = await invoke<string[]>("git_check_ignored", {
          repoPath: project.path,
          paths: allPaths,
        });
        setIgnoredPaths(new Set(ignored));
      } catch {
        // 非 git 仓库或命令不可用时忽略
      }
    })();
  }, [fileTree, project.path, recalcHeight]);

  /**
   * Auto-reveal：当前激活 tab 变化时，自动展开祖先目录并滚动到对应文件
   *
   * - 仅对属于当前项目的文件生效（prefix 匹配 project.path）
   * - 懒加载整条祖先链：逐级 list_dir，确保目标文件在 react-arborist 数据里存在
   * - 加载完成后用 tree API 的 openParents / scrollTo / select 同步视图
   * - lastRevealedRef 防止 fileTree 更新（比如 watcher 刷新）触发重复 reveal
   */
  useEffect(() => {
    if (!activeTabId) return;
    if (!activeTabId.startsWith(project.path)) return;
    const relativePath = activeTabId
      .slice(project.path.length)
      .replace(/^\//, "");
    if (!relativePath) return;

    const revealKey = `${project.id}:${activeTabId}`;
    if (lastRevealedRef.current === revealKey) return;

    let cancelled = false;

    (async () => {
      const ok = await ensureAncestorsLoaded(
        project.id,
        project.path,
        relativePath,
      );
      if (cancelled || !ok) return;

      // 等一帧让 fileTree 的新数据流入 react-arborist
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;

      const tree = treeRef.current;
      if (!tree) return;
      try {
        tree.openParents?.(relativePath);
        tree.scrollTo?.(relativePath, "center");
        tree.select?.(relativePath, { focus: false });
        recalcHeight();
        lastRevealedRef.current = revealKey;
      } catch (err) {
        console.warn("auto-reveal failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTabId, project.id, project.path, fileTree, recalcHeight]);

  /** 展开/折叠回调 — 展开时按需加载子目录内容 */
  const handleToggle = useCallback(
    async (id: string) => {
      // 无论展开还是折叠，都需要在下一帧重算高度
      requestAnimationFrame(() => recalcHeight());

      const node = findNodeById(fileTree, id);
      if (!node || !node.isDir) return;
      // 已加载过子节点 或 已有子节点数据，不需重复加载
      if (loadedDirsRef.current.has(id)) return;
      if (node.children && node.children.length > 0) return;

      loadedDirsRef.current.add(id);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const entries = await invoke<DirEntry[]>("list_dir", {
          path: node.path,
        });
        const childNodes = dirEntriesToFileNodes(entries, project.path);
        useProjectStore.getState().updateNodeChildren(project.id, id, childNodes);
      } catch (err) {
        console.warn("Failed to load children for", node.path, err);
        loadedDirsRef.current.delete(id);
      }
      // 加载完子节点后再次重算
      requestAnimationFrame(() => recalcHeight());
    },
    [project.id, project.path, fileTree, recalcHeight]
  );

  // 过滤始终隐藏的条目（.git, .DS_Store）+ 把 inline create 占位行合并进去
  const editing = useFileTreeUIStore((s) => s.editing);
  const setFocused = useFileTreeUIStore((s) => s.setFocused);
  const cancelEditing = useFileTreeUIStore((s) => s.cancelEditing);

  const filteredTree = useMemo(() => {
    const filtered = filterHidden(fileTree);
    // 仅当 editing 是当前项目的 create 态时才插入占位行
    if (
      editing?.kind === "create-file" || editing?.kind === "create-dir"
    ) {
      if (editing.projectId !== project.id) return filtered;
      return injectCreatePlaceholder(filtered, editing.parentId, editing.kind);
    }
    return filtered;
  }, [fileTree, editing, project.id]);

  // 文件树操作集合（rename / create / delete / copy / cut / paste / reveal / copy path）
  const actions = useFileTreeActions(project);

  // 容器级右键菜单 state（节点和空白处共用，但内容不同）
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: FileNode;
    targetDirPath: string;
    targetDirId: string | "__root__";
  } | null>(null);

  // 删除确认 state
  const [deleteDialog, setDeleteDialog] = useState<FileNode | null>(null);

  // 文件树快捷键（仅 isFocused=true 时生效）
  useFileTreeShortcuts(project, actions, (node) => setDeleteDialog(node));

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-32 text-sm"
        style={{ color: "#6b7280" }}
      >
        加载文件树...
      </div>
    );
  }

  if (fileTree.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-32 text-sm"
        style={{ color: "#6b7280" }}
      >
        空目录
      </div>
    );
  }

  /** 文件树容器的空白处右键 → 项目根上下文菜单（New File / New Folder / Paste / Reveal） */
  const handleContainerContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-filetree-node]")) return;
    e.preventDefault();
    // 用项目自身作为虚拟节点
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node: {
        id: "",
        name: project.name,
        path: project.path,
        isDir: true,
        children: [],
      },
      targetDirPath: project.path,
      targetDirId: "__root__",
    });
  };

  const actualHeight = treeHeight || filteredTree.length * ROW_HEIGHT;

  return (
    <div
      className="filetree-container outline-none"
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // 焦点跑到子元素（input / 菜单）也算保持 focus
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setFocused(false);
      }}
      onContextMenu={handleContainerContextMenu}
      // 容器级 mousedown：点空白也清编辑态（Esc 同效果）
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (
          editing &&
          !target.closest("[data-filetree-node]") &&
          !target.closest("input")
        ) {
          cancelEditing();
        }
      }}
    >
      <Tree<FileNode>
        ref={treeRef}
        data={filteredTree}
        openByDefault={false}
        width="100%"
        height={actualHeight}
        indent={16}
        rowHeight={ROW_HEIGHT}
        overscanCount={8}
        idAccessor="id"
        childrenAccessor="children"
        onToggle={handleToggle}
        disableDrag
        disableDrop
        disableEdit
      >
        {(props) => (
          <FileTreeNode
            {...props}
            ignoredPaths={ignoredPaths}
            projectPath={project.path}
            projectId={project.id}
            diffByPath={diffByPath}
            statusByPath={statusByPath}
            actions={actions}
            onContextMenu={(payload) => setContextMenu(payload)}
          />
        )}
      </Tree>

      {contextMenu && (
        <FileTreeContextMenu
          node={contextMenu.node}
          targetDirPath={contextMenu.targetDirPath}
          targetDirId={contextMenu.targetDirId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          actions={actions}
          onRequestDelete={(n) => setDeleteDialog(n)}
        />
      )}

      {deleteDialog && (
        <FileTreeDeleteDialog
          name={deleteDialog.name}
          isDir={deleteDialog.isDir}
          onCancel={() => setDeleteDialog(null)}
          onConfirm={() => {
            const target = deleteDialog;
            setDeleteDialog(null);
            void actions.trashNode(target);
          }}
        />
      )}
    </div>
  );
}

/**
 * 在 fileTree 数据中插入一个临时占位节点用于 inline create 输入。
 *
 * - parentId === "__root__"：插到顶层数组开头
 * - 其它：递归找到对应目录节点，插到其 children 开头
 *
 * 占位节点的 id 用 PLACEHOLDER_ID，name 为空，渲染时识别为 inline input
 */
function injectCreatePlaceholder(
  tree: FileNode[],
  parentId: string | "__root__",
  kind: "create-file" | "create-dir",
): FileNode[] {
  const placeholder: FileNode = {
    id: PLACEHOLDER_ID,
    name: "",
    path: "",
    isDir: kind === "create-dir",
    children: kind === "create-dir" ? [] : undefined,
  };
  if (parentId === "__root__") {
    return [placeholder, ...tree];
  }
  const inject = (nodes: FileNode[]): FileNode[] =>
    nodes.map((n) => {
      if (n.id === parentId) {
        const children = n.children ?? [];
        return { ...n, children: [placeholder, ...children] };
      }
      if (n.children) {
        return { ...n, children: inject(n.children) };
      }
      return n;
    });
  return inject(tree);
}

/** 在文件树中递归查找指定 ID 的节点 */
function findNodeById(nodes: FileNode[], id: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 递归过滤始终隐藏的条目（.git, .DS_Store） */
function filterHidden(nodes: FileNode[]): FileNode[] {
  return nodes
    .filter((node) => !ALWAYS_HIDDEN.has(node.name))
    .map((node) => {
      if (node.children) {
        return { ...node, children: filterHidden(node.children) };
      }
      return node;
    });
}

/** 后端返回的目录条目类型 */
interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
}

/** 将后端 DirEntry 转换为前端 FileNode（不递归加载子目录，按需展开时加载） */
function dirEntriesToFileNodes(entries: DirEntry[], basePath: string): FileNode[] {
  return entries.map((entry) => {
    const relativePath = entry.path.startsWith(basePath)
      ? entry.path.slice(basePath.length).replace(/^\//, "")
      : entry.name;
    return {
      id: relativePath || entry.name,
      name: entry.name,
      path: entry.path,
      isDir: entry.isDir,
      children: entry.isDir ? [] : undefined,
    };
  });
}

/**
 * 确保目标文件的整条祖先链在 projectStore 的 fileTree 中已展开加载。
 *
 * 按路径段逐级下钻：
 * - 对每一段父目录，检查下一段是否已在 children 里
 * - 如果不在，调用后端 list_dir 并 updateNodeChildren 写回 store
 * - 任一环节找不到或不是目录 → 返回 false（无法 reveal）
 */
async function ensureAncestorsLoaded(
  projectId: string,
  projectPath: string,
  relativePath: string,
): Promise<boolean> {
  const segments = relativePath.split("/");
  if (segments.length <= 1) return true; // 文件在项目根目录，无需展开

  for (let i = 0; i < segments.length - 1; i++) {
    const currentRelPath = segments.slice(0, i + 1).join("/");
    const nextRelPath = segments.slice(0, i + 2).join("/");

    const state = useProjectStore.getState();
    const tree = state.projectFileTrees[projectId] ?? [];
    const node = findNodeById(tree, currentRelPath);
    if (!node || !node.isDir) return false;

    const hasNext = node.children?.some((c) => c.id === nextRelPath);
    if (hasNext) continue;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const entries = await invoke<DirEntry[]>("list_dir", { path: node.path });
      const childNodes = dirEntriesToFileNodes(entries, projectPath);
      state.updateNodeChildren(projectId, node.id, childNodes);
    } catch (err) {
      console.warn("auto-reveal: failed to list_dir", node.path, err);
      return false;
    }
  }
  return true;
}

/** 检查文件路径是否在 gitignore 中（精确匹配 + 祖先目录匹配） */
function checkIgnored(relativePath: string, ignoredPaths: Set<string>): boolean {
  // 精确匹配
  if (ignoredPaths.has(relativePath)) return true;
  // 检查祖先目录是否被忽略（如 node_modules 被忽略，则 node_modules/express 也算忽略）
  const parts = relativePath.split("/");
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? current + "/" + parts[i] : parts[i];
    if (ignoredPaths.has(current)) return true;
  }
  return false;
}

/** 从后端加载文件树
 *
 * 失败时写入空数组 —— 之前是 fallback 到 getMockFileTree()，会让所有 project
 * 都显示同一份假数据（src/package.json/tsconfig.json/README.md），掩盖真正的
 * 错误原因（通常是 fs 沙箱未同步 / canonicalize 失败）。现在改为空 + 一次性
 * 重试：第一次 sync 可能还没到后端，200ms 后再试一次兜底 race。
 */
async function loadFileTree(
  projectId: string,
  projectPath: string,
  attempt = 0,
) {
  const store = useProjectStore.getState();
  if (attempt === 0) store.setLoading(true);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const entries = await invoke<DirEntry[]>("list_dir", {
      path: projectPath,
    });
    const fileNodes = dirEntriesToFileNodes(entries, projectPath);
    store.setProjectFileTree(projectId, fileNodes);
  } catch (err) {
    // 首次失败很可能是沙箱 sync 还没落地，退回 200ms 后再试一次
    if (attempt === 0) {
      setTimeout(() => {
        void loadFileTree(projectId, projectPath, 1);
      }, 200);
      return;
    }
    console.warn(
      `Failed to load file tree for ${projectPath}:`,
      err,
    );
    store.setProjectFileTree(projectId, []);
  } finally {
    if (attempt === 0) store.setLoading(false);
  }
}

/**
 * 单个文件树节点 — 像素级匹配设计稿
 *
 * 设计稿规格（来自 Mockup CSS）：
 * - .tree-node (文件夹): padding 4px 14px 4px {depth*16+14}px, gap 6px, 13px
 * - .file (文件): padding 5px 14px 5px {depth*16+14}px, gap 6px, 13px
 * - Caret: ▼/▶ 文字, 9px, #6b7280, 10px 宽
 * - 图标: 📂/📁/📄 emoji, 11px
 * - active-in-panel: 蓝色左边条 + 淡蓝背景
 */
function FileTreeNode({
  node,
  style,
  ignoredPaths,
  projectPath,
  projectId,
  diffByPath,
  statusByPath,
  actions,
  onContextMenu,
}: NodeRendererProps<FileNode> & {
  ignoredPaths: Set<string>;
  projectPath: string;
  projectId: string;
  diffByPath: Record<string, { additions: number; deletions: number }>;
  statusByPath: Record<string, string>;
  actions: FileTreeActions;
  onContextMenu: (payload: {
    x: number;
    y: number;
    node: FileNode;
    targetDirPath: string;
    targetDirId: string | "__root__";
  }) => void;
}) {
  const data = node.data;
  const openTab = usePanelStore((s) => s.openTab);
  const activeTabId = usePanelStore((s) => s.activeTabId);
  // writingFiles 是 Set 引用，set 自身变化才触发 re-render；has() O(1)
  const isWriting = useProjectStore((s) => s.writingFiles.has(data.path));
  const editing = useFileTreeUIStore((s) => s.editing);
  const clipboard = useFileTreeUIStore((s) => s.clipboard);
  const setSelected = useFileTreeUIStore((s) => s.setSelected);

  // 占位节点：单独渲染 inline create input 行
  const isPlaceholder = data.id === PLACEHOLDER_ID;

  // 当前节点是否处于 rename 编辑态
  const isRenaming =
    editing?.kind === "rename" &&
    editing.projectId === projectId &&
    editing.nodeId === data.id;

  // 是否处于 cut 状态（视觉半透明）
  const isCut =
    clipboard?.mode === "cut" &&
    clipboard.projectId === projectId &&
    clipboard.paths.includes(data.path);

  // 检查是否在 gitignore 中（用相对路径匹配）
  const relativePath = data.path.startsWith(projectPath)
    ? data.path.slice(projectPath.length).replace(/^\//, "")
    : data.name;
  const isGitIgnored = checkIgnored(relativePath, ignoredPaths);

  // 从本项目的 git 状态派生 diff / status — 不再依赖全局 fileDiffStats
  const localDiffStat = diffByPath[data.path];
  const localStatus = statusByPath[data.path];
  const effectiveGitStatus = data.gitStatus || localStatus;

  /* ====== Active-in-panel ====== */
  const isActiveInPanel = !data.isDir && activeTabId === data.path;

  /** 打开文件为 tab — preview=true 时是"临时 tab"（VSCode 风格） */
  const openFileTab = (preview: boolean) => {
    const hasChanges =
      effectiveGitStatus && effectiveGitStatus !== "unchanged" && effectiveGitStatus !== "ignored";
    const ext = data.name.split(".").pop()?.toLowerCase();
    const isPreviewable =
      ext === "md" ||
      ext === "mdx" ||
      ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(ext ?? "");
    openTab({
      id: data.path,
      title: data.name,
      type: isPreviewable ? "markdown" : hasChanges ? "diff" : "file",
      filePath: data.path,
      projectPath,
      isPreview: preview,
      isDirty: false,
    });
    usePanelStore.getState().openPanel();
  };

  const handleClick = () => {
    // 占位行 / 重命名中的节点不响应点击
    if (isPlaceholder || isRenaming) return;
    setSelected({ projectId, nodeId: data.id });
    if (node.isInternal) {
      node.toggle();
    } else {
      openFileTab(true);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isPlaceholder || isRenaming) return;
    if (node.isInternal) return;
    // 阻止单击事件的默认效果重复触发；双击打开为固定 tab
    e.stopPropagation();
    openFileTab(false);
  };

  /** 节点右键菜单 — 文件以"父目录"为操作目标，目录以"自身"为目标 */
  const handleContextMenu = (e: React.MouseEvent) => {
    if (isPlaceholder || isRenaming) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected({ projectId, nodeId: data.id });

    // 计算 target dir
    let targetDirPath: string;
    let targetDirId: string | "__root__";
    if (data.isDir) {
      targetDirPath = data.path;
      targetDirId = data.id;
    } else {
      // 父目录：用文件路径推父目录的绝对路径 + 相对 id
      const lastSlash = data.path.lastIndexOf("/");
      targetDirPath =
        lastSlash > 0 ? data.path.slice(0, lastSlash) : projectPath;
      // 父目录的 id：相对路径去掉最后一段；如果文件在根，targetDirId 用 "__root__"
      const lastSlashId = data.id.lastIndexOf("/");
      targetDirId = lastSlashId > 0 ? data.id.slice(0, lastSlashId) : "__root__";
    }

    onContextMenu({
      x: e.clientX,
      y: e.clientY,
      node: data,
      targetDirPath,
      targetDirId,
    });
  };

  // 占位节点：渲染 inline create 输入行
  if (isPlaceholder && (editing?.kind === "create-file" || editing?.kind === "create-dir")) {
    const placeholderEditing = editing;
    return (
      <div
        data-filetree-node
        style={{
          ...style,
          paddingLeft: ((style.paddingLeft as number) || 0) + 30,
          paddingRight: 14,
          paddingTop: 2,
          paddingBottom: 2,
        }}
        className="flex items-center"
      >
        <div className="flex items-center flex-1 min-w-0" style={{ gap: 6 }}>
          <span
            className="flex-shrink-0"
            style={{ width: 10 }}
          />
          <span
            className="flex-shrink-0 inline-flex items-center justify-center"
            style={{ width: 14, height: 14 }}
          >
            <FileIcon
              name="placeholder"
              isDir={placeholderEditing.kind === "create-dir"}
              isOpen={false}
              size={14}
            />
          </span>
          <FileTreeInlineInput
            initialValue=""
            onSubmit={(name) => {
              void actions.commitCreate(
                placeholderEditing.parentPath,
                placeholderEditing.kind,
                name,
              );
            }}
            onCancel={() => useFileTreeUIStore.getState().cancelEditing()}
            blurBehavior="cancel"
          />
        </div>
      </div>
    );
  }

  const diffStat = data.diffStat || localDiffStat;
  const isDeleted = effectiveGitStatus === "deleted";
  const isAdded = effectiveGitStatus === "added";
  const isUntracked = effectiveGitStatus === "untracked";

  /* 计算行内边距 — 基础 30px（项目名 14px + 一级缩进 16px）+ react-arborist 的深度缩进 */
  const basePaddingLeft = ((style.paddingLeft as number) || 0) + 30;

  return (
    <div
      data-filetree-node
      style={{
        ...style,
        /* 覆盖 react-arborist 的 paddingLeft，加上基础 14px */
        paddingLeft: basePaddingLeft,
        paddingRight: 14,
        paddingTop: 2,
        paddingBottom: 2,
        transition: "background 300ms ease, opacity 200ms ease",
        background: isActiveInPanel ? "rgba(74, 158, 255, 0.08)" : "transparent",
        opacity: isCut ? 0.5 : 1,
        position: "relative",
      }}
      className="flex items-center cursor-pointer hover:bg-white/[0.04]"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {/* 左侧 2px 颜色竖条（仅 active-in-panel） */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{
          width: isActiveInPanel ? 2 : 0,
          backgroundColor: isActiveInPanel ? "#4a9eff" : "transparent",
          transition: "width 300ms ease",
        }}
      />

      {/* 内容行 — gap 6px 匹配设计稿 */}
      <div className="flex items-center flex-1 min-w-0" style={{ gap: 6 }}>
        {/* Caret — ▼/▶ 文字，9px，10px 宽 */}
        {node.isInternal ? (
          <span
            className="flex-shrink-0 text-center leading-none select-none"
            style={{ color: "#6b7280", fontSize: 9, width: 10 }}
          >
            {node.isOpen ? "▼" : "▶"}
          </span>
        ) : (
          <span className="flex-shrink-0" style={{ width: 10 }} />
        )}

        {/* 图标 — vscode-icons 彩色 SVG，14px */}
        <span
          className="flex-shrink-0 inline-flex items-center justify-center"
          style={{ width: 14, height: 14 }}
        >
          <FileIcon
            name={data.name}
            isDir={!!node.isInternal}
            isOpen={node.isOpen}
            size={14}
          />
        </span>

        {/* 文件名 — 13px, active-in-panel 白色500；rename 中替换为 inline input */}
        {isRenaming ? (
          <FileTreeInlineInput
            initialValue={data.name}
            isFile={!data.isDir}
            onSubmit={(name) => {
              void actions.commitRename(data, name);
            }}
            onCancel={() => useFileTreeUIStore.getState().cancelEditing()}
            blurBehavior="commit"
          />
        ) : (
          <span
            className="truncate"
            style={{
              fontSize: 13,
              color: isActiveInPanel
                ? "#ffffff"
                : isGitIgnored
                  ? "#4a5263"
                  : isDeleted
                    ? "#ef4444"
                    : isAdded
                      ? "#22c55e"
                      : "#b8bcc4",
              fontStyle: isUntracked ? "italic" : "normal",
              textDecoration: isDeleted ? "line-through" : "none",
              fontWeight: isActiveInPanel ? 500 : 400,
              transition: "color 300ms ease, font-weight 300ms ease",
            }}
          >
            {data.name}
          </span>
        )}

        {/* 实时写入脉动蓝点 */}
        {isWriting && (
          <span className="flex-shrink-0">
            <span className="writing-pulse" />
          </span>
        )}

        {/* Git diff 统计 — 右对齐, 10px, SF Mono */}
        {diffStat && !node.isInternal && (
          <span
            className="ml-auto flex items-center flex-shrink-0 tabular-nums"
            style={{ gap: 4, fontSize: 10, fontFamily: "'SF Mono', Menlo, monospace" }}
          >
            {diffStat.additions > 0 && (
              <span style={{ color: "#22c55e" }}>+{diffStat.additions}</span>
            )}
            {diffStat.deletions > 0 && (
              <span style={{ color: "#ef4444" }}>-{diffStat.deletions}</span>
            )}
          </span>
        )}

        {/* Agent 颜色标记圆点 */}
        {data.agentColor && !isWriting && !diffStat && (
          <span
            className="w-2 h-2 rounded-full ml-auto flex-shrink-0"
            style={{
              backgroundColor: AGENT_COLOR_HEX[data.agentColor] ?? "#4a9eff",
            }}
          />
        )}
      </div>
    </div>
  );
}

