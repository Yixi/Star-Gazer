/**
 * 文件树节点右键菜单 — VSCode 风格
 *
 * 行为分支：
 * - 文件节点：New File/Folder 作用于 "父目录"
 * - 目录节点：New File/Folder 作用于 "自身"
 * - Paste：clipboard 非空才启用
 * - Delete：请求 onRequestDelete，调用方负责确认弹窗
 *
 * 不参与状态管理 —— 把所有动作委托给 useFileTreeActions hook
 */
import {
  FilePlus,
  FolderPlus,
  Scissors,
  Copy,
  ClipboardPaste,
  Link as LinkIcon,
  Hash,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuItem,
  MenuDivider,
} from "@/components/ui/ContextMenu";
import { useFileTreeUIStore } from "@/stores/fileTreeUIStore";
import type { FileNode } from "@/types/project";
import type { FileTreeActions } from "@/hooks/useFileTreeActions";

interface FileTreeContextMenuProps {
  node: FileNode;
  /** 节点所在目录的绝对路径 — 文件节点为父目录，目录节点为自身 */
  targetDirPath: string;
  /** 节点所在目录在 fileTree 中的 id — 文件节点为父节点 id，目录节点为自身 id */
  targetDirId: string | "__root__";
  x: number;
  y: number;
  onClose: () => void;
  actions: FileTreeActions;
  /** 删除请求 — 调用方接住后弹确认对话框 */
  onRequestDelete: (node: FileNode) => void;
}

export function FileTreeContextMenu({
  node,
  targetDirPath,
  targetDirId,
  x,
  y,
  onClose,
  actions,
  onRequestDelete,
}: FileTreeContextMenuProps) {
  const clipboard = useFileTreeUIStore((s) => s.clipboard);
  const canPaste = clipboard !== null && clipboard.paths.length > 0;

  const handle = (fn: () => void | Promise<void>) => () => {
    onClose();
    void fn();
  };

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <ContextMenuItem
        icon={<FilePlus className="w-3.5 h-3.5" />}
        label="New File"
        onClick={handle(() =>
          actions.startCreate(targetDirId, targetDirPath, "create-file"),
        )}
      />
      <ContextMenuItem
        icon={<FolderPlus className="w-3.5 h-3.5" />}
        label="New Folder"
        onClick={handle(() =>
          actions.startCreate(targetDirId, targetDirPath, "create-dir"),
        )}
      />

      <MenuDivider />

      <ContextMenuItem
        icon={<Scissors className="w-3.5 h-3.5" />}
        label="Cut"
        shortcut="⌘X"
        onClick={handle(() => actions.cutNode(node))}
      />
      <ContextMenuItem
        icon={<Copy className="w-3.5 h-3.5" />}
        label="Copy"
        shortcut="⌘C"
        onClick={handle(() => actions.copyNode(node))}
      />
      <ContextMenuItem
        icon={<ClipboardPaste className="w-3.5 h-3.5" />}
        label="Paste"
        shortcut="⌘V"
        disabled={!canPaste}
        onClick={handle(() => actions.pasteIntoDir(targetDirPath))}
      />

      <MenuDivider />

      <ContextMenuItem
        icon={<LinkIcon className="w-3.5 h-3.5" />}
        label="Copy Path"
        shortcut="⌥⌘C"
        onClick={handle(() => actions.copyAbsolutePath(node))}
      />
      <ContextMenuItem
        icon={<Hash className="w-3.5 h-3.5" />}
        label="Copy Relative Path"
        shortcut="⇧⌥⌘C"
        onClick={handle(() => actions.copyRelativePath(node))}
      />

      <MenuDivider />

      <ContextMenuItem
        icon={<Pencil className="w-3.5 h-3.5" />}
        label="Rename..."
        shortcut="↵"
        onClick={handle(() => actions.startRename(node))}
      />
      <ContextMenuItem
        icon={<Trash2 className="w-3.5 h-3.5" />}
        label="Delete"
        shortcut="⌘⌫"
        danger
        onClick={() => {
          onClose();
          onRequestDelete(node);
        }}
      />

      <MenuDivider />

      <ContextMenuItem
        icon={<ExternalLink className="w-3.5 h-3.5" />}
        label="Reveal in Finder"
        onClick={handle(() => actions.revealInFinder(node))}
      />
    </ContextMenu>
  );
}
