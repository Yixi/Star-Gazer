/**
 * 面板 Tab 栏
 */
import { X } from "lucide-react";
import { usePanelStore } from "@/stores/panelStore";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = usePanelStore();

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border bg-card overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer border-r border-border transition-colors ${
            activeTabId === tab.id
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="truncate max-w-[120px]">
            {tab.isDirty && <span className="text-agent-orange mr-1">*</span>}
            {tab.title}
          </span>
          <button
            className="ml-1 p-0.5 rounded hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
