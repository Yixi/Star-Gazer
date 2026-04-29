import { create } from "zustand";
import type { PanelTab } from "@/types/panel";
import type { WorkspacePanelSnapshot } from "@/types/workspace";

interface PanelState {
  /** 面板是否展开 */
  isOpen: boolean;
  /** 面板宽度 */
  width: number;
  /** 当前激活的 Tab ID */
  activeTabId: string | null;
  /** 所有 Tab */
  tabs: PanelTab[];
  /** Diff 统计信息 (tabId -> { additions, deletions }) */
  diffStats: Record<string, { additions: number; deletions: number }>;

  /** 切换面板显示 */
  togglePanel: () => void;
  /** 打开面板 */
  openPanel: () => void;
  /** 关闭面板 */
  closePanel: () => void;
  /** 设置面板宽度 */
  setWidth: (width: number) => void;
  /** 打开文件 Tab */
  openTab: (tab: PanelTab) => void;
  /** 把 preview tab 升级为 permanent */
  pinTab: (id: string) => void;
  /** 关闭 Tab */
  closeTab: (id: string) => void;
  /** 关闭其他 Tab */
  closeOtherTabs: (id: string) => void;
  /** 关闭所有 Tab */
  closeAllTabs: () => void;
  /**
   * 文件被重命名/移动后同步 Tab — 保留 isDirty / isPreview / type 等运行态，
   * 只换 id（绝对路径）、filePath、标题。可选 newProjectPath 用于跨项目移动。
   * 若旧 id 不存在或新 id 已存在则跳过（避免 id 冲突）。
   */
  updateTabPath: (
    oldId: string,
    newId: string,
    newProjectPath?: string,
  ) => void;
  /**
   * 关闭某目录（绝对路径）下的所有 Tab — 用于删除目录前批量清理。
   * 路径必须以 "/" 结尾或精确匹配，避免误命中前缀相同的兄弟路径。
   */
  closeTabsUnderPath: (absPath: string) => void;
  /** 设置活动 Tab */
  setActiveTab: (id: string) => void;
  /** 标记 Tab 为已修改（dirty 时自动 pin，脱离 preview 状态） */
  markDirty: (id: string, dirty: boolean) => void;
  /** 设置 Tab 类型 */
  setTabType: (id: string, type: PanelTab["type"]) => void;
  /** 重新排序 Tab */
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  /** 设置 Diff 统计 */
  setDiffStat: (tabId: string, additions: number, deletions: number) => void;

  /** 从 workspace 文件快照批量替换面板状态 */
  hydrateFromWorkspace: (snapshot: WorkspacePanelSnapshot) => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  isOpen: false,
  width: 800,
  activeTabId: null,
  tabs: [],
  diffStats: {},

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),

  openPanel: () => set({ isOpen: true }),

  closePanel: () => set({ isOpen: false }),

  setWidth: (width) => set({ width: Math.max(320, Math.min(1200, width)) }),

  openTab: (tab) =>
    set((state) => {
      const existingIdx = state.tabs.findIndex((t) => t.id === tab.id);

      // Case A: Tab 已存在 → 合并更新
      // - 保留 isDirty 状态
      // - 已 pin 的不会退回 preview；都是 preview 时保持 preview
      if (existingIdx >= 0) {
        const newTabs = [...state.tabs];
        const prev = newTabs[existingIdx];
        newTabs[existingIdx] = {
          ...tab,
          isDirty: prev.isDirty,
          isPreview: prev.isPreview === false ? false : tab.isPreview ?? false,
        };
        return { tabs: newTabs, activeTabId: tab.id, isOpen: true };
      }

      // Case B: 新 tab 是 preview 且已有一个 preview → 替换同一 slot
      // 这是 VSCode 风格的关键：快速浏览多个文件时 preview tab 不会无限增长
      if (tab.isPreview) {
        const previewIdx = state.tabs.findIndex((t) => t.isPreview);
        if (previewIdx >= 0) {
          const newTabs = [...state.tabs];
          newTabs[previewIdx] = { ...tab, isPreview: true };
          return { tabs: newTabs, activeTabId: tab.id, isOpen: true };
        }
      }

      // Case C: 新 tab，追加到末尾
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
        isOpen: true,
      };
    }),

  pinTab: (id) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, isPreview: false } : t,
      ),
    })),

  closeTab: (id) =>
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      const newActiveId =
        state.activeTabId === id
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].id
            : null
          : state.activeTabId;
      return {
        tabs: newTabs,
        activeTabId: newActiveId,
        isOpen: newTabs.length > 0,
      };
    }),

  closeOtherTabs: (id) =>
    set((state) => ({
      tabs: state.tabs.filter((t) => t.id === id),
      activeTabId: id,
    })),

  closeAllTabs: () =>
    set({ tabs: [], activeTabId: null, isOpen: false }),

  updateTabPath: (oldId, newId, newProjectPath) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === oldId);
      if (idx < 0) return state;
      // 目标 id 已被占用 —— 跳过避免 id 冲突
      if (oldId !== newId && state.tabs.some((t) => t.id === newId)) {
        return state;
      }
      const old = state.tabs[idx];
      const newTabs = [...state.tabs];
      const title = newId.split("/").pop() || newId;
      newTabs[idx] = {
        ...old,
        id: newId,
        filePath: newId,
        title,
        projectPath: newProjectPath ?? old.projectPath,
      };
      // 同步迁移 diffStats key
      let diffStats = state.diffStats;
      if (state.diffStats[oldId]) {
        const { [oldId]: stat, ...rest } = state.diffStats;
        diffStats = { ...rest, [newId]: stat };
      }
      return {
        tabs: newTabs,
        diffStats,
        activeTabId: state.activeTabId === oldId ? newId : state.activeTabId,
      };
    }),

  closeTabsUnderPath: (absPath) =>
    set((state) => {
      const prefix = absPath.endsWith("/") ? absPath : absPath + "/";
      const survives = (id: string) => id !== absPath && !id.startsWith(prefix);
      const newTabs = state.tabs.filter((t) => survives(t.id));
      if (newTabs.length === state.tabs.length) return state;
      const newActiveId =
        state.activeTabId && !survives(state.activeTabId)
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].id
            : null
          : state.activeTabId;
      return {
        tabs: newTabs,
        activeTabId: newActiveId,
        isOpen: newTabs.length > 0 ? state.isOpen : false,
      };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  markDirty: (id, dirty) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? // 编辑时自动 pin：脱离 preview 状态
            { ...t, isDirty: dirty, isPreview: dirty ? false : t.isPreview }
          : t,
      ),
    })),

  setTabType: (id, type) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, type } : t)),
    })),

  reorderTabs: (fromIndex, toIndex) =>
    set((state) => {
      const newTabs = [...state.tabs];
      const [removed] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, removed);
      return { tabs: newTabs };
    }),

  setDiffStat: (tabId, additions, deletions) =>
    set((state) => ({
      diffStats: { ...state.diffStats, [tabId]: { additions, deletions } },
    })),

  hydrateFromWorkspace: (snapshot) =>
    set({
      tabs: snapshot.tabs,
      activeTabId: snapshot.activeTabId,
      isOpen: snapshot.isOpen,
      width: Math.max(320, Math.min(1200, snapshot.width || 800)),
      diffStats: {},
    }),
}));
