/**
 * 文件监听服务 - 通过 Tauri 事件系统监听文件变更
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** 文件变更事件类型 */
export type FileChangeKind = "create" | "modify" | "remove" | "rename";

/** 文件变更事件 */
export interface FileChangeEvent {
  kind: FileChangeKind;
  paths: string[];
}

/** 开始监听目录 */
export async function watchDir(path: string): Promise<void> {
  return invoke("watch_dir", { path });
}

/** 停止监听目录 */
export async function unwatchDir(path: string): Promise<void> {
  return invoke("unwatch_dir", { path });
}

/** 监听文件变更事件 */
export async function onFileChange(
  callback: (event: FileChangeEvent) => void
): Promise<UnlistenFn> {
  return listen<FileChangeEvent>("file-change", (event) => {
    callback(event.payload);
  });
}
