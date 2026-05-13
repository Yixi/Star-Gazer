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
import { X } from "lucide-react";
import { usePanelStore } from "@/stores/panelStore";
import type { PanelTab } from "@/types/panel";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, closeOtherTabs, closeAllTabs, closePanel, reorderTabs, pinTab } =
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
    <div
      className="relative flex items-center flex-shrink-0"
      style={{
        height: 34,
        background: "var(--sg-bg-sidebar)",
        borderBottom: "1px solid var(--sg-border-primary)",
      }}
    >
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
            onDoubleClick={() => pinTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* 右侧渐变 fade — 提示有更多 tab 可滚动 */}
      {showFadeRight && (
        <div
          className="absolute right-9 top-0 bottom-0 w-8 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, transparent, var(--sg-bg-sidebar))",
          }}
        />
      )}

      {/* ⋯ 溢出提示 */}
      {showFadeRight && (
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            height: 34,
            padding: "0 8px",
            color: "var(--sg-text-hint)",
            fontSize: 14,
            borderLeft: "1px solid var(--sg-border-primary)",
            background: "var(--sg-bg-sidebar)",
          }}
        >
          ⋯
        </div>
      )}

      {/* 面板关闭按钮 — 与 tabbar 等高 */}
      <button
        className="flex-shrink-0 flex items-center justify-center transition-colors"
        style={{
          width: 34,
          height: 34,
          background: "var(--sg-bg-sidebar)",
          color: "var(--sg-text-hint)",
          borderLeft: "1px solid var(--sg-border-primary)",
        }}
        onClick={closePanel}
        title="关闭面板 (⌘\\)"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
          e.currentTarget.style.color = "var(--sg-text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--sg-bg-sidebar)";
          e.currentTarget.style.color = "var(--sg-text-hint)";
        }}
      >
        <X style={{ width: 14, height: 14 }} />
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

/** 单个 Tab 项 — 设计稿样式：dot + ic 色方块 + 文件名 + x
 *  - active: bg-canvas + 顶部 1px accent line
 *  - preview: 文件名斜体（secondary 文字色）
 *  - dirty: dot 变黄色 + 发光
 */
function TabItem({
  tab,
  isActive,
  isDragging,
  onClick,
  onDoubleClick,
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
  onDoubleClick: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const isPreview = tab.isPreview === true;
  const ext = (tab.filePath?.split(".").pop() ?? "").toLowerCase();
  // 文件类型 → 12x12 色方块的颜色
  const icColor =
    tab.type === "diff"
      ? "#1a2438" // diff: 偏蓝灰
      : ext === "md" || ext === "mdx"
        ? "#2a2a3a"
        : ext === "css"
          ? "#2a2a3a"
          : ext === "ts" || ext === "tsx"
            ? "#1a2438"
            : ext === "rs"
              ? "#2b1c1c"
              : ext === "json"
                ? "#1d2b1f"
                : "#2a2f3b";

  return (
    <div
      className="group inline-flex items-center cursor-pointer select-none transition-colors relative flex-shrink-0"
      style={{
        height: 34,
        padding: "0 12px",
        gap: 8,
        fontSize: 12,
        color: isActive
          ? "var(--sg-text-primary)"
          : "var(--sg-text-tertiary)",
        background: isActive ? "var(--sg-bg-canvas)" : "transparent",
        borderRight: "1px solid var(--sg-border-primary)",
        opacity: isDragging ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseDown={onMouseDown}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      title={isPreview ? "双击固定此 tab" : tab.filePath}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.025)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
    >
      {/* 激活时顶部 1px accent 线 */}
      {isActive && (
        <span
          aria-hidden
          className="absolute top-0 left-0 right-0"
          style={{ height: 1, background: "var(--sg-accent)" }}
        />
      )}

      {/* 6x6 状态 dot — dirty 时变黄并发光 */}
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: tab.isDirty
            ? "var(--sg-warning)"
            : "var(--sg-text-hint)",
          boxShadow: tab.isDirty ? "0 0 6px rgba(254, 188, 46, 0.6)" : "none",
          flexShrink: 0,
        }}
      />

      {/* 12x12 文件类型色方块 — 替代 lucide icon */}
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          borderRadius: 2,
          background: icColor,
          flexShrink: 0,
        }}
      />

      {/* 文件名 — preview 状态斜体 + secondary 色 */}
      <span
        className="truncate max-w-[160px]"
        style={{
          fontStyle: isPreview ? "italic" : "normal",
          color: isPreview && !isActive ? "var(--sg-text-secondary)" : undefined,
        }}
      >
        {tab.title}
      </span>

      {/* 关闭按钮 — 14x14 hover 高亮
          非 active tab：默认隐藏，group-hover 时半透明显示；
          active tab：默认 0.55 透明度，self-hover 时全显示 */}
      <button
        type="button"
        className={`flex items-center justify-center transition-all flex-shrink-0 hover:!opacity-100 ${
          isActive
            ? "opacity-[0.55]"
            : "opacity-0 group-hover:opacity-[0.55]"
        }`}
        style={{
          marginLeft: 4,
          width: 14,
          height: 14,
          borderRadius: 3,
          color: "var(--sg-text-hint)",
          background: "transparent",
          border: "none",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <X style={{ width: 11, height: 11 }} />
      </button>
    </div>
  );
}
