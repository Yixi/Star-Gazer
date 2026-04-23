/**
 * 全局快捷键 Hook
 *
 * 注册 PRD 中定义的全局快捷键：
 * - Cmd+W: 关闭当前 Tab
 * - Cmd+S: 保存当前文件（由 FileEditor 的 Monaco command 处理，此处仅作为 fallback 防止浏览器默认行为）
 * - Cmd+F: 搜索（暂时阻止默认行为，后续可集成搜索功能）
 */
import { useEffect } from "react";
import { usePanelStore } from "@/stores/panelStore";

export function useGlobalShortcuts() {
  const closeTab = usePanelStore((s) => s.closeTab);
  const activeTabId = usePanelStore((s) => s.activeTabId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd+W: 关闭当前活动 Tab
      if (e.key === "w" && isMod) {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }

      // Cmd+S: 阻止浏览器默认保存行为（实际保存由 FileEditor 的 Monaco 处理）
      if (e.key === "s" && isMod) {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, closeTab]);
}
