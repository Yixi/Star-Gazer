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
import { useEffect, useRef, useCallback, useState } from "react";
import { Tree, NodeRendererProps } from "react-arborist";
import { useProjectStore } from "@/stores/projectStore";
import { usePanelStore } from "@/stores/panelStore";
import type { FileNode } from "@/types/project";

/** 需要隐藏的目录/文件名 */
const HIDDEN_ENTRIES = new Set([
  ".git",
  "node_modules",
  ".DS_Store",
  ".next",
  ".nuxt",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "target",
  ".idea",
  ".vscode",
  "dist",
  "build",
  ".turbo",
]);

import type { Project } from "@/types/project";

/** 稳定的空数组引用，避免 Zustand selector 返回新引用导致无限循环 */
const EMPTY_TREE: FileNode[] = [];

interface FileTreeProps {
  project: Project;
}

const ROW_HEIGHT = 28;

export function FileTree({ project }: FileTreeProps) {
  const fileTree = useProjectStore((s) => s.projectFileTrees[project.id] ?? EMPTY_TREE);
  const isLoading = useProjectStore((s) => s.isLoading);
  /** 已加载过子节点的目录 ID 集合，避免重复请求 */
  const loadedDirsRef = useRef<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const treeRef = useRef<any>(null);
  const [treeHeight, setTreeHeight] = useState(0);

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

  // 文件树数据变化时重算高度
  useEffect(() => {
    setTreeHeight(filterHiddenEntries(fileTree).length * ROW_HEIGHT);
    recalcHeight();
  }, [fileTree, recalcHeight]);

  /** 展开/折叠回调 — 展开时按需加载子目录内容 */
  const handleToggle = useCallback(
    async (id: string) => {
      const node = findNodeById(fileTree, id);
      if (!node || !node.isDir) return;
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
      // 展开/折叠后重算高度
      recalcHeight();
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

  // 过滤隐藏文件
  const filteredTree = filterHiddenEntries(fileTree);

  const actualHeight = treeHeight || filteredTree.length * ROW_HEIGHT;

  return (
    <div>
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
        {FileTreeNode}
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

/** 递归过滤隐藏条目 */
function filterHiddenEntries(nodes: FileNode[]): FileNode[] {
  return nodes
    .filter((node) => !HIDDEN_ENTRIES.has(node.name))
    .map((node) => {
      if (node.children) {
        return { ...node, children: filterHiddenEntries(node.children) };
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

/** Agent 颜色到 HEX 值映射（用于精确的高亮颜色） */
const AGENT_COLOR_HEX: Record<string, string> = {
  blue: "#4a9eff",
  orange: "#ff8c42",
  purple: "#a78bfa",
  green: "#22c55e",
  pink: "#ec4899",
  yellow: "#eab308",
  cyan: "#06b6d4",
  red: "#ef4444",
};

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
function FileTreeNode({ node, style }: NodeRendererProps<FileNode>) {
  const data = node.data;
  const openTab = usePanelStore((s) => s.openTab);
  const activeTabId = usePanelStore((s) => s.activeTabId);
  const writingFiles = useProjectStore((s) => s.writingFiles);
  const hoveredAgentId = useProjectStore((s) => s.hoveredAgentId);
  const agentFileMap = useProjectStore((s) => s.agentFileMap);
  const fileDiffStats = useProjectStore((s) => s.fileDiffStats);

  const isWriting = writingFiles.has(data.path);

  // 从 fileDiffStats 推导 gitStatus（如果文件有 diff 则认为是 modified）
  const hasRealDiff = !!fileDiffStats[data.path];
  const effectiveGitStatus = data.gitStatus || (hasRealDiff ? "modified" : undefined);

  /* ====== Hover 关联高亮 ====== */
  const isHighlightedByAgent =
    hoveredAgentId !== null && agentFileMap[hoveredAgentId]?.includes(data.path);
  const isDimmed = hoveredAgentId !== null && !isHighlightedByAgent;
  const highlightColor = isHighlightedByAgent
    ? AGENT_COLOR_HEX[data.agentColor ?? "blue"] ?? "#4a9eff"
    : undefined;

  /* ====== Active-in-panel ====== */
  const isActiveInPanel = !data.isDir && activeTabId === data.path;

  const handleClick = () => {
    if (node.isInternal) {
      node.toggle();
    } else {
      const hasChanges =
        effectiveGitStatus && effectiveGitStatus !== "unchanged" && effectiveGitStatus !== "ignored";
      openTab({
        id: data.path,
        title: data.name,
        type: hasChanges ? "diff" : "file",
        filePath: data.path,
        isDirty: false,
      });
      usePanelStore.getState().openPanel();
    }
  };

  const diffStat = data.diffStat || fileDiffStats[data.path];
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
        paddingTop: node.isInternal ? 4 : 5,
        paddingBottom: node.isInternal ? 4 : 5,
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

        {/* 图标 — 设计稿使用 emoji 风格，11px */}
        <span className="flex-shrink-0 select-none" style={{ fontSize: 11, lineHeight: 1 }}>
          {node.isInternal
            ? (node.isOpen ? "📂" : "📁")
            : "📄"}
        </span>

        {/* 文件名 — 13px, agent hover 白色600 / active-in-panel 白色500 */}
        <span
          className="truncate"
          style={{
            fontSize: 13,
            color: isHighlightedByAgent || isActiveInPanel
              ? "#ffffff"
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
