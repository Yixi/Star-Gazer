import { create } from "zustand";
import type { Agent } from "@/types/agent";

interface CanvasState {
  /** 画布上的所有 Agent 卡片 */
  agents: Agent[];
  /** 画布视口偏移 */
  viewport: { x: number; y: number };
  /** 画布缩放级别 */
  zoom: number;
  /** 当前选中的 Agent ID */
  selectedAgentId: string | null;

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
}

export const useCanvasStore = create<CanvasState>((set) => ({
  agents: [],
  viewport: { x: 0, y: 0 },
  zoom: 1,
  selectedAgentId: null,

  addAgent: (agent) =>
    set((state) => ({ agents: [...state.agents, agent] })),

  removeAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
    })),

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

  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(2, zoom)) }),
}));
