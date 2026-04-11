/**
 * 面板工具栏 - 文件操作按钮
 */
import { Save, RotateCcw, GitCompare, X } from "lucide-react";
import { usePanelStore } from "@/stores/panelStore";
import type { PanelTab } from "@/types/panel";

interface PanelToolbarProps {
  tab: PanelTab;
}

export function PanelToolbar({ tab }: PanelToolbarProps) {
  const togglePanel = usePanelStore((s) => s.togglePanel);

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card">
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
          {tab.filePath}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {tab.type === "file" && (
          <>
            <button
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="保存"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="还原"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="查看 Diff"
            >
              <GitCompare className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <button
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          onClick={togglePanel}
          title="关闭面板"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
