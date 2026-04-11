/**
 * 面板 Tab 栏 - 36px 高
 *
 * 功能：
 * - 无限 tab，超出横向滚动 + 渐变 fade + ... 省略号
 * - Tab 构成：agent 颜色文件图标 + 文件名 + 模式徽章(diff/file) + x 关闭
 * - Tab 状态：未激活暗色、悬停提亮、激活时顶部 2px 蓝色边条
 * - 右键菜单：Close / Close Others / Close All
 * - 拖拽排序
 */
import { useState, useRef, useEffect } from "react";
import { X, File, GitCompare } from "lucide-react";
import { usePanelStore } from "@/stores/panelStore";
import type { PanelTab } from "@/types/panel";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, closeOtherTabs, closeAllTabs, closePanel, reorderTabs } =
    usePanelStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFadeRight, setShowFadeRight] = useState(false);

  // 拖拽排序状态
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // 检测是否需要右侧 fade
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setShowFadeRight(el.scrollWidth > el.clientWidth && el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    check();
    el.addEventListener("scroll", check);
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      observer.disconnect();
    };
  }, [tabs.length]);

  // 点击外部关闭上下文菜单
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  if (tabs.length === 0) return null;

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  // 中键点击关闭
  const handleMouseDown = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  };

  // 拖拽排序
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      reorderTabs(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  return (
    <div className="relative flex items-center flex-shrink-0" style={{ height: 36, borderBottom: "1px solid #1a1c23" }}>
      {/* Tab 滚动容器 */}
      <div
        ref={scrollRef}
        className="flex items-stretch flex-1 overflow-x-auto overflow-y-hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTabId === tab.id}
            isDragging={dragIndex === index}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* 右侧渐变 fade + 省略号 */}
      {showFadeRight && (
        <div
          className="absolute right-8 top-0 bottom-0 w-8 pointer-events-none"
          style={{
            background: "linear-gradient(to right, transparent, #0f1116)",
          }}
        />
      )}

      {/* 面板关闭按钮 */}
      <button
        className="flex-shrink-0 p-2 hover:bg-white/5 transition-colors"
        style={{ color: "#8b92a3" }}
        onClick={closePanel}
        title="关闭面板 (⌘\\)"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: "#1a1c23",
            border: "1px solid #2a2d36",
          }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
            style={{ color: "#e4e6eb" }}
            onClick={() => { closeTab(contextMenu.tabId); setContextMenu(null); }}
          >
            关闭
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
            style={{ color: "#e4e6eb" }}
            onClick={() => { closeOtherTabs(contextMenu.tabId); setContextMenu(null); }}
          >
            关闭其他
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
            style={{ color: "#e4e6eb" }}
            onClick={() => { closeAllTabs(); setContextMenu(null); }}
          >
            关闭全部
          </button>
        </div>
      )}
    </div>
  );
}

/** 单个 Tab 项 */
function TabItem({
  tab,
  isActive,
  isDragging,
  onClick,
  onClose,
  onContextMenu,
  onMouseDown,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  tab: PanelTab;
  isActive: boolean;
  isDragging: boolean;
  onClick: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 text-xs cursor-pointer select-none transition-colors relative flex-shrink-0"
      style={{
        height: 36,
        backgroundColor: isActive ? "#0f1116" : "transparent",
        color: isActive ? "#e4e6eb" : "#8b92a3",
        borderRight: "1px solid #1a1c23",
        opacity: isDragging ? 0.5 : 1,
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseDown={onMouseDown}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {/* 激活时顶部 2px 蓝色边条 */}
      {isActive && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: "#4a9eff" }}
        />
      )}

      {/* 文件图标 */}
      {tab.type === "diff" ? (
        <GitCompare className="w-3 h-3 flex-shrink-0" style={{ color: "#4a9eff" }} />
      ) : (
        <File className="w-3 h-3 flex-shrink-0" />
      )}

      {/* dirty 标记 */}
      {tab.isDirty && (
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#ff8c42" }} />
      )}

      {/* 文件名 */}
      <span className="truncate max-w-[120px]">{tab.title}</span>

      {/* 模式徽章 */}
      <span
        className="px-1 py-0.5 rounded text-[9px] uppercase flex-shrink-0"
        style={{
          backgroundColor: tab.type === "diff" ? "rgba(74, 158, 255, 0.15)" : "rgba(139, 146, 163, 0.1)",
          color: tab.type === "diff" ? "#4a9eff" : "#8b92a3",
        }}
      >
        {tab.type}
      </span>

      {/* 关闭按钮 */}
      <button
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all ml-0.5 flex-shrink-0"
        style={{ color: "#8b92a3", opacity: isActive ? 0.7 : 0 }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = isActive ? "0.7" : "0"; }}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
