/**
 * Workspace Switcher — Sidebar 顶部一行
 *
 * 设计稿规格：
 * - sb-head：padding 10px 12px 8px，border-bottom primary
 * - ws-pick：avatar 18x18（渐变方块前缀）+ name + N projects 副标签 + chev
 * - 整行 hover bg：rgba(255,255,255,.03)
 * - 折叠态下只显示 Layers icon 按钮
 */
import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Layers, ChevronDown } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useProjectStore } from "@/stores/projectStore";
import { WorkspacePicker } from "./WorkspacePicker";

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
}

export function WorkspaceSwitcher({ collapsed }: WorkspaceSwitcherProps) {
  const { t } = useTranslation();
  const currentName = useWorkspaceStore((s) => s.currentName);
  const projects = useProjectStore((s) => s.projects);
  const [pickerOpen, setPickerOpen] = useState(false);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  // 允许其它组件（命令面板）通过事件呼出 picker
  useEffect(() => {
    const handler = () => setPickerOpen(true);
    window.addEventListener("stargazer:open-workspace-picker", handler);
    return () =>
      window.removeEventListener("stargazer:open-workspace-picker", handler);
  }, []);

  const displayName = currentName ?? t("workspace.noWorkspace");

  // 用 workspace 名首字母（最多 2 个）作为 avatar 内容
  const initials = (currentName ?? "★").trim().slice(0, 2).toUpperCase();
  const repoCount = projects.length;

  if (collapsed) {
    return (
      <>
        <button
          className="p-2 rounded-md hover:bg-white/5 transition-colors"
          style={{ color: "var(--sg-text-tertiary)" }}
          onClick={openPicker}
          title={displayName}
        >
          <Layers className="w-5 h-5" />
        </button>
        {pickerOpen && <WorkspacePicker onClose={closePicker} />}
      </>
    );
  }

  return (
    <>
      <button
        className="w-full flex items-center transition-colors select-none"
        style={{
          padding: "10px 6px 10px 12px",
          gap: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        onClick={openPicker}
        title={t("workspace.switchOrOpen")}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {/* 18x18 渐变 avatar — workspace 首字母 */}
        <span
          aria-hidden
          className="flex-shrink-0 inline-flex items-center justify-center"
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            background: "linear-gradient(135deg, #4a9eff, #7b5cff)",
            fontFamily: "var(--sg-font-mono)",
            fontWeight: 700,
            fontSize: 9,
            lineHeight: 1,
            color: "#0a0d1a",
            boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.06) inset",
          }}
        >
          {initials}
        </span>

        {/* name */}
        <span
          className="truncate"
          style={{
            color: currentName ? "var(--sg-text-secondary)" : "var(--sg-text-hint)",
            fontWeight: 500,
            fontSize: 12,
            lineHeight: 1,
            maxWidth: 120,
          }}
        >
          {displayName}
        </span>

        {/* repo count */}
        {currentName && repoCount > 0 && (
          <span
            style={{
              fontFamily: "var(--sg-font-mono)",
              fontSize: 10,
              fontWeight: 500,
              lineHeight: 1,
              color: "var(--sg-text-hint)",
              marginLeft: 4,
            }}
          >
            {repoCount} {repoCount > 1 ? "repos" : "repo"}
          </span>
        )}

        {/* chevron 推到右侧 */}
        <ChevronDown
          className="w-3 h-3 flex-shrink-0"
          style={{ color: "var(--sg-text-hint)", marginLeft: "auto" }}
        />
      </button>
      {pickerOpen && <WorkspacePicker onClose={closePicker} />}
    </>
  );
}
