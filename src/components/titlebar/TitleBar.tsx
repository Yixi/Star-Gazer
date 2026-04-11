/**
 * 应用标题栏 — macOS 风格
 *
 * 设计要点：
 * - 高度 36px，背景 #0d0e13（与 sidebar 一致）
 * - macOS 红绿灯按钮区域预留 70px 左边距
 * - 中央显示标题文字（当前状态摘要）
 * - 右侧操作按钮（命令面板快捷键提示）
 * - 底部 1px 边框分隔
 * - 整个标题栏可拖拽移动窗口（data-tauri-drag-region）
 */
import { useCanvasStore } from "@/stores/canvasStore";
import { usePanelStore } from "@/stores/panelStore";

export function TitleBar() {
  const agents = useCanvasStore((s) => s.agents);
  const activeTabId = usePanelStore((s) => s.activeTabId);
  const tabs = usePanelStore((s) => s.tabs);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  /* 动态标题 */
  const runningCount = agents.filter((a) => a.status === "running").length;
  const agentSummary = agents.length > 0
    ? `${agents.length} agent${agents.length > 1 ? "s" : ""}`
    : "";
  const filePart = activeTab ? ` \u00B7 ${activeTab.title}${activeTab.type === "diff" ? " (diff)" : ""}` : "";
  const title = `Star Gazer${agentSummary ? ` \u2014 ${agentSummary}` : ""}${filePart}`;

  return (
    <header
      className="flex items-center flex-shrink-0 select-none"
      data-tauri-drag-region
      style={{
        height: "var(--sg-titlebar-height, 36px)",
        background: "var(--sg-bg-sidebar, #0d0e13)",
        borderBottom: "1px solid var(--sg-border-primary, #1a1c23)",
      }}
    >
      {/* macOS 红绿灯按钮区域预留 — 原生 decorations 模式下需要 70px 左边距 */}
      <div className="flex-shrink-0" style={{ width: 70 }} />

      {/* 标题文字 — 居中 */}
      <div
        className="flex-1 text-center truncate"
        data-tauri-drag-region
        style={{
          fontSize: "var(--sg-text-base, 12px)",
          color: "var(--sg-text-hint, #6b7280)",
          fontWeight: "var(--sg-weight-medium, 500)",
        }}
      >
        {title}
      </div>

      {/* 右侧操作提示 */}
      <div
        className="flex items-center gap-1 flex-shrink-0 pr-3"
        style={{ fontSize: "var(--sg-text-sm, 11px)" }}
      >
        <kbd
          className="inline-flex items-center justify-center px-1.5 py-0.5 rounded"
          style={{
            background: "var(--sg-bg-card-header, #1a1d26)",
            border: "1px solid var(--sg-border-primary, #1a1c23)",
            color: "var(--sg-text-tertiary, #8b92a3)",
            fontSize: "var(--sg-text-xs, 10px)",
          }}
        >
          Cmd+K
        </kbd>
        {runningCount > 0 && (
          <span
            className="flex items-center gap-1 ml-2"
            style={{ color: "var(--sg-success, #22c55e)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: "var(--sg-success, #22c55e)",
                animation: "sg-pulse-dot 1.4s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: "var(--sg-text-xs, 10px)" }}>
              {runningCount} 运行中
            </span>
          </span>
        )}
      </div>
    </header>
  );
}
