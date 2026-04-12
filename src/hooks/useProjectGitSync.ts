/**
 * 项目级 Git 同步 Hook
 *
 * 每个展开的项目独立挂一个这个 hook，职责：
 * 1. `useGitStatus(project.path)` — 拉取该项目的 git 状态
 * 2. `useFileWatcher(project.path)` — 监听项目内文件变化，触发 refresh
 * 3. 把最新 status 写到 `projectStore.gitStatusByProject[project.id]`
 * 4. 结构性变化（create/remove/rename）时顺带刷新该项目的 FileTree 顶层
 *
 * 设计动机：
 * - 以前只有 active project 有 watcher/useGitStatus，切到别的项目或在
 *   非 active 项目里改动文件都不会更新状态
 * - 下沉到 project 粒度后，所有**展开的**项目都能实时更新，折叠后自动清理
 * - `FileWatcherManager` 按 path 去重，多个相同 project 重复 mount hook
 *   只会产生一个真实的 notify watcher；`useGitStatus` 的对象等价比较
 *   也避免无变化时触发下游 re-render
 */
import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGitStatus } from "./useGitStatus";
import { useFileWatcher } from "./useFileWatcher";
import { useProjectStore } from "@/stores/projectStore";
import type { Project, FileNode } from "@/types/project";
import type { FileChangeEvent } from "@/services/watcher";

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
}
