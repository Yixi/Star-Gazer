/**
 * 文件系统服务 - 通过 Tauri IPC 操作文件
 */
import { invoke } from "@tauri-apps/api/core";

/** 目录项 */
export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
}

/** 读取文件内容 */
export async function readFile(path: string): Promise<string> {
  return invoke("read_file", { path });
}

/** 写入文件内容 */
export async function writeFile(path: string, content: string): Promise<void> {
  return invoke("write_file", { path, content });
}

/** 列出目录内容 */
export async function listDir(path: string): Promise<DirEntry[]> {
  return invoke("list_dir", { path });
}

/** 创建目录 */
export async function createDir(path: string): Promise<void> {
  return invoke("create_dir", { path });
}

/** 创建空文件（已存在则后端报错） */
export async function createFile(path: string): Promise<void> {
  return invoke("create_file", { path });
}

/** 复制文件或目录到新路径（目录递归复制） */
export async function copyEntry(src: string, dest: string): Promise<void> {
  return invoke("copy_entry", { src, dest });
}

/** 把文件或目录移到系统回收站 */
export async function trashEntry(path: string): Promise<void> {
  return invoke("trash_entry", { path });
}

/** 永久删除文件或目录（不进回收站） */
export async function removeEntry(path: string): Promise<void> {
  return invoke("remove_entry", { path });
}

/** 重命名文件或目录 */
export async function renameEntry(
  oldPath: string,
  newPath: string
): Promise<void> {
  return invoke("rename_entry", { oldPath, newPath });
}

/** 检查路径是否存在 */
export async function pathExists(path: string): Promise<boolean> {
  return invoke("path_exists", { path });
}
