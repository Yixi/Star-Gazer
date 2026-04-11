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

  /** 切换面板显示 */
  togglePanel: () => void;
  /** 设置面板宽度 */
  setWidth: (width: number) => void;
  /** 打开文件 Tab */
  openTab: (tab: PanelTab) => void;
  /** 关闭 Tab */
  closeTab: (id: string) => void;
  /** 设置活动 Tab */
  setActiveTab: (id: string) => void;
  /** 标记 Tab 为已修改 */
  markDirty: (id: string, dirty: boolean) => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  isOpen: false,
  width: 540,
  activeTabId: null,
  tabs: [],

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),

  setWidth: (width) => set({ width }),

  openTab: (tab) =>
    set((state) => {
      const exists = state.tabs.find((t) => t.id === tab.id);
      if (exists) {
        return { activeTabId: tab.id, isOpen: true };
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

  setActiveTab: (id) => set({ activeTabId: id }),

  markDirty: (id, dirty) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, isDirty: dirty } : t)),
    })),
}));
