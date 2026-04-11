import { create } from "zustand";

interface SettingsState {
  /** 侧边栏宽度 */
  sidebarWidth: number;
  /** 侧边栏是否展开 */
  sidebarOpen: boolean;
  /** 编辑器字体大小 */
  editorFontSize: number;
  /** 终端字体大小 */
  terminalFontSize: number;
  /** 主题（暂时只支持暗色） */
  theme: "dark";

  /** 设置侧边栏宽度 */
  setSidebarWidth: (width: number) => void;
  /** 切换侧边栏 */
  toggleSidebar: () => void;
  /** 设置编辑器字体大小 */
  setEditorFontSize: (size: number) => void;
  /** 设置终端字体大小 */
  setTerminalFontSize: (size: number) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  sidebarWidth: 240,
  sidebarOpen: true,
  editorFontSize: 13,
  terminalFontSize: 13,
  theme: "dark",

  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setEditorFontSize: (size) => set({ editorFontSize: size }),
  setTerminalFontSize: (size) => set({ terminalFontSize: size }),
}));
