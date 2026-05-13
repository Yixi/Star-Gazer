/**
 * 状态栏 — 应用底部固定 24px 高度
 *
 * 设计稿规格：
 * - height: 24px，bg: var(--sg-bg-sidebar)，border-top: var(--sg-border-primary)
 * - font: 500 11px/1 var(--sg-font-mono)，color: var(--sg-text-tertiary)
 * - item 内边距 0 12px，gap 6px，相邻 item 之间 border-right 1px primary
 * - 最后一个 item 没有 border-right，由 margin-left:auto 推到右侧
 *
 * 数据来源：
 * - 当前项目（accent item，前缀色块）
 * - 当前分支 / ahead·behind
 * - agents 颜色 stack + 总数
 * - scope（files / changes / history）
 * - panel 信息（active tab 标题）
 * - workspace 名（兜底 "Star Gazer"）
 * - 语言切换（最右）
 */
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/stores/canvasStore";
import { useProjectStore } from "@/stores/projectStore";
import { usePanelStore } from "@/stores/panelStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { AGENT_COLOR_HEX } from "@/constants/agentColors";
import type { Language } from "@/stores/settingsStore";

const SEP_COLOR = "var(--sg-border-primary)";

export function StatusBar() {
  const { t } = useTranslation();
  const agents = useCanvasStore((s) => s.agents);
  const activeProject = useProjectStore((s) => s.activeProject);
  const viewMode = useProjectStore((s) => s.viewMode);
  const gitBranch = useProjectStore((s) => s.gitBranch);
  const activeProjectGitStatus = useProjectStore((s) =>
    activeProject ? s.gitStatusByProject[activeProject.id] : undefined,
  );
  const activeTabId = usePanelStore((s) => s.activeTabId);
  const tabs = usePanelStore((s) => s.tabs);
  const workspaceName = useWorkspaceStore((s) => s.currentName);

  const ahead = activeProjectGitStatus?.ahead ?? 0;
  const behind = activeProjectGitStatus?.behind ?? 0;
  const activeTab = tabs.find((tb) => tb.id === activeTabId);

  // 项目色 swatch：取第一个 running agent 的色，否则用 accent
  const firstRunningAgent = agents.find((a) => a.status === "running");
  const projectSwatch = firstRunningAgent
    ? AGENT_COLOR_HEX[firstRunningAgent.color]
    : "#4a9eff";

  // agents 头像 stack
  const agentDots = agents.slice(0, 6).map((a) => AGENT_COLOR_HEX[a.color]);

  return (
    <footer
      className="select-none flex-shrink-0"
      style={{
        height: 24,
        display: "flex",
        alignItems: "center",
        background: "var(--sg-bg-sidebar)",
        borderTop: `1px solid var(--sg-border-primary)`,
        fontFamily: "var(--sg-font-mono)",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        color: "var(--sg-text-tertiary)",
      }}
    >
      {/* 1. 项目（accent item） */}
      {activeProject && (
        <Item accent>
          <Swatch color={projectSwatch} />
          {activeProject.name}
        </Item>
      )}

      {/* 2. 分支 · ahead/behind */}
      {gitBranch && (
        <Item>
          <span style={{ fontSize: 12, lineHeight: 1 }}>⎇</span>
          {gitBranch}
          {(ahead > 0 || behind > 0) && (
            <>
              <span style={{ color: SEP_COLOR }}>·</span>
              {ahead > 0 && (
                <span style={{ color: "var(--sg-success)" }}>{ahead} ahead</span>
              )}
              {behind > 0 && (
                <span style={{ color: "var(--sg-warning)" }}>{behind} behind</span>
              )}
            </>
          )}
        </Item>
      )}

      {/* 3. agents 颜色 stack + count */}
      {agents.length > 0 && (
        <Item>
          <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
            {agentDots.map((c, i) => (
              <span
                key={i}
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: c,
                  boxShadow: `0 0 4px ${c}80`,
                }}
              />
            ))}
          </span>
          <span style={{ marginLeft: 2 }}>
            {agents.length} {agents.length > 1 ? "agents" : "agent"}
          </span>
        </Item>
      )}

      {/* 4. scope · {viewMode} */}
      <Item>
        scope <span style={{ color: SEP_COLOR }}>·</span> {viewMode}
      </Item>

      {/* 5. panel · {active tab title} */}
      {activeTab && (
        <Item>
          panel <span style={{ color: SEP_COLOR }}>·</span>{" "}
          {activeTab.type === "diff" ? "diff" : activeTab.type} <span style={{ color: SEP_COLOR }}>·</span>{" "}
          <span style={{ color: "var(--sg-text-secondary)" }}>{activeTab.title}</span>
        </Item>
      )}

      {/* 6. workspace */}
      {workspaceName && (
        <Item>
          workspace <span style={{ color: SEP_COLOR }}>·</span> {workspaceName}
        </Item>
      )}

      {/* 7. 最右：live dot + 语言切换 */}
      <Item last>
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "var(--sg-success)",
            boxShadow: "0 0 6px rgba(34, 197, 94, 0.6)",
          }}
        />
        <span>{t("statusBar.connected") ?? "Connected"}</span>
        <span style={{ color: SEP_COLOR }}>·</span>
        <LanguageToggle />
      </Item>
    </footer>
  );
}

/** 状态栏 item — 通用容器，含分隔 border-right */
function Item({
  children,
  accent,
  last,
}: {
  children: React.ReactNode;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "0 12px",
        height: "100%",
        borderRight: last ? "none" : `1px solid ${SEP_COLOR}`,
        marginLeft: last ? "auto" : undefined,
        color: accent ? "var(--sg-accent)" : undefined,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

/** 8x8 圆角方块色块 */
function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 2,
        background: color,
      }}
    />
  );
}

/** 语言切换 — 中英 toggle */
function LanguageToggle() {
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const toggle = () => {
    const next: Language = language === "zh" ? "en" : "zh";
    setLanguage(next);
  };

  return (
    <button
      onClick={toggle}
      className="transition-colors hover:text-white"
      style={{
        cursor: "pointer",
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        color: "inherit",
        lineHeight: 1,
      }}
      title={language === "zh" ? "Switch to English" : "切换到中文"}
    >
      {language === "zh" ? "EN" : "中"}
    </button>
  );
}
