/**
 * Star Gazer - 主布局
 *
 * 布局结构：
 * ┌──────────────────────────────────────────┐
 * │ Sidebar │     Canvas (画布)     │ Panel  │
 * │ (240px) │                       │(540px) │
 * │         │                       │ 侧滑   │
 * ├─────────┴───────────────────────┴────────┤
 * │             StatusBar (24px)              │
 * └──────────────────────────────────────────┘
 */
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Canvas } from "@/components/canvas/Canvas";
import { SlidePanel } from "@/components/panel/SlidePanel";
import { StatusBar } from "@/components/statusbar/StatusBar";
import { CommandPalette } from "@/components/command-palette/CommandPalette";

function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden dark">
      {/* 主内容区域 */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* 左侧边栏 */}
        <Sidebar />

        {/* 画布主区域 */}
        <Canvas />

        {/* 右侧滑文件审查面板 */}
        <SlidePanel />
      </div>

      {/* 底部状态栏 */}
      <StatusBar />

      {/* 命令面板（浮层） */}
      <CommandPalette />
    </div>
  );
}

export default App;
