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
import { TitleBar } from "@/components/titlebar/TitleBar";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Canvas } from "@/components/canvas/Canvas";
import { SlidePanel } from "@/components/panel/SlidePanel";
import { StatusBar } from "@/components/statusbar/StatusBar";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useWorkspaceBootstrap } from "@/hooks/useWorkspaceBootstrap";
import { useWorkspaceAutosave } from "@/hooks/useWorkspaceAutosave";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { WorkspacePicker } from "@/components/workspace/WorkspacePicker";

function App() {
  // 注册全局快捷键（Cmd+W 关闭 Tab、Cmd+S 保存等）
  useGlobalShortcuts();

  // 启动时加载 workspace 文件并分发到各 store（严格只跑一次）
  useWorkspaceBootstrap();
  // 订阅 store 变更，500ms 防抖写回 workspace 文件
  useWorkspaceAutosave();

  const isReady = useWorkspaceStore((s) => s.isReady);
  const currentPath = useWorkspaceStore((s) => s.currentPath);

  if (!isReady) {
    return (
      <div
        className="flex items-center justify-center h-screen w-screen dark"
        style={{ backgroundColor: "var(--sg-bg-sidebar)", color: "#6b7280", fontSize: 12 }}
      >
        Loading workspace…
      </div>
    );
  }

  // 没有绑定 workspace —— 空状态 picker（不可关闭）
  if (!currentPath) {
    return (
      <div
        className="h-screen w-screen dark"
        style={{ backgroundColor: "var(--sg-bg-sidebar)" }}
      >
        <WorkspacePicker closable={false} />
      </div>
    );
  }

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
