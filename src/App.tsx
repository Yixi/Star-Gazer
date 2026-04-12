/**
 * Star Gazer - 主布局
 *
 * 布局结构（flex 横向 + 右侧浮动面板）：
 * ┌──────────────────────────────────────────┐
 * │ Sidebar │     Canvas (画布)      ╎ Panel │
 * │ (240px) │     (flex-1)           ╎(800px)│
 * │         │                        ╎浮层   │
 * ├─────────┴────────────────────────┴───────┤
 * │             StatusBar (24px)             │
 * └──────────────────────────────────────────┘
 *
 * 面板为"浮动覆盖层" — 从右侧滑入，悬浮在 Canvas 之上，不抢 flex 空间。
 * 动画用 transform: translateX GPU 加速，240ms cubic-bezier。
 */
import { useEffect } from "react";
import { TitleBar } from "@/components/titlebar/TitleBar";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Canvas } from "@/components/canvas/Canvas";
import { SlidePanel } from "@/components/panel/SlidePanel";
import { StatusBar } from "@/components/statusbar/StatusBar";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useProjectStore } from "@/stores/projectStore";

function App() {
  // 注册全局快捷键（Cmd+W 关闭 Tab、Cmd+S 保存等）
  useGlobalShortcuts();

  // 应用启动时从后端加载已保存的项目列表
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const projects = await invoke<Array<{
          id: string;
          name: string;
          path: string;
          lastOpened: number;
        }>>("list_projects");
        const store = useProjectStore.getState();
        for (const project of projects) {
          store.addProject(project);
        }
        // 如果有项目，自动激活最近使用的
        if (projects.length > 0) {
          const sorted = [...projects].sort((a, b) => b.lastOpened - a.lastOpened);
          store.setActiveProject(sorted[0]);
        }
      } catch (err) {
        console.warn("加载项目列表失败（可能在非 Tauri 环境）:", err);
      }
    };
    loadProjects();
  }, []);
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden dark">
      {/* 应用标题栏 */}
      <TitleBar />

      {/* 主内容区域 - 横向 flex + 右侧浮动面板容器（relative 作为绝对定位的锚） */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 左侧边栏 */}
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>

        {/* 画布主区域 - flex-1 自适应（浮动面板不占用 flex 空间） */}
        <ErrorBoundary name="Canvas">
          <Canvas />
        </ErrorBoundary>

        {/* 侧滑文件审查面板 - 绝对定位浮层，从右侧滑入覆盖在 Canvas 上 */}
        <ErrorBoundary name="SlidePanel">
          <SlidePanel />
        </ErrorBoundary>
      </div>

      {/* 底部状态栏 */}
      <StatusBar />

      {/* 命令面板（浮层） */}
      <CommandPalette />
    </div>
  );
}

export default App;
