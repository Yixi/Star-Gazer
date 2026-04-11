/**
 * 文件监听 Hook - 监听目录变更并回调
 */
import { useEffect } from "react";
import { watchDir, unwatchDir, onFileChange, type FileChangeEvent } from "@/services/watcher";

export function useFileWatcher(
  dirPath: string | null,
  onChange: (event: FileChangeEvent) => void
) {
  useEffect(() => {
    if (!dirPath) return;

    let unlistenFn: (() => void) | null = null;

    const setup = async () => {
      try {
        await watchDir(dirPath);
        unlistenFn = await onFileChange(onChange);
      } catch (err) {
        console.error("文件监听初始化失败:", err);
      }
    };

    setup();

    return () => {
      unlistenFn?.();
      unwatchDir(dirPath).catch(console.error);
    };
  }, [dirPath, onChange]);
}
