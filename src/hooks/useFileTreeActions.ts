/**
 * 文件树 CRUD 动作集合 — 给右键菜单 / 快捷键 / inline input 提交统一编排
 *
 * 把"调 fs 服务 + 联动 panelStore Tab + invalidate fileTree"绑成一组动作，
 * 避免在三个调用点（菜单 / 快捷键 / inline 提交）重复同一段编排。
 */
import { useCallback } from "react";
import {
  createFile,
  createDir,
  copyEntry,
  trashEntry,
  renameEntry,
  pathExists,
} from "@/services/fs";
import { useProjectStore } from "@/stores/projectStore";
import { usePanelStore } from "@/stores/panelStore";
import { useFileTreeUIStore, type ClipboardState } from "@/stores/fileTreeUIStore";
import type { Project } from "@/types/project";
import type { FileNode } from "@/types/project";

/** 取目标路径的父目录（绝对路径）*/
function parentOf(absPath: string): string {
  const i = absPath.lastIndexOf("/");
  return i > 0 ? absPath.slice(0, i) : absPath;
}

/** 取文件名 / 末段 */
function basename(absPath: string): string {
  const i = absPath.lastIndexOf("/");
  return i >= 0 ? absPath.slice(i + 1) : absPath;
}

/** 拼绝对路径 */
function joinPath(dir: string, name: string): string {
  if (dir.endsWith("/")) return dir + name;
  return dir + "/" + name;
}

/**
 * 找一个不冲突的目标路径：file.txt → file copy.txt → file copy 2.txt ...
 * VSCode 风格的 paste 重名解决。
 */
async function uniqueDest(targetDir: string, name: string): Promise<string> {
  const direct = joinPath(targetDir, name);
  if (!(await pathExists(direct))) return direct;

  // 拆出 stem 和 ext（隐藏文件 .gitignore 视为整体无 ext）
  let stem = name;
  let ext = "";
  const dot = name.lastIndexOf(".");
  if (dot > 0) {
    stem = name.slice(0, dot);
    ext = name.slice(dot);
  }

  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? `${stem} copy${ext}` : `${stem} copy ${i}${ext}`;
    const full = joinPath(targetDir, candidate);
    if (!(await pathExists(full))) return full;
  }
  // 极端兜底：附加时间戳
  return joinPath(targetDir, `${stem} copy ${Date.now()}${ext}`);
}

export interface FileTreeActions {
  startCreate: (
    parentId: string | "__root__",
    parentPath: string,
    kind: "create-file" | "create-dir",
  ) => void;
  startRename: (node: FileNode) => void;

  /** 提交 rename — Enter 触发，调 fs + 联动 panelStore + invalidate */
  commitRename: (node: FileNode, newName: string) => Promise<void>;
  /** 提交 create — Enter 触发 */
  commitCreate: (
    parentPath: string,
    kind: "create-file" | "create-dir",
    name: string,
  ) => Promise<void>;

  /** 删除（移到回收站）— 调用方自己负责确认弹窗 */
  trashNode: (node: FileNode) => Promise<void>;

  copyNode: (node: FileNode) => void;
  cutNode: (node: FileNode) => void;
  /** 粘贴到目标目录的绝对路径 */
  pasteIntoDir: (targetAbsPath: string) => Promise<void>;

  copyAbsolutePath: (node: FileNode) => Promise<void>;
  copyRelativePath: (node: FileNode) => Promise<void>;
  revealInFinder: (node: FileNode) => Promise<void>;
}

