import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SettingsState {
  /** 侧边栏宽度 */
  sidebarWidth: number;
  /** 侧边栏是否展开 */
  sidebarOpen: boolean;
  /** 侧边栏折叠宽度 */
  sidebarCollapsedWidth: number;
  /** 编辑器字体大小 */
  editorFontSize: number;
  /** 终端字体大小 */
  terminalFontSize: number;
  /** 主题（暂时只支持暗色） */
  theme: "dark";
  /** Diff 布局模式 */
  diffLayout: "split" | "unified";

  /** 设置侧边栏宽度 */
  setSidebarWidth: (width: number) => void;
  /** 切换侧边栏 */
  toggleSidebar: () => void;
  /** 设置编辑器字体大小 */
  setEditorFontSize: (size: number) => void;
  /** 设置终端字体大小 */
  setTerminalFontSize: (size: number) => void;
  /** 设置 Diff 布局模式 */
  setDiffLayout: (layout: "split" | "unified") => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sidebarWidth: 240,
      sidebarOpen: true,
      sidebarCollapsedWidth: 48,
      editorFontSize: 13,
      terminalFontSize: 13,
      theme: "dark",
      diffLayout: "split",

      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setEditorFontSize: (size) => set({ editorFontSize: size }),
      setTerminalFontSize: (size) => set({ terminalFontSize: size }),
      setDiffLayout: (layout) => set({ diffLayout: layout }),
    }),
    {
      name: "stargazer-settings",
      storage: createJSONStorage(() => localStorage),
      // 只持久化用户偏好字段，避免持久化方法引用
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        sidebarOpen: state.sidebarOpen,
        editorFontSize: state.editorFontSize,
        terminalFontSize: state.terminalFontSize,
        diffLayout: state.diffLayout,
      }),
      version: 1,
    },
  ),
);
