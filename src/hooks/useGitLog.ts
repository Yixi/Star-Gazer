/**
 * Git 日志 Hook - 加载指定仓库的 commit 历史
 * 写入 projectStore 供各视图共享
 */
import { useEffect, useState, useCallback } from "react";
import { gitLog, type GitLogEntry } from "@/services/git";
import { useProjectStore } from "@/stores/projectStore";

/**
 * 加载 commit 历史
 * - `limit` 省略表示全部 commits（默认）；页面通过虚拟滚动渲染，无需分页
 */
export function useGitLog(projectId: string | null, repoPath: string | null, limit?: number) {
  const [entries, setEntries] = useState<GitLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath || !projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await gitLog(repoPath, limit);
      setEntries(result);
      useProjectStore.getState().setGitLog(projectId, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [repoPath, projectId, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { entries, isLoading, error, refresh };
}
