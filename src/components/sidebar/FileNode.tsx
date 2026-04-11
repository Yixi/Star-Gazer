/**
 * 文件树节点组件
 */
import { useState } from "react";
import { ChevronRight, File, FolderOpen, Folder } from "lucide-react";
import { usePanelStore } from "@/stores/panelStore";
import type { FileNode as FileNodeType } from "@/types/project";

interface FileNodeProps {
  node: FileNodeType;
  depth: number;
}

/** Git 状态颜色映射 */
const GIT_STATUS_COLORS: Record<string, string> = {
  modified: "text-agent-yellow",
  added: "text-agent-green",
  deleted: "text-agent-red",
  untracked: "text-agent-cyan",
  conflicted: "text-agent-orange",
};

export function FileNode({ node, depth }: FileNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const openTab = usePanelStore((s) => s.openTab);

  const handleClick = () => {
    if (node.isDir) {
      setExpanded(!expanded);
    } else {
      // 在面板中打开文件
      openTab({
        id: node.path,
        title: node.name,
        type: "file",
        filePath: node.path,
        isDirty: false,
      });
    }
  };

  const statusColor = node.gitStatus
    ? GIT_STATUS_COLORS[node.gitStatus] ?? ""
    : "";

  return (
    <div>
      <button
        className={`w-full flex items-center gap-1 px-1 py-0.5 rounded-sm text-sm hover:bg-accent/50 transition-colors ${statusColor}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
      >
        {node.isDir && (
          <ChevronRight
            className={`w-3 h-3 transition-transform flex-shrink-0 ${
              expanded ? "rotate-90" : ""
            }`}
          />
        )}
        {node.isDir ? (
          expanded ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0" />
          )
        ) : (
          <File className="w-4 h-4 flex-shrink-0 ml-3" />
        )}
        <span className="truncate">{node.name}</span>
        {/* Agent 颜色标记 */}
        {node.agentColor && (
          <span
            className="w-2 h-2 rounded-full ml-auto flex-shrink-0"
            style={{ backgroundColor: `var(--color-agent-${node.agentColor})` }}
          />
        )}
      </button>
      {expanded && node.children?.map((child) => (
        <FileNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
