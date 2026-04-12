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
import type { FileNode } from "@/types/project";
import { FileIcon } from "@/utils/fileIcon";
import { AGENT_COLOR_HEX } from "@/constants/agentColors";
import { useShallow } from "zustand/react/shallow";

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

  // 过滤始终隐藏的条目（.git, .DS_Store）
  const filteredTree = filterHidden(fileTree);

  const actualHeight = treeHeight || filteredTree.length * ROW_HEIGHT;

  return (
    <div className="filetree-container">
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
            diffByPath={diffByPath}
            statusByPath={statusByPath}
          />
        )}
      </Tree>
    </div>
  );
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

/** 从后端加载文件树 */
async function loadFileTree(projectId: string, projectPath: string) {
  const store = useProjectStore.getState();
  store.setLoading(true);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const entries = await invoke<DirEntry[]>("list_dir", {
      path: projectPath,
    });
    const fileNodes = dirEntriesToFileNodes(entries, projectPath);
    store.setProjectFileTree(projectId, fileNodes);
  } catch (err) {
    console.warn("Failed to load file tree, using mock data:", err);
    store.setProjectFileTree(projectId, getMockFileTree());
  } finally {
    store.setLoading(false);
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
 * - Agent hover: 背景渐变 + 颜色竖条 + 文件名加粗
 */
function FileTreeNode({
  node,
  style,
  ignoredPaths,
  projectPath,
  diffByPath,
  statusByPath,
}: NodeRendererProps<FileNode> & {
  ignoredPaths: Set<string>;
  projectPath: string;
  diffByPath: Record<string, { additions: number; deletions: number }>;
  statusByPath: Record<string, string>;
}) {
  const data = node.data;
  const openTab = usePanelStore((s) => s.openTab);
  const activeTabId = usePanelStore((s) => s.activeTabId);

  // 关键性能优化：把 writingFiles / hoveredAgentId / agentFileMap 三个独立
  // selector 合并为一个 useShallow，派生出本节点真正关心的 3 个布尔值。
  // 这样只有当**本节点的**写入 / 高亮 / dim 状态发生变化时才会 re-render，
  // 而不是任意其他节点状态变化都连带整个树 re-render。
  const { isWriting, isHighlightedByAgent, isDimmed } = useProjectStore(
    useShallow((s) => {
      const writing = s.writingFiles.has(data.path);
      const hoveredId = s.hoveredAgentId;
      const isHL =
        hoveredId !== null && (s.agentFileMap[hoveredId]?.includes(data.path) ?? false);
      const dimmed = hoveredId !== null && !isHL;
      return {
        isWriting: writing,
        isHighlightedByAgent: isHL,
        isDimmed: dimmed,
      };
    }),
  );

  // 检查是否在 gitignore 中（用相对路径匹配）
  const relativePath = data.path.startsWith(projectPath)
    ? data.path.slice(projectPath.length).replace(/^\//, "")
    : data.name;
  const isGitIgnored = checkIgnored(relativePath, ignoredPaths);

  // 从本项目的 git 状态派生 diff / status — 不再依赖全局 fileDiffStats
  const localDiffStat = diffByPath[data.path];
  const localStatus = statusByPath[data.path];
  const effectiveGitStatus = data.gitStatus || localStatus;

  /* ====== Hover 关联高亮颜色 ====== */
  const highlightColor = isHighlightedByAgent
    ? AGENT_COLOR_HEX[data.agentColor ?? "blue"] ?? "#4a9eff"
    : undefined;

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
    if (node.isInternal) {
      node.toggle();
    } else {
      openFileTab(true);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (node.isInternal) return;
    // 阻止单击事件的默认效果重复触发；双击打开为固定 tab
    e.stopPropagation();
    openFileTab(false);
  };

  const diffStat = data.diffStat || localDiffStat;
  const isDeleted = effectiveGitStatus === "deleted";
  const isAdded = effectiveGitStatus === "added";
  const isUntracked = effectiveGitStatus === "untracked";

  /* 计算行内边距 — 基础 30px（项目名 14px + 一级缩进 16px）+ react-arborist 的深度缩进 */
  const basePaddingLeft = ((style.paddingLeft as number) || 0) + 30;

  return (
    <div
      style={{
        ...style,
        /* 覆盖 react-arborist 的 paddingLeft，加上基础 14px */
        paddingLeft: basePaddingLeft,
        paddingRight: 14,
        paddingTop: 2,
        paddingBottom: 2,
        /* 过渡动画 */
        transition: "opacity 300ms ease, background 300ms ease",
        opacity: isDimmed ? 0.35 : 1,
        /* 背景 — agent hover 优先，active-in-panel 次之 */
        background: isHighlightedByAgent
          ? `linear-gradient(90deg, ${highlightColor}18 0%, transparent 100%)`
          : isActiveInPanel
            ? "rgba(74, 158, 255, 0.08)"
            : "transparent",
        position: "relative",
      }}
      className="flex items-center cursor-pointer hover:bg-white/[0.04]"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* 左侧 2px 颜色竖条 */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{
          width: isHighlightedByAgent || isActiveInPanel ? 2 : 0,
          backgroundColor: isHighlightedByAgent
            ? (highlightColor ?? "transparent")
            : isActiveInPanel
              ? "#4a9eff"
              : "transparent",
          boxShadow: isHighlightedByAgent ? `0 0 6px ${highlightColor}60` : "none",
          transition: "width 300ms ease, box-shadow 300ms ease",
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

        {/* 文件名 — 13px, agent hover 白色600 / active-in-panel 白色500 */}
        <span
          className="truncate"
          style={{
            fontSize: 13,
            color: isHighlightedByAgent || isActiveInPanel
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
            fontWeight: isHighlightedByAgent ? 600 : isActiveInPanel ? 500 : 400,
            transition: "color 300ms ease, font-weight 300ms ease",
          }}
        >
          {data.name}
        </span>

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
              boxShadow: isHighlightedByAgent
                ? `0 0 6px ${AGENT_COLOR_HEX[data.agentColor]}80`
                : "none",
              transition: "box-shadow 300ms ease",
            }}
          />
        )}
      </div>
    </div>
  );
}

