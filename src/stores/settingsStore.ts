import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import i18n from "@/lib/i18n";

export type Language = "zh" | "en";

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
  /** AgentPicker 上次使用的项目 ID（跨会话记忆） */
  lastAgentProjectId: string | null;
  /** 界面语言 */
  language: Language;

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
  /** 记录 AgentPicker 最近一次选中的项目 */
  setLastAgentProjectId: (id: string | null) => void;
  /** 切换界面语言 */
  setLanguage: (lang: Language) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      sidebarWidth: 264,
      sidebarOpen: true,
      sidebarCollapsedWidth: 48,
      editorFontSize: 13,
      terminalFontSize: 13,
      theme: "dark",
      diffLayout: "split",
      lastAgentProjectId: null,
      language: "zh",

      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setEditorFontSize: (size) => set({ editorFontSize: size }),
      setTerminalFontSize: (size) => set({ terminalFontSize: size }),
      setDiffLayout: (layout) => set({ diffLayout: layout }),
      setLastAgentProjectId: (id) => set({ lastAgentProjectId: id }),
      setLanguage: (lang) => {
        i18n.changeLanguage(lang);
        set({ language: lang });
      },
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
        lastAgentProjectId: state.lastAgentProjectId,
        language: state.language,
      }),
      version: 1,
    },
  ),
);
