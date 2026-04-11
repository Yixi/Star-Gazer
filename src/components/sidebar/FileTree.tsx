/**
 * 文件树组件 - 使用 react-arborist 渲染文件树
 * 深度融合 Git 状态和 Agent 颜色标记
 */
import { useProjectStore } from "@/stores/projectStore";
import { FileNode } from "./FileNode";

export function FileTree() {
  const { fileTree, isLoading } = useProjectStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        加载文件树...
      </div>
    );
  }

  if (fileTree.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        空目录
      </div>
    );
  }

  // TODO: 集成 react-arborist 实现完整的虚拟化文件树
  return (
    <div className="p-1 overflow-auto h-full">
      {fileTree.map((node) => (
        <FileNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}
