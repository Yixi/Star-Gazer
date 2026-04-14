/**
 * Workspace 启动加载 hook
 *
 * 解析顺序：
 *  1. URL ?ws=... （Rust 构造新窗口时带的 query）
 *  2. 主窗口才会走 startup cache / recent.lastOpenedPath
 *  3. 副窗口（ws-xxx label）必须从 URL 读
 *
 * 解析到路径后 load 并分发到 projectStore / canvasStore / panelStore。
 * 无路径 → 显示 picker（空状态）。
 *
 * **严格只跑一次**，useEffect 空依赖数组；hydrate 期间 autosave 被屏蔽。
 */
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as workspaceService from "@/services/workspace";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useProjectStore } from "@/stores/projectStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { usePanelStore } from "@/stores/panelStore";
import type { WorkspaceFile } from "@/types/workspace";

/** URL-safe base64 解码 —— Rust 端用 `-_` 替换 `+/` 且可能无 padding */
function decodeB64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    const binary = atob(b64 + pad);
    // 处理包含多字节 UTF-8 的路径
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch (err) {
    console.error("decodeB64Url failed:", err);
    return "";
  }
}

function applyWorkspaceToStores(ws: WorkspaceFile): void {
  useProjectStore.getState().hydrateFromWorkspace(ws);
  useCanvasStore.getState().hydrateFromWorkspace(ws.canvas);
  usePanelStore.getState().hydrateFromWorkspace(ws.panel);
}

export function useWorkspaceBootstrap(): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const wsStore = useWorkspaceStore.getState();

      // 1. 解析 workspace 路径来源
      let label = "main";
      try {
        label = getCurrentWindow().label;
      } catch {
        // 非 Tauri 环境保持 "main"
      }

      let path: string | null = null;
      try {
        const urlWs = new URLSearchParams(window.location.search).get("ws");
        if (urlWs) {
          const decoded = decodeB64Url(urlWs);
          if (decoded) path = decoded;
        }

        if (!path && label === "main") {
          try {
            path = await workspaceService.getStartupWorkspacePath();
          } catch (err) {
            console.warn("getStartupWorkspacePath failed:", err);
          }
          if (!path) {
            try {
              const recent = await workspaceService.listRecentWorkspaces();
              if (!cancelled) wsStore.setRecent(recent);
              path = recent.lastOpenedPath;
            } catch (err) {
              console.warn("listRecentWorkspaces failed:", err);
            }
          }
        } else if (!path && label.startsWith("ws-")) {
          try {
            path = await workspaceService.getWindowWorkspacePath(label);
          } catch (err) {
            console.warn("getWindowWorkspacePath failed:", err);
          }
        }
      } catch (err) {
        console.error("workspace path resolution failed:", err);
      }

      if (cancelled) return;

      if (!path) {
        // 空状态：刷新 recent（若上面没刷过）并进入 ready
        try {
          const recent = await workspaceService.listRecentWorkspaces();
          if (!cancelled) wsStore.setRecent(recent);
        } catch {
          /* ignore */
        }
        if (!cancelled) wsStore.markReady();
        return;
      }

      // 2. load + 分发
      wsStore.beginHydrate();
      try {
        const ws = await workspaceService.loadWorkspaceFile(path);
        if (cancelled) return;
        applyWorkspaceToStores(ws);
        wsStore.setCurrentWorkspace(path, ws.name);
        // fs.rs 的路径沙箱从 WorkspaceManager 内存列表校验，
        // 没同步过后端所有 read/list/watch 都会被拒。
        // 组的父目录 path 也要送进去，因为 agent 关联组时 PTY 可能在父目录下
        // 访问 README.md / .env 这类共享文件。
        try {
          const allPaths = [
            ...ws.projects.map((p) => p.path),
            ...(ws.projectGroups ?? []).map((g) => g.path),
          ];
          await workspaceService.syncWorkspaceProjectPaths(allPaths);
        } catch (err) {
          console.warn("syncWorkspaceProjectPaths failed:", err);
        }
        try {
          const recent = await workspaceService.listRecentWorkspaces();
          if (!cancelled) wsStore.setRecent(recent);
        } catch {
          /* ignore */
        }
      } catch (err) {
        console.error("Failed to load workspace:", path, err);
        // 清掉 recent 中的死链
        try {
          await workspaceService.removeRecentWorkspace(path);
          const recent = await workspaceService.listRecentWorkspaces();
          if (!cancelled) wsStore.setRecent(recent);
        } catch {
          /* ignore */
        }
      } finally {
        if (!cancelled) {
          wsStore.endHydrate();
          wsStore.markReady();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // 严格只跑一次 —— 空依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
