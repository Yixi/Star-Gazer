/**
 * 侧滑文件审查面板 — 右侧浮动覆盖层
 *
 * 规格：
 * - 默认 800px 宽，可拖拽调整（320-1200px）
 * - 绝对定位浮层，从右侧 slide-in，GPU 加速的 translateX 动画（240ms）
 * - 左缘拖拽握把：向左拖变宽、向右拖变窄
 * - 关闭方式：× 按钮、Esc、Cmd+\、toggle 点击
 */
import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePanelStore } from "@/stores/panelStore";
import { gitFetch } from "@/services/git";
import { TabBar } from "./TabBar";
import { PanelToolbar } from "./PanelToolbar";
import { FileEditor } from "./FileEditor";
import { DiffView } from "./DiffView";
import { MarkdownPreview } from "./MarkdownPreview";
import { CommitFilesView } from "./CommitFilesView";

const DEFAULT_WIDTH = 800;

export function SlidePanel() {
  const { t } = useTranslation();
  const { isOpen, width, activeTabId, tabs, setWidth, closePanel } =
    usePanelStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isResizing = useRef(false);
  const prevOpenRef = useRef(false);

  const togglePanel = usePanelStore((s) => s.togglePanel);

  // 面板打开时 fetch 远程仓库，让 diff/ahead-behind 拿到最新数据
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      const paths = new Set(
        tabs.map((t) => t.projectPath).filter(Boolean) as string[],
      );
      for (const p of paths) {
        gitFetch(p).catch(() => {});
      }
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, tabs]);

  // 快捷键：Esc 关闭面板、Cmd+\ 切换面板开关
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        closePanel();
      }
      if (e.key === "\\" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        togglePanel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closePanel, togglePanel]);

  // 左缘拖拽调整宽度 — 面板右缘固定，向左拖动 → 变宽
  //
  // 双击握把时浏览器会先触发两次 mousedown，两次都会跑到这里。
  // 我们只在第一次 move 超过 3px 阈值后才真正开始改宽度，
  // 这样双击场景里 resize 不会"抖"一下再被 doubleClick 覆盖。
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      let activated = false;

      const handleMove = (me: MouseEvent) => {
        const delta = me.clientX - startX;
        if (!activated) {
          if (Math.abs(delta) < 3) return;
          activated = true;
          isResizing.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }
        // 向左拖（delta 为负） → 宽度增加
        setWidth(startWidth - delta);
      };

      const handleUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        if (activated) {
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        }
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [width, setWidth],
  );

  // 双击恢复默认宽度
  const handleDoubleClick = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
  }, [setWidth]);

  return (
    <div
      className="absolute top-0 right-0 bottom-0 flex"
      style={{
        width,
        // 用 transform 做 GPU 加速 slide-in/out；关闭时整块面板滑出屏幕外
        transform: isOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 240ms cubic-bezier(0.4, 0, 0.2, 1)",
        // 把面板提升到独立的合成层，确保 240ms translateX 吃满 GPU，
        // 避免 Canvas 内部的 agent 卡片重绘波及面板。
        willChange: "transform",
        backfaceVisibility: "hidden",
        zIndex: 20,
        // 关闭时不阻挡 Canvas 的点击（off-screen 时再次保险）
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      {/* 左缘拖拽握把 — 4px 命中区
          设计稿：中间一个 3x32 圆角条，默认 border-divider，hover 变 accent */}
      <div
        className="h-full cursor-col-resize group flex-shrink-0 relative"
        style={{ width: 4 }}
        onMouseDown={handleResizeStart}
        onDoubleClick={handleDoubleClick}
      >
        {/* 静态 1px 分隔线 */}
        <div
          className="absolute top-0 bottom-0 left-0"
          style={{ width: 1, backgroundColor: "var(--sg-border-primary)" }}
        />
        {/* 中间圆角握把 — 默认 border-divider，hover 变 accent */}
        <div
          className="absolute top-1/2 left-1/2 transition-colors"
          style={{
            width: 3,
            height: 32,
            borderRadius: 2,
            transform: "translate(-50%, -50%)",
            backgroundColor: "var(--sg-border-divider)",
          }}
        />
        {/* hover 时把握把变 accent — 借助 group-hover */}
        <div
          className="absolute top-1/2 left-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            width: 3,
            height: 32,
            borderRadius: 2,
            transform: "translate(-50%, -50%)",
            backgroundColor: "var(--sg-accent)",
          }}
        />
      </div>

      {/* 面板内容 */}
      <div
        className="flex flex-col h-full flex-1 min-w-0"
        style={{
          backgroundColor: "var(--sg-bg-canvas)",
          // 左缘 1px 边线 + 向左投射的柔和阴影，让浮层从 Canvas 上"浮起"
          borderLeft: "1px solid var(--sg-border-primary)",
          boxShadow: "-12px 0 32px rgba(0, 0, 0, 0.45)",
        }}
      >
        {/* Tab 栏 */}
        <TabBar />

        {/* 工具栏 */}
        {activeTab && <PanelToolbar tab={activeTab} />}

        {/* 内容区域 — 不设 overflow，由子组件（CodeMirror/DiffView）自行管理滚动 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab ? (
            activeTab.type === "commit-files" ? (
              <CommitFilesView tabId={activeTab.id} />
            ) : activeTab.type === "diff" ? (
              <DiffView filePath={activeTab.filePath} tabId={activeTab.id} />
            ) : activeTab.type === "markdown" ? (
              <MarkdownPreview filePath={activeTab.filePath} />
            ) : (
              <FileEditor filePath={activeTab.filePath} tabId={activeTab.id} />
            )
          ) : (
            <div
              className="flex items-center justify-center h-full text-sm"
              style={{ color: "#6b7280" }}
            >
              {t("panel.noOpenFiles")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
