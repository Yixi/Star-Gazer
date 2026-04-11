/**
 * Hover 关联高亮 Store
 *
 * 管理 Agent 卡片 hover 状态，驱动文件树关联高亮效果：
 * - 鼠标悬停 Agent 卡片时，文件树中被该 Agent 修改的文件高亮
 * - 其他文件变暗
 * - 离开时平滑恢复
 */
import { create } from "zustand";

interface HoverState {
  /** 当前悬停的 Agent ID */
  hoveredAgentId: string | null;
  /** 当前悬停的 Agent 颜色 */
  hoveredAgentColor: string | null;

  /** 设置悬停的 Agent */
  setHoveredAgent: (agentId: string | null, color?: string | null) => void;
  /** 清除悬停状态 */
  clearHover: () => void;
}

export const useHoverStore = create<HoverState>((set) => ({
  hoveredAgentId: null,
  hoveredAgentColor: null,

  setHoveredAgent: (agentId, color = null) =>
    set({ hoveredAgentId: agentId, hoveredAgentColor: color }),

  clearHover: () =>
    set({ hoveredAgentId: null, hoveredAgentColor: null }),
}));
