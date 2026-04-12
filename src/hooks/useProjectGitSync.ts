/**
 * 项目级 Git 同步 Hook
 *
 * 每个展开的项目独立挂一个这个 hook，职责：
 * 1. `useGitStatus(project.path)` — 拉取该项目的 git 状态
 * 2. `useFileWatcher(project.path)` — 监听项目内文件变化，触发 refresh
 * 3. **轮询兜底**：每 2 秒主动 refresh 一次，不依赖 file watcher 能否
 *    正确抓到 .git 内部变化（FSEvents 对 .git/HEAD 的报告并不总是可靠；
 *    refcount + async unwatch/watch 时序也可能短暂错过事件）
 * 4. 把最新 status 写到 `projectStore.gitStatusByProject[project.id]`
 * 5. 结构性变化（create/remove/rename）时顺带刷新该项目的 FileTree 顶层
 *
 * 成本分析：
 * - `git status` 对典型项目 < 100ms
 * - `useGitStatus` 里做了结构等价比较，无变化时**零 setState 零 re-render**，
 *   轮询只是一次后端 IPC + 一次本地比较，CPU 成本可以忽略
 * - 活跃 project 数量通常是个位数，2 秒 * 几个 project = 可接受
 *
 * 设计取舍：
 * - 首选依赖 file watcher 做"瞬时响应"（改动后几十毫秒内看到更新）
 * - 轮询作为"最终一致性"兜底，无论 watcher 是否工作，2 秒内一定同步
 */
import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGitStatus } from "./useGitStatus";
import { useFileWatcher } from "./useFileWatcher";
import { useProjectStore } from "@/stores/projectStore";
import type { Project, FileNode } from "@/types/project";
import type { FileChangeEvent } from "@/services/watcher";

/** Git 状态轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 2000;

/** 后端 DirEntry 类型 */
interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
}

export function useProjectGitSync(project: Project) {
  const { status, refresh } = useGitStatus(project.path);

  // 把 git 状态写到 store（只在内容真正变化时，useGitStatus 已做 dedupe）
  useEffect(() => {
    if (!status) return;
    useProjectStore.getState().setGitStatus(project.id, status);
  }, [status, project.id]);

  // 文件变更回调：git 状态刷新 + 结构性变化时刷新文件树顶层
  const handleFileChange = useCallback(
    (event: FileChangeEvent) => {
      // 无论 modify / create / remove 都触发 git status refresh
      refresh();

      // 仅结构变化需要刷新文件树（新增/删除/重命名）
      // modify 事件不改文件树结构，跳过
      if (event.kind === "modify") return;

      (async () => {
        try {
          const entries = await invoke<DirEntry[]>("list_dir", {
            path: project.path,
          });
          const fileNodes: FileNode[] = entries.map((entry) => {
            const relativePath = entry.path.startsWith(project.path)
              ? entry.path.slice(project.path.length).replace(/^\//, "")
              : entry.name;
            return {
              id: relativePath || entry.name,
              name: entry.name,
              path: entry.path,
              isDir: entry.isDir,
              children: entry.isDir ? [] : undefined,
            };
          });
          useProjectStore.getState().setProjectFileTree(project.id, fileNodes);
        } catch (err) {
          console.warn("文件监听触发的文件树刷新失败:", err);
        }
      })();
    },
    [refresh, project.path, project.id],
  );

  useFileWatcher(project.path, handleFileChange);

  // 轮询兜底：无论 file watcher 是否正常工作，每 POLL_INTERVAL_MS 主动 refresh 一次
  // 配合 useGitStatus 的结构等价比较，无变化时零下游 re-render
  useEffect(() => {
    const timer = window.setInterval(() => {
      refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);
}
