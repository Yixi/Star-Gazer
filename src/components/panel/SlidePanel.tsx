/**
 * 侧滑文件审查面板 - 从右侧推入（非覆盖）
 *
 * 规格：
 * - 默认 540px 宽，可拖拽调整（320-900px）
 * - 打开时推画布到右侧，150ms 平滑动画
 * - 关闭方式：× 按钮、Esc、Cmd+\、toggle 点击
 */
import { useEffect, useRef, useCallback } from "react";
import { usePanelStore } from "@/stores/panelStore";
import { TabBar } from "./TabBar";
import { PanelToolbar } from "./PanelToolbar";
import { FileEditor } from "./FileEditor";
import { DiffView } from "./DiffView";

export function SlidePanel() {
  const { isOpen, width, activeTabId, tabs, setWidth, closePanel } =
    usePanelStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  // 快捷键关闭：Esc, Cmd+\
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        closePanel();
      }
      if (e.key === "\\" && (e.metaKey || e.ctrlKey) && isOpen) {
        e.preventDefault();
        closePanel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closePanel]);

  // 分隔线拖拽调整宽度
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      const startX = e.clientX;
      const startWidth = width;

      const handleMove = (me: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = startX - me.clientX;
        setWidth(startWidth + delta);
      };

      const handleUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [width, setWidth]
  );

  // 双击恢复默认宽度
  const handleDoubleClick = useCallback(() => {
    setWidth(540);
  }, [setWidth]);

  if (!isOpen) return null;

  return (
    <div
      className="flex-shrink-0 h-full flex"
      style={{
        width,
        transition: "width 150ms ease-out",
      }}
    >
      {/* 分隔线 - 可拖拽 */}
      <div
        ref={resizeRef}
        className="w-1 h-full cursor-col-resize group flex-shrink-0 relative"
        style={{ backgroundColor: "#1a1c23" }}
        onMouseDown={handleResizeStart}
        onDoubleClick={handleDoubleClick}
      >
        {/* 悬停高亮 */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "#4a9eff" }}
        />
        {/* 中间握把 */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "#4a9eff" }}
        />
      </div>

      {/* 面板内容 */}
      <div
        className="flex flex-col h-full flex-1 min-w-0"
        style={{
          backgroundColor: "#0f1116",
          borderLeft: "1px solid #1a1c23",
        }}
      >
        {/* Tab 栏 */}
        <TabBar />

        {/* 工具栏 */}
        {activeTab && <PanelToolbar tab={activeTab} />}

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto">
          {activeTab ? (
            activeTab.type === "diff" ? (
              <DiffView filePath={activeTab.filePath} tabId={activeTab.id} />
            ) : (
              <FileEditor filePath={activeTab.filePath} tabId={activeTab.id} />
            )
          ) : (
            <div
              className="flex items-center justify-center h-full text-sm"
              style={{ color: "#6b7280" }}
            >
              没有打开的文件
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
