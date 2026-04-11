/**
 * Star Gazer - 主布局
 *
 * 布局结构（flex 横向）：
 * ┌──────────────────────────────────────────┐
 * │ Sidebar │     Canvas (画布)     │ Panel  │
 * │ (240px) │     (flex-1)          │(540px) │
 * │         │                       │ 推入式 │
 * ├─────────┴───────────────────────┴────────┤
 * │             StatusBar (24px)              │
 * └──────────────────────────────────────────┘
 *
 * 面板打开时推画布到左侧（非覆盖），150ms 动画
 */
import { TitleBar } from "@/components/titlebar/TitleBar";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Canvas } from "@/components/canvas/Canvas";
import { SlidePanel } from "@/components/panel/SlidePanel";
import { StatusBar } from "@/components/statusbar/StatusBar";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden dark">
      {/* 应用标题栏 */}
      <TitleBar />

      {/* 主内容区域 - 横向 flex 布局 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧边栏 */}
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>

        {/* 画布主区域 - flex-1 自适应 */}
        <ErrorBoundary name="Canvas">
          <Canvas />
        </ErrorBoundary>

        {/* 右侧滑文件审查面板 - 推入式布局 */}
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
