/**
 * Workspace 自动保存 hook
 *
 * 策略：订阅 projectStore / canvasStore / panelStore 的核心字段，
 * 任一变化 500ms 防抖后组装 WorkspaceFile 写回磁盘。
 *
 * isHydrating / !isReady / !currentPath 时直接跳过，防止：
 *  - 首次 load 期间把空 store 写回覆盖 workspace
 *  - picker 空状态下乱写
 *
 * 窗口关闭前通过 onCloseRequested flush 一次最新状态。
 */
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as workspaceService from "@/services/workspace";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useProjectStore } from "@/stores/projectStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { usePanelStore } from "@/stores/panelStore";
import type { WorkspaceFile } from "@/types/workspace";

/** 从当前 store 状态快照组装 WorkspaceFile */
function buildWorkspaceFile(
  path: string,
  fallbackName: string,
): WorkspaceFile {
  const wsState = useWorkspaceStore.getState();
  const projectState = useProjectStore.getState();
  const canvasState = useCanvasStore.getState();
  const panelState = usePanelStore.getState();

  return {
    version: 1,
    name: wsState.currentName ?? fallbackName,
    projects: projectState.projects,
    projectGroups: projectState.projectGroups,
    canvas: {
      agents: canvasState.agents,
      viewport: canvasState.viewport,
      zoom: canvasState.zoom,
      cardDisplayModes: canvasState.cardDisplayModes,
      cardZOrder: canvasState.cardZOrder,
    },
    panel: {
      tabs: panelState.tabs,
      activeTabId: panelState.activeTabId,
      isOpen: panelState.isOpen,
      width: panelState.width,
    },
    ui: {
      activeProjectId: projectState.activeProject?.id ?? null,
      expandedProjectIds: projectState.expandedProjectIds,
      viewMode: projectState.viewMode,
      flatMode: projectState.flatMode,
    },
  };
  // path 仅用于接口语义（调用方传给 saveWorkspaceFile），这里消费到避免 TS unused
  void path;
}

export function useWorkspaceAutosave(): void {
  const currentPath = useWorkspaceStore((s) => s.currentPath);
  const isHydrating = useWorkspaceStore((s) => s.isHydrating);
  const isReady = useWorkspaceStore((s) => s.isReady);
  const currentName = useWorkspaceStore((s) => s.currentName);

  // project 字段
  const projects = useProjectStore((s) => s.projects);
  const projectGroups = useProjectStore((s) => s.projectGroups);
  const activeProjectId = useProjectStore((s) => s.activeProject?.id ?? null);
  const expandedProjectIds = useProjectStore((s) => s.expandedProjectIds);
  const viewMode = useProjectStore((s) => s.viewMode);
  const flatMode = useProjectStore((s) => s.flatMode);

  // canvas 字段
  const agents = useCanvasStore((s) => s.agents);
  const viewport = useCanvasStore((s) => s.viewport);
  const zoom = useCanvasStore((s) => s.zoom);
  const cardDisplayModes = useCanvasStore((s) => s.cardDisplayModes);
  const cardZOrder = useCanvasStore((s) => s.cardZOrder);

  // panel 字段
  const tabs = usePanelStore((s) => s.tabs);
  const activeTabId = usePanelStore((s) => s.activeTabId);
  const panelIsOpen = usePanelStore((s) => s.isOpen);
  const panelWidth = usePanelStore((s) => s.width);

  // 防抖保存 —— 依赖数组必须完整，漏一个就会漏存
  useEffect(() => {
    if (!currentPath || isHydrating || !isReady) return;
    const timer = setTimeout(() => {
      try {
        const ws = buildWorkspaceFile(currentPath, "Untitled");
        workspaceService
          .saveWorkspaceFile(currentPath, ws)
          .catch((err) => console.error("saveWorkspaceFile failed:", err));
      } catch (err) {
        console.error("autosave build failed:", err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    currentPath,
    isHydrating,
    isReady,
    currentName,
    projects,
    projectGroups,
    activeProjectId,
    expandedProjectIds,
    viewMode,
    flatMode,
    agents,
    viewport,
    zoom,
    cardDisplayModes,
    cardZOrder,
    tabs,
    activeTabId,
    panelIsOpen,
    panelWidth,
  ]);

  // 关窗前 flush 一次
  useEffect(() => {
    if (!currentPath) return;
    let unlistenFn: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const win = getCurrentWindow();
        const unlisten = await win.onCloseRequested(async () => {
          try {
            const ws = buildWorkspaceFile(currentPath, "Untitled");
            await workspaceService.saveWorkspaceFile(currentPath, ws);
          } catch (err) {
            console.warn("flush-on-close failed:", err);
          }
          // 不 preventDefault —— 让窗口正常关
        });
        if (cancelled) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      } catch (err) {
        console.warn("onCloseRequested setup failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  }, [currentPath]);
}
