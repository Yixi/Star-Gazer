/**
 * 应用标题栏 — macOS 风格
 *
 * 设计稿规格：
 * - 高度 36px，padding 0 12px
 * - 三列 grid：[lights 占位 | title 居中 | right chip 组]
 * - 渐变背景：linear-gradient(180deg, #101218 0%, #0a0b0f 100%)
 * - 中间标题分两行：
 *     主标题 "Star Gazer"（12.5px / secondary / weight 500）
 *     副标题 = live dot + workspace · agents · branch · ahead（mono 10px / hint）
 * - 右侧 chip：22px 高，圆角 5px，边框 + bg-elevated，内嵌 .k 键盘提示
 * - 整条 titlebar 是 tauri drag region；chip 按钮区域 no-drag
 */
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/stores/canvasStore";
import { usePanelStore } from "@/stores/panelStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useProjectStore } from "@/stores/projectStore";

export function TitleBar() {
  const { t } = useTranslation();
  const agents = useCanvasStore((s) => s.agents);
  const workspaceName = useWorkspaceStore((s) => s.currentName);
  const activeProject = useProjectStore((s) => s.activeProject);
  const gitBranch = useProjectStore((s) => s.gitBranch);
  const activeProjectGitStatus = useProjectStore((s) =>
    activeProject ? s.gitStatusByProject[activeProject.id] : undefined,
  );

  const runningCount = agents.filter((a) => a.status === "running").length;
  const ahead = activeProjectGitStatus?.ahead ?? 0;

  // 副标题片段：workspace · agents · branch · ahead
  const subParts: string[] = [];
  if (workspaceName) subParts.push(workspaceName);
  if (agents.length > 0)
    subParts.push(`${agents.length} ${agents.length > 1 ? "agents" : "agent"}`);
  if (gitBranch) subParts.push(gitBranch);
  if (ahead > 0) subParts.push(`${ahead} ahead`);

  return (
    <header
      className="flex-shrink-0 select-none relative"
      data-tauri-drag-region
      style={{
        height: 36,
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "0 12px",
        background: "linear-gradient(180deg, #1a2236 0%, #131a2c 100%)",
        borderBottom: "1px solid var(--sg-border-primary)",
      }}
    >
      {/* 左：macOS 红绿灯系统按钮占位 — Tauri 会自动渲染真实按钮 */}
      <div data-tauri-drag-region style={{ width: 78, height: "100%" }} />

      {/* 中：两行标题 */}
      <div
        data-tauri-drag-region
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          lineHeight: 1.1,
          minWidth: 280,
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            color: "var(--sg-text-secondary)",
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}
        >
          Star Gazer
        </div>
        {subParts.length > 0 && (
          <div
            style={{
              fontFamily: "var(--sg-font-mono)",
              fontSize: 10,
              color: "var(--sg-text-hint)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--sg-success)",
                boxShadow: "0 0 6px rgba(34, 197, 94, 0.6)",
                animation: agents.length > 0 ? "sg-breathe 3s ease-in-out infinite" : undefined,
              }}
            />
            <span>{subParts.join(" · ")}</span>
          </div>
        )}
      </div>

      {/* 右：chip 组 — button 在 drag region 内仍可点击；不需要额外属性 */}
      <div
        className="flex items-center justify-end"
        style={{ gap: 6 }}
      >
        <Chip
          onClick={() => {
            // 触发命令面板（通过自定义事件）
            window.dispatchEvent(new CustomEvent("stargazer:open-command-palette"));
          }}
          title={t("titleBar.search") ?? "Search & commands"}
        >
          <span style={{ fontFamily: "var(--sg-font-mono)", fontSize: 12 }}>⌕</span>
          <span>Search & commands</span>
          <Kbd>⌘K</Kbd>
        </Chip>

        <Chip
          onClick={() => {
            const settings = useSettingsStore.getState();
            if (settings.sidebarOpen) settings.toggleSidebar();
            usePanelStore.getState().closePanel();
          }}
          title={t("titleBar.focusMode") ?? "Focus mode"}
        >
          Focus
        </Chip>

        {runningCount > 0 && (
          <Chip accent title={`${runningCount} agents running`}>
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "currentColor",
                boxShadow: "0 0 6px currentColor",
                display: "inline-block",
              }}
            />
            <span>
              {runningCount} {t("status.running") ?? "running"}
            </span>
          </Chip>
        )}
      </div>
    </header>
  );
}

/** TitleBar 右侧 chip — 22px 高，圆角 5，边框 + bg-elevated */
function Chip({
  children,
  onClick,
  title,
  accent,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center transition-colors"
      style={{
        height: 22,
        padding: "0 9px",
        gap: 6,
        fontFamily: "var(--sg-font-ui)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        color: accent ? "var(--sg-accent)" : "var(--sg-text-secondary)",
        background: accent
          ? "var(--sg-accent-muted)"
          : "var(--sg-bg-elevated)",
        border: `1px solid ${accent ? "rgba(74,158,255,0.3)" : "var(--sg-border-secondary)"}`,
        borderRadius: 5,
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={(e) => {
        if (accent) return;
        e.currentTarget.style.borderColor = "var(--sg-border-divider)";
        e.currentTarget.style.color = "var(--sg-text-primary)";
      }}
      onMouseLeave={(e) => {
        if (accent) return;
        e.currentTarget.style.borderColor = "var(--sg-border-secondary)";
        e.currentTarget.style.color = "var(--sg-text-secondary)";
      }}
    >
      {children}
    </button>
  );
}

/** 键盘快捷键提示 — chip 内的次级标签 */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--sg-font-mono)",
        fontSize: 9.5,
        fontWeight: 500,
        lineHeight: 1,
        color: "var(--sg-text-hint)",
        padding: "2px 4px",
        borderRadius: 3,
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid var(--sg-border-secondary)",
      }}
    >
      {children}
    </span>
  );
}