export function useFileTreeActions(project: Project): FileTreeActions {
  const startCreateUI = useFileTreeUIStore((s) => s.startCreate);
  const startRenameUI = useFileTreeUIStore((s) => s.startRename);
  const cancelEditing = useFileTreeUIStore((s) => s.cancelEditing);
  const setClipboard = useFileTreeUIStore((s) => s.setClipboard);
  const clipboard = useFileTreeUIStore((s) => s.clipboard);

  const startCreate: FileTreeActions["startCreate"] = useCallback(
    (parentId, parentPath, kind) => {
      startCreateUI(project.id, parentId, parentPath, kind);
    },
    [project.id, startCreateUI],
  );

  const startRename: FileTreeActions["startRename"] = useCallback(
    (node) => {
      startRenameUI(project.id, node.id, node.name);
    },
    [project.id, startRenameUI],
  );

  const commitRename: FileTreeActions["commitRename"] = useCallback(
    async (node, newName) => {
      cancelEditing();
      if (!newName || newName === node.name) return;
      const parent = parentOf(node.path);
      const newPath = joinPath(parent, newName);
      try {
        await renameEntry(node.path, newPath);
        // 更新已打开的对应 tab 的 path（用前缀匹配，目录改名时下面所有 tab 一起迁）
        const tabs = usePanelStore.getState().tabs;
        const oldPrefix = node.path;
        for (const t of tabs) {
          if (t.id === oldPrefix) {
            usePanelStore.getState().updateTabPath(t.id, newPath);
          } else if (t.id.startsWith(oldPrefix + "/")) {
            const suffix = t.id.slice(oldPrefix.length);
            usePanelStore.getState().updateTabPath(t.id, newPath + suffix);
          }
        }
        await useProjectStore
          .getState()
          .invalidateDir(project.id, project.path, parent);
      } catch (err) {
        console.warn("rename 失败", err);
        alert(`重命名失败：${err}`);
      }
    },
    [cancelEditing, project.id, project.path],
  );

  const commitCreate: FileTreeActions["commitCreate"] = useCallback(
    async (parentPath, kind, name) => {
      cancelEditing();
      if (!name) return;
      const dest = joinPath(parentPath, name);
      try {
        if (kind === "create-file") {
          await createFile(dest);
        } else {
          await createDir(dest);
        }
        await useProjectStore
          .getState()
          .invalidateDir(project.id, project.path, parentPath);
        // 新建文件后顺手打开成 preview tab，VSCode 行为
        if (kind === "create-file") {
          usePanelStore.getState().openTab({
            id: dest,
            title: name,
            type: "file",
            filePath: dest,
            projectPath: project.path,
            isPreview: true,
            isDirty: false,
          });
        }
      } catch (err) {
        console.warn("create 失败", err);
        alert(`创建失败：${err}`);
      }
    },
    [cancelEditing, project.id, project.path],
  );

  const trashNode: FileTreeActions["trashNode"] = useCallback(
    async (node) => {
      try {
        await trashEntry(node.path);
        // 关闭命中的 tab（文件就关自己；目录就连同子树一起关）
        usePanelStore.getState().closeTabsUnderPath(node.path);
        await useProjectStore
          .getState()
          .invalidateDir(project.id, project.path, parentOf(node.path));
      } catch (err) {
        console.warn("trash 失败", err);
        alert(`移到回收站失败：${err}`);
      }
    },
    [project.id, project.path],
  );

  const copyNode: FileTreeActions["copyNode"] = useCallback(
    (node) => {
      setClipboard({
        mode: "copy",
        paths: [node.path],
        projectId: project.id,
      });
    },
    [project.id, setClipboard],
  );

  const cutNode: FileTreeActions["cutNode"] = useCallback(
    (node) => {
      setClipboard({
        mode: "cut",
        paths: [node.path],
        projectId: project.id,
      });
    },
    [project.id, setClipboard],
  );

  const pasteIntoDir: FileTreeActions["pasteIntoDir"] = useCallback(
    async (targetAbsPath) => {
      const cb: ClipboardState = clipboard;
      if (!cb || cb.paths.length === 0) return;
      try {
        for (const src of cb.paths) {
          const name = basename(src);
          const dest = await uniqueDest(targetAbsPath, name);
          if (cb.mode === "copy") {
            await copyEntry(src, dest);
          } else {
            // cut：跨目录 move = rename
            await renameEntry(src, dest);
            // 联动 tab 路径
            const tabs = usePanelStore.getState().tabs;
            for (const t of tabs) {
              if (t.id === src) {
                usePanelStore.getState().updateTabPath(t.id, dest);
              } else if (t.id.startsWith(src + "/")) {
                const suffix = t.id.slice(src.length);
                usePanelStore.getState().updateTabPath(t.id, dest + suffix);
              }
            }
            // 源目录也要 invalidate
            await useProjectStore
              .getState()
              .invalidateDir(project.id, project.path, parentOf(src));
          }
        }
        await useProjectStore
          .getState()
          .invalidateDir(project.id, project.path, targetAbsPath);
        if (cb.mode === "cut") {
          useFileTreeUIStore.getState().clearClipboard();
        }
      } catch (err) {
        console.warn("paste 失败", err);
        alert(`粘贴失败：${err}`);
      }
    },
    [clipboard, project.id, project.path],
  );

  const copyAbsolutePath: FileTreeActions["copyAbsolutePath"] = useCallback(
    async (node) => {
      try {
        await navigator.clipboard.writeText(node.path);
      } catch (err) {
        console.warn("写剪贴板失败", err);
      }
    },
    [],
  );

  const copyRelativePath: FileTreeActions["copyRelativePath"] = useCallback(
    async (node) => {
      try {
        await navigator.clipboard.writeText(node.id);
      } catch (err) {
        console.warn("写剪贴板失败", err);
      }
    },
    [],
  );

  const revealInFinder: FileTreeActions["revealInFinder"] = useCallback(
    async (node) => {
      try {
        const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
        await revealItemInDir(node.path);
      } catch (err) {
        console.warn("Reveal in Finder 失败", err);
      }
    },
    [],
  );

  return {
    startCreate,
    startRename,
    commitRename,
    commitCreate,
    trashNode,
    copyNode,
    cutNode,
    pasteIntoDir,
    copyAbsolutePath,
    copyRelativePath,
    revealInFinder,
  };
}
