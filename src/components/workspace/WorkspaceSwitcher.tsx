/**
 * Workspace Switcher —— Sidebar 顶部一行，显示当前 workspace 名
 *
 * 点击打开 WorkspacePicker（模态）。
 * 折叠模式只显示一个 Layers 图标按钮。
 */
import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Layers, ChevronDown } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { WorkspacePicker } from "./WorkspacePicker";

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
}

export function WorkspaceSwitcher({ collapsed }: WorkspaceSwitcherProps) {
  const { t } = useTranslation();
  const currentName = useWorkspaceStore((s) => s.currentName);
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

  if (collapsed) {
    return (
      <>
        <button
          className="p-2 rounded-md hover:bg-white/5 transition-colors"
          style={{ color: "#8b92a3" }}
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
        className="w-full flex items-center gap-2 select-none transition-colors hover:bg-white/5"
        style={{
          height: 28,
          padding: "0 12px",
          backgroundColor: "#0b0c11",
          borderBottom: "1px solid #161820",
          fontSize: 11,
        }}
        onClick={openPicker}
        title={t("workspace.switchOrOpen")}
      >
        <Layers
          className="w-3.5 h-3.5 flex-shrink-0"
          style={{ color: currentName ? "#4a9eff" : "#6b7280" }}
        />
        <span
          className="flex-1 text-left truncate"
          style={{
            color: currentName ? "#e4e6eb" : "#6b7280",
            fontWeight: 600,
            letterSpacing: "0.2px",
          }}
        >
          {displayName}
        </span>
        <ChevronDown
          className="w-3 h-3 flex-shrink-0"
          style={{ color: "#6b7280" }}
        />
      </button>
      {pickerOpen && <WorkspacePicker onClose={closePicker} />}
    </>
  );
}