/** 开发用 mock 文件树数据 */
function getMockFileTree(): FileNode[] {
  return [
    {
      id: "src",
      name: "src",
      path: "/mock/src",
      isDir: true,
      children: [
        {
          id: "src/main.tsx",
          name: "main.tsx",
          path: "/mock/src/main.tsx",
          isDir: false,
          gitStatus: "unchanged",
        },
        {
          id: "src/App.tsx",
          name: "App.tsx",
          path: "/mock/src/App.tsx",
          isDir: false,
          gitStatus: "modified",
          diffStat: { additions: 12, deletions: 3 },
        },
        {
          id: "src/components",
          name: "components",
          path: "/mock/src/components",
          isDir: true,
          children: [
            {
              id: "src/components/Sidebar.tsx",
              name: "Sidebar.tsx",
              path: "/mock/src/components/Sidebar.tsx",
              isDir: false,
              gitStatus: "modified",
              agentColor: "blue",
              diffStat: { additions: 45, deletions: 8 },
            },
            {
              id: "src/components/Canvas.tsx",
              name: "Canvas.tsx",
              path: "/mock/src/components/Canvas.tsx",
              isDir: false,
              gitStatus: "unchanged",
            },
          ],
        },
        {
          id: "src/utils.ts",
          name: "utils.ts",
          path: "/mock/src/utils.ts",
          isDir: false,
          gitStatus: "added",
          agentColor: "green",
          diffStat: { additions: 28, deletions: 0 },
        },
        {
          id: "src/old-file.ts",
          name: "old-file.ts",
          path: "/mock/src/old-file.ts",
          isDir: false,
          gitStatus: "deleted",
          diffStat: { additions: 0, deletions: 15 },
        },
        {
          id: "src/temp.ts",
          name: "temp.ts",
          path: "/mock/src/temp.ts",
          isDir: false,
          gitStatus: "untracked",
        },
      ],
    },
    {
      id: "package.json",
      name: "package.json",
      path: "/mock/package.json",
      isDir: false,
      gitStatus: "modified",
      diffStat: { additions: 3, deletions: 1 },
    },
    {
      id: "tsconfig.json",
      name: "tsconfig.json",
      path: "/mock/tsconfig.json",
      isDir: false,
      gitStatus: "unchanged",
    },
    {
      id: "README.md",
      name: "README.md",
      path: "/mock/README.md",
      isDir: false,
      gitStatus: "unchanged",
    },
  ];
}
