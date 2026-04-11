/**
 * Git 状态 Hook - 定期刷新 Git 状态信息
 */
import { useEffect, useState, useCallback } from "react";
import { gitStatus, type GitStatusSummary } from "@/services/git";

export function useGitStatus(repoPath: string | null) {
  const [status, setStatus] = useState<GitStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await gitStatus(repoPath);
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, isLoading, error, refresh };
}
