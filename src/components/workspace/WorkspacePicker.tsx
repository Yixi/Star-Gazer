/**
 * Workspace Picker - 打开 / 新建 / 最近列表
 *
 * 三种触发场景：
 *   1. 空状态（首次启动没 workspace） —— 没有关闭按钮，不可 Esc 关闭
 *   2. 从 Command Palette / Switcher 触发 —— 有关闭按钮，Esc 可关闭
 *   3. Recent 列表项点击即加载
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { X, Plus, FolderOpen, Layers, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import * as workspaceService from "@/services/workspace";
import type { RecentEntry } from "@/types/workspace";

interface WorkspacePickerProps {
  /** 是否可关闭（空状态下为 false，不展示关闭按钮且禁用 Esc） */
  closable?: boolean;
  onClose?: () => void;
}

const SGW_FILTERS = [
  { name: "Star Gazer Workspace", extensions: ["sgw"] },
];

export function WorkspacePicker({ closable = true, onClose }: WorkspacePickerProps) {
  const { t } = useTranslation();
  const recent = useWorkspaceStore((s) => s.recent);
  const setRecent = useWorkspaceStore((s) => s.setRecent);
  const [busy, setBusy] = useState(false);

  const refreshRecent = useCallback(async () => {
    try {
      const r = await workspaceService.listRecentWorkspaces();
      setRecent(r);
    } catch (err) {
      console.warn("listRecentWorkspaces failed:", err);
    }
  }, [setRecent]);

  // 进场刷新一次 recent
  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  // Esc 关闭
  useEffect(() => {
    if (!closable) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [closable, onClose]);

  const handleNew = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const selected = await save({
        title: t("workspace.newDialogTitle"),
        defaultPath: "workspace.sgw",
        filters: SGW_FILTERS,
      });
      if (!selected) return;
      // 从文件名派生默认名
      const fileName =
        selected.split("/").pop() ?? selected.split("\\").pop() ?? "workspace";
      const name = fileName.replace(/\.sgw$/i, "") || "Workspace";
      await workspaceService.createWorkspaceFile(selected, name);
      await workspaceService.openWorkspaceInWindow(selected);
      onClose?.();
    } catch (err) {
      console.error("新建 workspace 失败:", err);
    } finally {
      setBusy(false);
    }
  }, [busy, onClose]);

  const handleOpen = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        title: t("workspace.openDialogTitle"),
        multiple: false,
        filters: SGW_FILTERS,
      });
      if (!selected || typeof selected !== "string") return;
      await workspaceService.openWorkspaceInWindow(selected);
      onClose?.();
    } catch (err) {
      console.error("打开 workspace 失败:", err);
    } finally {
      setBusy(false);
    }
  }, [busy, onClose]);

  const handleOpenRecent = useCallback(
    async (path: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await workspaceService.openWorkspaceInWindow(path);
        onClose?.();
      } catch (err) {
        console.error("打开 recent workspace 失败:", err);
      } finally {
        setBusy(false);
      }
    },
    [busy, onClose],
  );

  const handleRemoveRecent = useCallback(
    async (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      try {
        await workspaceService.removeRecentWorkspace(path);
        await refreshRecent();
      } catch (err) {
        console.warn("移除 recent 失败:", err);
      }
    },
    [refreshRecent],
  );

  // 用 Portal 挂到 document.body：彻底脱离 Sidebar 的渲染树，避免任何
  // 祖先 transform / will-change / contain / overflow 带来的 position:fixed
  // 包含块 / 裁剪陷阱。
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      // 阻止事件冒泡进画布的 Space 拖拽、快捷键等
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* 遮罩 */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
        onClick={closable ? onClose : undefined}
      />

      <div
        className="relative rounded-xl shadow-2xl overflow-hidden"
        style={{
          width: 520,
          maxHeight: "80vh",
          backgroundColor: "#161820",
          border: "1px solid #1f2128",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 头部 */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid #1f2128" }}
        >
          <Layers className="w-5 h-5" style={{ color: "#4a9eff" }} />
          <div className="flex-1 min-w-0">
            <div
              className="font-semibold"
              style={{ color: "#e4e6eb", fontSize: 14 }}
            >
              {t("workspace.title")}
            </div>
            <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>
              {closable
                ? t("workspace.openNewOrRecent")
                : t("workspace.selectOrStart")}
            </div>
          </div>
          {closable && (
            <button
              className="p-1 rounded hover:bg-white/5"
              onClick={onClose}
              aria-label={t("workspace.close")}
              style={{ color: "#8b92a3" }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 主动作 */}
        <div className="px-5 py-4 flex gap-3">
          <button
            className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-md transition-colors"
            style={{
              backgroundColor: "#4a9eff",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 600,
              opacity: busy ? 0.6 : 1,
              cursor: busy ? "not-allowed" : "pointer",
            }}
            onClick={handleNew}
            disabled={busy}
          >
            <Plus className="w-4 h-4" />
            {t("workspace.new")}
          </button>
          <button
            className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-md transition-colors"
            style={{
              backgroundColor: "#1a1c23",
              color: "#e4e6eb",
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid #2a2d36",
              opacity: busy ? 0.6 : 1,
              cursor: busy ? "not-allowed" : "pointer",
            }}
            onClick={handleOpen}
            disabled={busy}
          >
            <FolderOpen className="w-4 h-4" />
            {t("workspace.open")}
          </button>
        </div>

        {/* Recent 列表 */}
        <div
          className="px-5 pt-1 pb-2 text-[10px] uppercase tracking-wider"
          style={{ color: "#6b7280" }}
        >
          {t("workspace.recentlyOpened")}
        </div>
        <div
          className="px-3 pb-4 overflow-y-auto"
          style={{ scrollbarWidth: "thin", maxHeight: 320 }}
        >
          {recent.length === 0 ? (
            <div
              className="text-xs text-center py-6"
              style={{ color: "#6b7280" }}
            >
              {t("workspace.noRecent")}
            </div>
          ) : (
            recent.map((r) => (
              <RecentRow
                key={r.path}
                entry={r}
                onOpen={() => handleOpenRecent(r.path)}
                onRemove={(e) => handleRemoveRecent(e, r.path)}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RecentRow({
  entry,
  onOpen,
  onRemove,
}: {
  entry: RecentEntry;
  onOpen: () => void;
  onRemove: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      className="group w-full flex items-center gap-3 px-2 py-2 rounded-md text-left hover:bg-white/5 transition-colors"
      onClick={onOpen}
    >
      <Layers className="w-4 h-4 flex-shrink-0" style={{ color: "#8b92a3" }} />
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{ color: "#e4e6eb", fontSize: 12, fontWeight: 500 }}
        >
          {entry.name || entry.path.split("/").pop()}
        </div>
        <div
          className="truncate"
          style={{ color: "#6b7280", fontSize: 10, marginTop: 1 }}
        >
          {entry.path}
        </div>
      </div>
      <span
        className="flex-shrink-0 tabular-nums"
        style={{ color: "#6b7280", fontSize: 10 }}
      >
        {formatRelative(entry.lastOpened, t)}
      </span>
      <span
        role="button"
        tabIndex={-1}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
        style={{ color: "#8b92a3", cursor: "pointer" }}
        onClick={onRemove}
        aria-label={t("workspace.removeFromRecent")}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

function formatRelative(ts: number, t: TFunction): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("time.justNow");
  if (diff < 3_600_000) return t("time.minutesAgo", { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t("time.hoursAgo", { count: Math.floor(diff / 3_600_000) });
  if (diff < 30 * 86_400_000) return t("time.daysAgo", { count: Math.floor(diff / 86_400_000) });
  return new Date(ts).toLocaleDateString();
}
