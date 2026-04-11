/**
 * Diff 视图 - 使用 react-diff-view 展示文件差异
 */

interface DiffViewProps {
  filePath: string;
}

export function DiffView({ filePath }: DiffViewProps) {
  // TODO: 集成 react-diff-view + unidiff
  // 1. 调用后端 git_diff 获取 unified diff
  // 2. 使用 unidiff 解析 diff 文本
  // 3. 使用 react-diff-view 渲染

  return (
    <div className="p-4 text-muted-foreground text-sm">
      <p>Diff 视图 - {filePath}</p>
      <p className="text-xs mt-2">待实现：react-diff-view 集成</p>
    </div>
  );
}
