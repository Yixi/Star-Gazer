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
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/stores/canvasStore";
import { usePanelStore } from "@/stores/panelStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export function TitleBar() {
  const { t } = useTranslation();
  const agents = useCanvasStore((s) => s.agents);
  const activeTabId = usePanelStore((s) => s.activeTabId);
  const tabs = usePanelStore((s) => s.tabs);
  const workspaceName = useWorkspaceStore((s) => s.currentName);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  /* 动态标题 */
  const runningCount = agents.filter((a) => a.status === "running").length;
  const agentSummary = agents.length > 0
    ? `${agents.length} agent${agents.length > 1 ? "s" : ""}`
    : "";
  const filePart = activeTab ? ` \u00B7 ${activeTab.title}${activeTab.type === "diff" ? ` ${t("titleBar.diff")}` : ""}` : "";
  const wsPart = workspaceName ? ` \u00B7 ${workspaceName}` : "";
  const title = `Star Gazer${wsPart}${agentSummary ? ` \u2014 ${agentSummary}` : ""}${filePart}`;

  return (
    <header
      className="flex items-center flex-shrink-0 select-none"
      data-tauri-drag-region
      style={{
        padding: '12px 16px',
        background: 'var(--sg-bg-sidebar)',
        borderBottom: '1px solid var(--sg-border-primary)',
        gap: 8,
      }}
    >
      {/* macOS 红绿灯按钮区域预留 */}
      <div className="flex-shrink-0" data-tauri-drag-region style={{ width: 70 }} />

      {/* 标题文字 — 居中 */}
      <div
        className="flex-1 text-center truncate"
        data-tauri-drag-region
        style={{
          fontSize: 12,
          color: 'var(--sg-text-hint)',
          fontWeight: 500,
        }}
      >
        {title}
      </div>

      {/* 右侧操作提示 — button 上不会触发 data-tauri-drag-region */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ gap: 4, fontSize: 11 }}
      >
        <button
          className="transition-colors"
          style={{
            padding: '4px 8px',
            background: 'var(--sg-border-primary)',
            borderRadius: 4,
            color: 'var(--sg-text-tertiary)',
            fontSize: 11,
            cursor: 'pointer',
            border: 'none',
          }}
          onClick={() => {
            const settings = useSettingsStore.getState();
            if (settings.sidebarOpen) {
              settings.toggleSidebar();
            }
            usePanelStore.getState().closePanel();
          }}
          title={t("titleBar.focusMode")}
        >
          Focus
        </button>
        <button
          className="transition-colors"
          style={{
            padding: '4px 8px',
            background: 'var(--sg-border-primary)',
            borderRadius: 4,
            color: 'var(--sg-text-tertiary)',
            fontSize: 11,
            cursor: 'pointer',
            border: 'none',
          }}
        >
          Cmd+K
        </button>
        {runningCount > 0 && (
          <span
            className="flex items-center gap-1 ml-2"
            style={{ color: 'var(--sg-success)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: 'var(--sg-success)',
                animation: 'sg-pulse-dot 1.4s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: 10 }}>
              {runningCount} {t("status.running")}
            </span>
          </span>
        )}
      </div>
    </header>
  );
}
