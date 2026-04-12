import { create } from "zustand";
import type { PanelTab } from "@/types/panel";

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
  /** 关闭 Tab */
  closeTab: (id: string) => void;
  /** 关闭其他 Tab */
  closeOtherTabs: (id: string) => void;
  /** 关闭所有 Tab */
  closeAllTabs: () => void;
  /** 设置活动 Tab */
  setActiveTab: (id: string) => void;
  /** 标记 Tab 为已修改 */
  markDirty: (id: string, dirty: boolean) => void;
  /** 设置 Tab 类型 */
  setTabType: (id: string, type: PanelTab["type"]) => void;
  /** 重新排序 Tab */
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  /** 设置 Diff 统计 */
  setDiffStat: (tabId: string, additions: number, deletions: number) => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  isOpen: false,
  width: 540,
  activeTabId: null,
  tabs: [],
  diffStats: {},

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),

  openPanel: () => set({ isOpen: true }),

  closePanel: () => set({ isOpen: false }),

  setWidth: (width) => set({ width: Math.max(320, Math.min(900, width)) }),

  openTab: (tab) =>
    set((state) => {
      const existingIdx = state.tabs.findIndex((t) => t.id === tab.id);
      if (existingIdx >= 0) {
        // 已存在则合并更新（保留 isDirty 状态，其他字段用新值）
        const newTabs = [...state.tabs];
        const prev = newTabs[existingIdx];
        newTabs[existingIdx] = { ...tab, isDirty: prev.isDirty };
        return { tabs: newTabs, activeTabId: tab.id, isOpen: true };
      }
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
        isOpen: true,
      };
    }),

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

  setActiveTab: (id) => set({ activeTabId: id }),

  markDirty: (id, dirty) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, isDirty: dirty } : t)),
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
}));
