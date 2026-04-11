/**
 * 文件树节点组件 (legacy)
 *
 * 此组件已被 FileTree.tsx 中的 react-arborist 节点渲染器取代。
 * 保留空导出以防止其他模块引用导致构建错误。
 */
import type { FileNode as FileNodeType } from "@/types/project";

interface FileNodeProps {
  node: FileNodeType;
  depth: number;
}

/** @deprecated 使用 FileTree.tsx 中的 react-arborist 节点渲染器 */
export function FileNode(_props: FileNodeProps) {
  return null;
}
