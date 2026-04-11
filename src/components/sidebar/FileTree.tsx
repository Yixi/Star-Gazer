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

/** 从后端加载文件树 */
async function loadFileTree(projectPath: string) {
  const store = useProjectStore.getState();
  store.setLoading(true);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const entries = await invoke<FileNode[]>("list_directory", {
      path: projectPath,
    });
    store.setFileTree(entries);
  } catch (err) {
    console.warn("Failed to load file tree, using mock data:", err);
    // 开发时使用 mock 数据
    store.setFileTree(getMockFileTree());
  } finally {
    store.setLoading(false);
  }
}

/** 单个文件树节点 */
function FileTreeNode({ node, style }: NodeRendererProps<FileNode>) {
  const data = node.data;
  const openTab = usePanelStore((s) => s.openTab);
  const writingFiles = useProjectStore((s) => s.writingFiles);
  const hoveredAgentId = useProjectStore((s) => s.hoveredAgentId);
  const agentFileMap = useProjectStore((s) => s.agentFileMap);
  const fileDiffStats = useProjectStore((s) => s.fileDiffStats);

  const isWriting = writingFiles.has(data.path);

  // 检查文件是否被 hover 的 agent 修改
  const isHighlightedByAgent =
    hoveredAgentId && agentFileMap[hoveredAgentId]?.includes(data.path);
  const isOtherAgentFile =
    hoveredAgentId &&
    !isHighlightedByAgent &&
    Object.entries(agentFileMap).some(
      ([agentId, files]) => agentId !== hoveredAgentId && files.includes(data.path)
    );

  const handleClick = () => {
    if (node.isInternal) {
      node.toggle();
    } else {
      // 改动文件默认 diff 模式，未改动文件 file 模式
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

  // 获取 diff 统计
  const diffStat = data.diffStat || fileDiffStats[data.path];

  // 样式计算
  const isUntracked = data.gitStatus === "untracked";
  const isDeleted = data.gitStatus === "deleted";
  const isAdded = data.gitStatus === "added";
  const isConflicted = data.gitStatus === "conflicted";

  // hover 关联高亮
  let opacity = 1;
  let bgHighlight = "transparent";
  if (hoveredAgentId) {
    if (isHighlightedByAgent) {
      bgHighlight = "rgba(74, 158, 255, 0.08)";
    } else if (isOtherAgentFile) {
      opacity = 0.35;
    }
  }

  return (
    <div
      style={{
        ...style,
        opacity,
      }}
      className="flex items-center pr-2 cursor-pointer hover:bg-white/[0.04] transition-colors rounded-sm"
      onClick={handleClick}
    >
      {/* Agent hover 高亮左边条 */}
      {isHighlightedByAgent && (
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5"
          style={{ backgroundColor: "#4a9eff" }}
        />
      )}

      <div
        className="flex items-center gap-1 flex-1 min-w-0"
        style={{ background: bgHighlight }}
      >
        {/* 展开/折叠箭头 */}
        {node.isInternal ? (
          <ChevronRight
            className="w-3 h-3 flex-shrink-0 transition-transform"
            style={{
              transform: node.isOpen ? "rotate(90deg)" : "rotate(0deg)",
              color: "#8b92a3",
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
                  ? `var(--color-agent-${data.agentColor})`
                  : "#8b92a3",
              }}
            />
          ) : (
            <Folder
              className="w-4 h-4 flex-shrink-0"
              style={{
                color: data.agentColor
                  ? `var(--color-agent-${data.agentColor})`
                  : "#8b92a3",
              }}
            />
          )
        ) : (
          <>
            {/* 未跟踪文件前缀 ? */}
            {isUntracked && (
              <CircleHelp
                className="w-3 h-3 flex-shrink-0"
                style={{ color: "#8b92a3" }}
              />
            )}
            {/* 冲突文件前缀 ! */}
            {isConflicted && (
              <AlertCircle
                className="w-3 h-3 flex-shrink-0"
                style={{ color: "#ef4444" }}
              />
            )}
            <File
              className="w-4 h-4 flex-shrink-0"
              style={{
                color: data.agentColor
                  ? `var(--color-agent-${data.agentColor})`
                  : "#8b92a3",
              }}
            />
          </>
        )}

        {/* 文件名 */}
        <span
          className="truncate text-xs"
          style={{
            color: isHighlightedByAgent
              ? "#ffffff"
              : isDeleted
                ? "#ef4444"
                : isAdded
                  ? "#22c55e"
                  : "#e4e6eb",
            fontStyle: isUntracked ? "italic" : "normal",
            textDecoration: isDeleted ? "line-through" : "none",
            fontWeight: isHighlightedByAgent ? 600 : 400,
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
          <span className="ml-auto flex items-center gap-0.5 text-[10px] flex-shrink-0 tabular-nums">
            {diffStat.additions > 0 && (
              <span style={{ color: "#22c55e" }}>+{diffStat.additions}</span>
            )}
            {diffStat.deletions > 0 && (
              <span style={{ color: "#ef4444" }}>-{diffStat.deletions}</span>
            )}
          </span>
        )}

        {/* Agent 颜色标记 */}
        {data.agentColor && !isWriting && (
          <span
            className="w-2 h-2 rounded-full ml-auto flex-shrink-0"
            style={{
              backgroundColor: `var(--color-agent-${data.agentColor})`,
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
