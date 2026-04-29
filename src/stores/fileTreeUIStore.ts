/**
 * 文件树临时 UI 状态 — inline 编辑 / 剪贴板 / 选中节点 / 焦点
 *
 * 不进 workspace 文件，纯运行时。
 *
 * **为什么不放 projectStore**：react-arborist 节点是虚拟化渲染（节点出窗就卸载），
 * 编辑态（rename input / 占位 create input）必须存在外部 store 才不丢；同时
 * 剪贴板和"哪个节点被选中"需要被全局快捷键和右键菜单读到，单独一个 store
 * 把视觉/交互状态聚合起来更清晰。
 */
import { create } from "zustand";

/** 编辑态：rename / create-file / create-dir，三者互斥 */
export type EditingState =
  | null
  | {
      kind: "rename";
      /** 被重命名节点的相对路径（FileNode.id）*/
      nodeId: string;
      /** 当前文件名（input 默认值，含扩展名）*/
      initialName: string;
      /** 节点所属项目 id（用于 store 联动）*/
      projectId: string;
    }
  | {
      kind: "create-file" | "create-dir";
      /**
       * 占位行的父节点：
       * - 项目 id 同时也作为 "__root__" 的标识 — 用 projectId 即可，因为
       *   "__root__" 等价于该项目根目录
       * - 子目录则用其相对路径（FileNode.id）
       */
      projectId: string;
      /** "__root__" 表示项目根 */
      parentId: string | "__root__";
      /** 父目录的绝对路径，CRUD 操作和 invalidateDir 都需要 */
      parentPath: string;
    };

/** 剪贴板态：Cut / Copy 共享同一栏，新写入会覆盖旧的 */
export type ClipboardState =
  | null
  | { mode: "copy" | "cut"; paths: string[]; projectId: string };

interface FileTreeUIState {
  /** 当前编辑态 */
  editing: EditingState;
  /** 剪贴板 */
  clipboard: ClipboardState;
  /**
   * 当前选中节点（被快捷键消费）
   *
   * 只跟踪 "最后一次右键 / 单击" 的节点，多选放后续阶段
   */
  selectedNodeId: { projectId: string; nodeId: string } | null;
  /** 文件树容器是否处于 focus（决定是否吃快捷键）*/
  isFocused: boolean;

  startRename: (projectId: string, nodeId: string, initialName: string) => void;
  startCreate: (
    projectId: string,
    parentId: string | "__root__",
    parentPath: string,
    kind: "create-file" | "create-dir",
  ) => void;
  cancelEditing: () => void;

  setClipboard: (clipboard: ClipboardState) => void;
  clearClipboard: () => void;

  setSelected: (selection: FileTreeUIState["selectedNodeId"]) => void;
  clearSelected: () => void;

  setFocused: (focused: boolean) => void;
}

export const useFileTreeUIStore = create<FileTreeUIState>((set) => ({
  editing: null,
  clipboard: null,
  selectedNodeId: null,
  isFocused: false,

  startRename: (projectId, nodeId, initialName) =>
    set({ editing: { kind: "rename", projectId, nodeId, initialName } }),

  startCreate: (projectId, parentId, parentPath, kind) =>
    set({ editing: { kind, projectId, parentId, parentPath } }),

  cancelEditing: () => set({ editing: null }),

  setClipboard: (clipboard) => set({ clipboard }),

  clearClipboard: () => set({ clipboard: null }),

  setSelected: (selection) => set({ selectedNodeId: selection }),

  clearSelected: () => set({ selectedNodeId: null }),

  setFocused: (focused) => set({ isFocused: focused }),
}));
