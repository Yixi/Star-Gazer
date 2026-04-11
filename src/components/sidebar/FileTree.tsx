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
import { useEffect, useRef } from "react";
import { Tree, NodeRendererProps } from "react-arborist";
import {
  ChevronRight,
  File,
  FolderOpen,
  Folder,
  CircleHelp,
  AlertCircle,
} from "lucide-react";
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

export function FileTree() {
  const { fileTree, isLoading, activeProject } = useProjectStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // 初始加载文件树
  useEffect(() => {
    if (!activeProject) return;
    loadFileTree(activeProject.path);
  }, [activeProject?.path]);

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

  return (
    <div ref={containerRef} className="h-full overflow-hidden">
      <Tree<FileNode>
        data={filteredTree}
        openByDefault={false}
        width="100%"
        height={containerRef.current?.clientHeight ?? 600}
        indent={16}
        rowHeight={26}
        overscanCount={8}
        idAccessor="id"
        childrenAccessor="children"
        disableDrag
        disableDrop
        disableEdit
      >
        {FileTreeNode}
      </Tree>
    </div>
  );
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
async function loadFileTree(projectPath: string) {
  const store = useProjectStore.getState();
  store.setLoading(true);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const entries = await invoke<DirEntry[]>("list_dir", {
      path: projectPath,
    });
    const fileNodes = dirEntriesToFileNodes(entries, projectPath);
    store.setFileTree(fileNodes);
  } catch (err) {
    console.warn("Failed to load file tree, using mock data:", err);
    // 开发时使用 mock 数据
    store.setFileTree(getMockFileTree());
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
 * 单个文件树节点 — Hover 关联高亮（核心差异化交互）
 *
 * 当 Agent 卡片被悬停时：
 * - 被该 Agent 修改的文件：背景渐变 + 左侧 2px 颜色竖条 + 文件名白色加粗
 * - 其他所有文件：变暗到 35% 透明度
 * - 所有过渡使用 300ms ease-in-out 平滑恢复
 */
function FileTreeNode({ node, style }: NodeRendererProps<FileNode>) {
  const data = node.data;
  const openTab = usePanelStore((s) => s.openTab);
  const writingFiles = useProjectStore((s) => s.writingFiles);
  const hoveredAgentId = useProjectStore((s) => s.hoveredAgentId);
  const agentFileMap = useProjectStore((s) => s.agentFileMap);
  const fileDiffStats = useProjectStore((s) => s.fileDiffStats);

  const isWriting = writingFiles.has(data.path);

  /* ====== Hover 关联高亮核心逻辑 ====== */
  const isHighlightedByAgent =
    hoveredAgentId !== null && agentFileMap[hoveredAgentId]?.includes(data.path);
  /* 有 Agent 被悬停但当前文件不属于该 Agent → 变暗 */
  const isDimmed = hoveredAgentId !== null && !isHighlightedByAgent;

  /* 获取高亮 Agent 的实际颜色（从文件的 agentColor 派生） */
  const highlightColor = isHighlightedByAgent
    ? AGENT_COLOR_HEX[data.agentColor ?? "blue"] ?? "#4a9eff"
    : undefined;

  const handleClick = () => {
    if (node.isInternal) {
      node.toggle();
    } else {
      const hasChanges =
        data.gitStatus && data.gitStatus !== "unchanged" && data.gitStatus !== "ignored";
      openTab({
        id: data.path,
        title: data.name,
        type: hasChanges ? "diff" : "file",
        filePath: data.path,
        isDirty: false,
      });
    }
  };

  const diffStat = data.diffStat || fileDiffStats[data.path];

  const isUntracked = data.gitStatus === "untracked";
  const isDeleted = data.gitStatus === "deleted";
  const isAdded = data.gitStatus === "added";
  const isConflicted = data.gitStatus === "conflicted";

  return (
    <div
      style={{
        ...style,
        /* 300ms 平滑过渡 — opacity、background */
        transition: "opacity 300ms ease, background 300ms ease",
        /* 变暗效果 — 35% 透明度 */
        opacity: isDimmed ? 0.35 : 1,
        /* 高亮时背景渐变效果 */
        background: isHighlightedByAgent
          ? `linear-gradient(90deg, ${highlightColor}18 0%, transparent 100%)`
          : "transparent",
        position: "relative",
      }}
      className="flex items-center pr-2 cursor-pointer hover:bg-white/[0.04] rounded-sm"
      onClick={handleClick}
    >
      {/* 左侧 2px 颜色竖条 — 带发光效果，宽度过渡动画 */}
      <div
        className="absolute left-0 top-0 bottom-0 rounded-full"
        style={{
          width: isHighlightedByAgent ? 2 : 0,
          backgroundColor: highlightColor ?? "transparent",
          boxShadow: isHighlightedByAgent ? `0 0 6px ${highlightColor}60` : "none",
          transition: "width 300ms ease, box-shadow 300ms ease",
        }}
      />

      <div className="flex items-center gap-1 flex-1 min-w-0">
        {/* 展开/折叠箭头 */}
        {node.isInternal ? (
          <ChevronRight
            className="w-3 h-3 flex-shrink-0"
            style={{
              transform: node.isOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 150ms ease-out",
              color: "var(--sg-text-tertiary, #8b92a3)",
            }}
          />
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        {/* 文件/文件夹图标 */}
        {node.isInternal ? (
          node.isOpen ? (
            <FolderOpen
              className="w-4 h-4 flex-shrink-0"
              style={{
                color: data.agentColor
                  ? AGENT_COLOR_HEX[data.agentColor] ?? `var(--color-agent-${data.agentColor})`
                  : "var(--sg-text-tertiary, #8b92a3)",
              }}
            />
          ) : (
            <Folder
              className="w-4 h-4 flex-shrink-0"
              style={{
                color: data.agentColor
                  ? AGENT_COLOR_HEX[data.agentColor] ?? `var(--color-agent-${data.agentColor})`
                  : "var(--sg-text-tertiary, #8b92a3)",
              }}
            />
          )
        ) : (
          <>
            {isUntracked && (
              <CircleHelp
                className="w-3 h-3 flex-shrink-0"
                style={{ color: "var(--sg-text-tertiary, #8b92a3)" }}
              />
            )}
            {isConflicted && (
              <AlertCircle
                className="w-3 h-3 flex-shrink-0"
                style={{ color: "var(--sg-error, #ef4444)" }}
              />
            )}
            <File
              className="w-4 h-4 flex-shrink-0"
              style={{
                color: data.agentColor
                  ? AGENT_COLOR_HEX[data.agentColor] ?? `var(--color-agent-${data.agentColor})`
                  : "var(--sg-text-tertiary, #8b92a3)",
              }}
            />
          </>
        )}

        {/* 文件名 — 高亮时白色加粗 + 300ms 颜色过渡 */}
        <span
          className="truncate text-xs"
          style={{
            color: isHighlightedByAgent
              ? "#ffffff"
              : isDeleted
                ? "var(--sg-error, #ef4444)"
                : isAdded
                  ? "var(--sg-success, #22c55e)"
                  : "var(--sg-text-primary, #e4e6eb)",
            fontStyle: isUntracked ? "italic" : "normal",
            textDecoration: isDeleted ? "line-through" : "none",
            fontWeight: isHighlightedByAgent ? 600 : 400,
            transition: "color 300ms ease, font-weight 300ms ease",
          }}
        >
          {data.name}
        </span>

        {/* 实时写入脉动蓝点 */}
        {isWriting && (
          <span className="flex-shrink-0 ml-1">
            <span className="writing-pulse" />
          </span>
        )}

        {/* Git diff 统计 */}
        {diffStat && !node.isInternal && (
          <span
            className="ml-auto flex items-center gap-0.5 text-[10px] flex-shrink-0 tabular-nums"
            style={{ fontFamily: "var(--sg-font-mono, monospace)" }}
          >
            {diffStat.additions > 0 && (
              <span style={{ color: "var(--sg-success, #22c55e)" }}>+{diffStat.additions}</span>
            )}
            {diffStat.deletions > 0 && (
              <span style={{ color: "var(--sg-error, #ef4444)" }}>-{diffStat.deletions}</span>
            )}
          </span>
        )}

        {/* Agent 颜色标记圆点 — 高亮时带发光 */}
        {data.agentColor && !isWriting && (
          <span
            className="w-2 h-2 rounded-full ml-auto flex-shrink-0"
            style={{
              backgroundColor: AGENT_COLOR_HEX[data.agentColor] ?? `var(--color-agent-${data.agentColor})`,
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
