/**
 * 文件树快捷键 — 仅在文件树容器 focus 时生效
 *
 * | 键              | 动作                     |
 * | --------------- | ------------------------ |
 * | Enter / F2      | rename 当前选中节点      |
 * | ⌘⌫              | 删除选中节点（弹确认）   |
 * | ⌘N              | 新建文件（在选中目录或父目录下）|
 * | ⇧⌘N             | 新建目录                 |
 * | ⌘C / ⌘X / ⌘V    | copy / cut / paste       |
 * | ⌥⌘C             | copy absolute path       |
 * | ⇧⌥⌘C            | copy relative path       |
 * | Esc             | 取消当前编辑态           |
 *
 * 注意：input / textarea 聚焦时一律放行，避免吞掉用户输入；
 * editing（rename/create）态由 InlineInput 自己处理键，外层这里就放行。
 */
import { useEffect } from "react";
import { useFileTreeUIStore } from "@/stores/fileTreeUIStore";
import { useProjectStore } from "@/stores/projectStore";
import type { FileNode } from "@/types/project";
import type { Project } from "@/types/project";
import type { FileTreeActions } from "./useFileTreeActions";

/** 在 fileTree 中按 id 找节点 — 跟 FileTree 内部的 helper 一致 */
function findNodeById(
  nodes: FileNode[],
  id: string,
): FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 文件节点 → 父目录（绝对路径 + 相对 id），目录节点 → 自身 */
function targetDirOf(
  node: FileNode,
  projectPath: string,
): { dirPath: string; dirId: string | "__root__" } {
  if (node.isDir) {
    return { dirPath: node.path, dirId: node.id };
  }
  const lastSlashAbs = node.path.lastIndexOf("/");
  const dirPath =
    lastSlashAbs > 0 ? node.path.slice(0, lastSlashAbs) : projectPath;
  const lastSlashId = node.id.lastIndexOf("/");
  const dirId = lastSlashId > 0 ? node.id.slice(0, lastSlashId) : "__root__";
  return { dirPath, dirId };
}

export function useFileTreeShortcuts(
  project: Project,
  actions: FileTreeActions,
  /** 删除时调用方需要弹确认 */
  onRequestDelete: (node: FileNode) => void,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ui = useFileTreeUIStore.getState();
      // 不在文件树 focus 状态下直接放行
      if (!ui.isFocused) return;
      // 编辑态由 inline input 自己处理（input 上 stopPropagation）
      if (ui.editing) return;

      // input / textarea / contenteditable 聚焦时放行
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const isMod = e.metaKey || e.ctrlKey;
      const sel = ui.selectedNodeId;
      // 仅处理本项目的选中
      const selNode = (() => {
        if (!sel || sel.projectId !== project.id) return undefined;
        const tree = useProjectStore.getState().projectFileTrees[project.id] ?? [];
        return findNodeById(tree, sel.nodeId);
      })();

      // ===== Esc：取消编辑（编辑态前面已 return，这里其实不会到，但保留以防）=====
      if (e.key === "Escape") {
        if (ui.editing) {
          e.preventDefault();
          ui.cancelEditing();
          return;
        }
      }

      // ===== Enter / F2：rename =====
      if ((e.key === "Enter" || e.key === "F2") && !isMod && selNode) {
        e.preventDefault();
        actions.startRename(selNode);
        return;
      }

      // ===== ⌘⌫：delete =====
      if (isMod && (e.key === "Backspace" || e.key === "Delete") && selNode) {
        e.preventDefault();
        onRequestDelete(selNode);
        return;
      }

      // ===== ⌘N / ⇧⌘N：new file/folder =====
      if (isMod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const kind: "create-file" | "create-dir" = e.shiftKey
          ? "create-dir"
          : "create-file";
        if (selNode) {
          const { dirPath, dirId } = targetDirOf(selNode, project.path);
          actions.startCreate(dirId, dirPath, kind);
        } else {
          actions.startCreate("__root__", project.path, kind);
        }
        return;
      }

      // ===== ⌥⌘C：copy absolute path / ⇧⌥⌘C：copy relative path =====
      if (isMod && e.altKey && e.key.toLowerCase() === "c" && selNode) {
        e.preventDefault();
        if (e.shiftKey) {
          void actions.copyRelativePath(selNode);
        } else {
          void actions.copyAbsolutePath(selNode);
        }
        return;
      }

      // ===== ⌘C / ⌘X / ⌘V =====
      if (isMod && !e.altKey && e.key.toLowerCase() === "c" && selNode) {
        e.preventDefault();
        actions.copyNode(selNode);
        return;
      }
      if (isMod && e.key.toLowerCase() === "x" && selNode) {
        e.preventDefault();
        actions.cutNode(selNode);
        return;
      }
      if (isMod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        // 粘贴目标：选中目录 → 自身；选中文件 → 父目录；无选中 → 项目根
        const dir = selNode
          ? targetDirOf(selNode, project.path).dirPath
          : project.path;
        void actions.pasteIntoDir(dir);
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [project.id, project.path, actions, onRequestDelete]);
}
