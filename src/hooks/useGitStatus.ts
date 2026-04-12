/**
 * Git 状态 Hook - 定期刷新 Git 状态信息
 *
 * 优化：setStatus 前做结构等价比较，内容完全一样就不触发 setState
 * —— 避免 watcher 抖动时每次 fetch 都产生新对象 → 下游全量 re-render。
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { gitStatus, type GitStatusSummary, type GitFileChange } from "@/services/git";

/** 结构等价判断：branch/ahead/behind/staged/unstaged/untracked 全部一致才算相等 */
function gitStatusEquals(
  a: GitStatusSummary | null,
  b: GitStatusSummary | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.branch !== b.branch) return false;
  if (a.ahead !== b.ahead) return false;
  if (a.behind !== b.behind) return false;
  if (!changesEqual(a.staged, b.staged)) return false;
  if (!changesEqual(a.unstaged, b.unstaged)) return false;
  if (!stringListEqual(a.untracked, b.untracked)) return false;
  return true;
}

function changesEqual(a: GitFileChange[], b: GitFileChange[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.path !== y.path ||
      x.status !== y.status ||
      x.additions !== y.additions ||
      x.deletions !== y.deletions
    ) {
      return false;
    }
  }
  return true;
}

function stringListEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function useGitStatus(repoPath: string | null) {
  const [status, setStatus] = useState<GitStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<GitStatusSummary | null>(null);
  statusRef.current = status;

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await gitStatus(repoPath);
      // 只有内容真变化才 setState，避免对象引用变化触发下游无效 re-render
      if (!gitStatusEquals(statusRef.current, result)) {
        setStatus(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    // 切换 repoPath 时先清空本地 status，防止上一个仓库的数据短暂泄漏到新仓库
    setStatus(null);
    statusRef.current = null;
    refresh();
  }, [refresh]);

  return { status, isLoading, error, refresh };
}
