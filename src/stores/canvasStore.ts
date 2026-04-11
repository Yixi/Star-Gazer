import { create } from "zustand";
import type { Agent } from "@/types/agent";

/** 卡片显示模式 */
export type CardDisplayMode = "normal" | "minimized" | "maximized";

interface CanvasState {
  /** 画布上的所有 Agent 卡片 */
  agents: Agent[];
  /** 画布视口偏移 */
  viewport: { x: number; y: number };
  /** 画布缩放级别 */
  zoom: number;
  /** 当前选中的 Agent ID */
  selectedAgentId: string | null;
  /** 卡片显示模式映射 */
  cardDisplayModes: Record<string, CardDisplayMode>;
  /** 是否正在拖拽画布 */
  isPanning: boolean;
  /** 缩放范围 */
  zoomMin: number;
  zoomMax: number;

  /** 添加 Agent */
  addAgent: (agent: Agent) => void;
  /** 移除 Agent */
  removeAgent: (id: string) => void;
  /** 更新 Agent 位置 */
  updateAgentPosition: (id: string, position: { x: number; y: number }) => void;
  /** 更新 Agent 尺寸 */
  updateAgentSize: (id: string, size: { width: number; height: number }) => void;
  /** 更新 Agent 状态 */
  updateAgentStatus: (id: string, status: Agent["status"]) => void;
  /** 选中 Agent */
  selectAgent: (id: string | null) => void;
  /** 更新视口 */
  setViewport: (viewport: { x: number; y: number }) => void;
  /** 设置缩放 */
  setZoom: (zoom: number) => void;
  /** 以指定点为中心缩放 */
  zoomAtPoint: (delta: number, point: { x: number; y: number }) => void;
  /** 设置拖拽状态 */
  setIsPanning: (isPanning: boolean) => void;
  /** 设置卡片显示模式 */
  setCardDisplayMode: (id: string, mode: CardDisplayMode) => void;
  /** 获取卡片显示模式 */
  getCardDisplayMode: (id: string) => CardDisplayMode;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  agents: [],
  viewport: { x: 0, y: 0 },
  zoom: 1,
  selectedAgentId: null,
  cardDisplayModes: {},
  isPanning: false,
  zoomMin: 0.5,
  zoomMax: 2,

  addAgent: (agent) =>
    set((state) => ({ agents: [...state.agents, agent] })),

  removeAgent: (id) =>
    set((state) => {
      const { [id]: _, ...restModes } = state.cardDisplayModes;
      return {
        agents: state.agents.filter((a) => a.id !== id),
        cardDisplayModes: restModes,
      };
    }),

  updateAgentPosition: (id, position) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, position } : a)),
    })),

  updateAgentSize: (id, size) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, size } : a)),
    })),

  updateAgentStatus: (id, status) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, status } : a)),
    })),

  selectAgent: (id) => set({ selectedAgentId: id }),

  setViewport: (viewport) => set({ viewport }),

  setZoom: (zoom) => {
    const { zoomMin, zoomMax } = get();
    set({ zoom: Math.max(zoomMin, Math.min(zoomMax, zoom)) });
  },

  zoomAtPoint: (delta, point) => {
    const { zoom, viewport, zoomMin, zoomMax } = get();
    const newZoom = Math.max(zoomMin, Math.min(zoomMax, zoom + delta));
    if (newZoom === zoom) return;

    // 以光标位置为缩放中心
    const ratio = newZoom / zoom;
    const newViewport = {
      x: point.x - (point.x - viewport.x) * ratio,
      y: point.y - (point.y - viewport.y) * ratio,
    };

    set({ zoom: newZoom, viewport: newViewport });
  },

  setIsPanning: (isPanning) => set({ isPanning }),

  setCardDisplayMode: (id, mode) =>
    set((state) => ({
      cardDisplayModes: { ...state.cardDisplayModes, [id]: mode },
    })),

  getCardDisplayMode: (id) => {
    return get().cardDisplayModes[id] ?? "normal";
  },
}));
