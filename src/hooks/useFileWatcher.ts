/**
 * 文件监听 Hook - 监听目录变更并回调
 */
import { useEffect, useRef } from "react";
import { watchDir, unwatchDir, onFileChange, type FileChangeEvent } from "@/services/watcher";

export function useFileWatcher(
  dirPath: string | null,
  onChange: (event: FileChangeEvent) => void
) {
  // onChange 往往是内联函数，每次 render 都是新引用。用 ref 锁定最新值，
  // 依赖数组只保留 dirPath，避免 watcher 反复注册/注销。
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!dirPath) return;

    let unlistenFn: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      try {
        await watchDir(dirPath);
        if (cancelled) {
          // setup 期间组件已卸载，不要注册监听
          unwatchDir(dirPath).catch(console.error);
          return;
        }
        unlistenFn = await onFileChange((event) => onChangeRef.current(event));
        if (cancelled) {
          unlistenFn?.();
          unlistenFn = null;
        }
      } catch (err) {
        console.error("文件监听初始化失败:", err);
      }
    };

    setup();

    return () => {
      cancelled = true;
      unlistenFn?.();
      unwatchDir(dirPath).catch(console.error);
    };
  }, [dirPath]);
}
