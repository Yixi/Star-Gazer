/**
 * 侧滑文件审查面板 - 从右侧滑入
 * 宽度 540px，包含 Tab 栏、工具栏和内容区域
 */
import { usePanelStore } from "@/stores/panelStore";
import { TabBar } from "./TabBar";
import { PanelToolbar } from "./PanelToolbar";
import { FileEditor } from "./FileEditor";
import { DiffView } from "./DiffView";

export function SlidePanel() {
  const { isOpen, width, activeTabId, tabs } = usePanelStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div
      className={`absolute right-0 top-0 h-full border-l border-border bg-background z-20 transition-transform duration-200 ease-in-out ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ width }}
    >
      <div className="flex flex-col h-full">
        {/* Tab 栏 */}
        <TabBar />

        {/* 工具栏 */}
        {activeTab && <PanelToolbar tab={activeTab} />}

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto">
          {activeTab ? (
            activeTab.type === "diff" ? (
              <DiffView filePath={activeTab.filePath} />
            ) : (
              <FileEditor filePath={activeTab.filePath} />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              没有打开的文件
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
