/**
 * Workspace store
 *
 * 维护当前窗口绑定的 workspace 元数据：路径、名称、hydrate 状态、recent 列表。
 * 实际的 loadWorkspace / applyToStores 逻辑在 useWorkspaceBootstrap 里，
 * 避免 workspaceStore 依赖其它 store 造成循环。
 */
import { create } from "zustand";
import type { RecentEntry, RecentWorkspaces } from "@/types/workspace";

interface WorkspaceState {
  /** 当前窗口绑定的 workspace 文件路径；未绑定为 null */
  currentPath: string | null;
  /** 当前 workspace 的显示名 */
  currentName: string | null;
  /**
   * hydrate 中 —— load 期间必须屏蔽 autosave，防止把空 store 回写成
   * workspace 文件内容。bootstrap 的 beginHydrate/endHydrate 配对管理。
   */
  isHydrating: boolean;
  /** 首次 bootstrap 完成前 UI 渲染 loading，避免空组件挂载 */
  isReady: boolean;
  /** 最近打开过的 workspace 列表 */
  recent: RecentEntry[];
  /** 默认恢复的 workspace 路径（最近一次使用的） */
  lastOpenedPath: string | null;

  beginHydrate: () => void;
  endHydrate: () => void;
  setCurrentWorkspace: (path: string, name: string) => void;
  clearCurrentWorkspace: () => void;
  setRecent: (recent: RecentWorkspaces) => void;
  markReady: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  currentPath: null,
  currentName: null,
  isHydrating: false,
  isReady: false,
  recent: [],
  lastOpenedPath: null,

  beginHydrate: () => set({ isHydrating: true }),
  endHydrate: () => set({ isHydrating: false }),

  setCurrentWorkspace: (path, name) =>
    set({ currentPath: path, currentName: name }),

  clearCurrentWorkspace: () =>
    set({ currentPath: null, currentName: null }),

  setRecent: (recent) =>
    set({
      recent: recent.recent,
      lastOpenedPath: recent.lastOpenedPath,
    }),

  markReady: () => set({ isReady: true }),
}));
