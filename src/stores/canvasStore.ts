import { create } from "zustand";
import type { Agent } from "@/types/agent";
import type { WorkspaceCanvasSnapshot } from "@/types/workspace";

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
  /**
   * Agent 堆叠层级映射（id → zIndex）
   *
   * 用 CSS zIndex 做置顶，**不动 agents 数组顺序** — 因为 React 对 keyed
   * children 重排时会调用 insertBefore 物理移动 DOM 节点，会让 xterm 的
   * 内部状态（scroll 位置、canvas 渲染、resize 观察）错乱，看起来像命令被
   * 重新执行。改用 zIndex 后 DOM 结构完全稳定。
   */
  cardZOrder: Record<string, number>;
  /** 下一个分配给"置顶"操作的 z 值 */
  nextZOrder: number;
  /** 是否正在拖拽画布 */
  isPanning: boolean;
  /** 缩放范围 */
  zoomMin: number;
  zoomMax: number;
  /**
   * 最大化快照 — 某张卡片进入 maximized 时冻结的画布和卡片状态。
   *
   * 为什么要快照：AgentCard 渲染在 data-canvas-layer 这个带 transform+zoom
   * 的父层里，直接给卡片加 `position: fixed` 会因祖先 transform 被吃掉（退
   * 化成相对祖先定位）+ 祖先 zoom 再叠乘 100vw/100vh，出现诡异大小/偏移。
   * 解法：进入 maximized 时把 zoom/viewport 重置为 1/(0,0)，让 canvas-layer
   * 变成 identity transform，卡片 `position: absolute; inset: 0` 就能精确填满
   * canvas 区域；退出时用这个快照恢复原 zoom/viewport + 原卡片 pos/size。
   */
  maximizeSnapshot: {
    agentId: string;
    zoom: number;
    viewport: { x: number; y: number };
    agentPosition: { x: number; y: number };
    agentSize: { width: number; height: number };
  } | null;

  /** 添加 Agent */
  addAgent: (agent: Agent) => void;
  /** 移除 Agent */
  removeAgent: (id: string) => void;
  /** 把 Agent 提到最顶层（更新 cardZOrder，不动数组） */
  bringAgentToFront: (id: string) => void;
  /** 更新 Agent 位置 */
  updateAgentPosition: (id: string, position: { x: number; y: number }) => void;
  /** 更新 Agent 尺寸 */
  updateAgentSize: (id: string, size: { width: number; height: number }) => void;
  /** 更新 Agent 状态 */
  updateAgentStatus: (id: string, status: Agent["status"]) => void;
  /**
   * 清除所有引用某 group 的 agent scope（把 scope 设为 undefined）。
   * 项目组被删除时调用 —— 卡片本身保留，仅熄灭运行指示联动。
   */
  clearAgentScopesForGroup: (groupId: string) => void;
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
  /** 进入某卡片的最大化：快照画布和卡片状态，画布复位到 identity */
  enterCardMaximize: (id: string) => void;
  /** 退出最大化：从快照恢复画布和卡片状态 */
  exitCardMaximize: () => void;
  /** 获取 agent 的堆叠 z 值（默认 1） */
  getCardZOrder: (id: string) => number;
  /**
   * 重排所有 Agent 卡片为不重叠的网格。
   * 用 shelf-pack 算法：按当前数组顺序逐个放置，
   * 行宽超出 availableWidth 时换行。最大化卡片会先复位为 normal，
   * 最小化卡片按头部高度计入行高。重排后视口归零。
   */
  relayoutAgents: (availableWidth: number) => void;

  /**
   * 从 workspace 文件快照批量替换画布状态。
   *
   * nextZOrder 取 cardZOrder 的最大值 + 1，保证后续 bringAgentToFront 不冲突。
   */
  hydrateFromWorkspace: (snapshot: WorkspaceCanvasSnapshot) => void;
}

/** 重排算法用的常量 */
const RELAYOUT_PADDING = 24;
const RELAYOUT_GAP = 20;
const MINIMIZED_HEIGHT = 36;

export const useCanvasStore = create<CanvasState>((set, get) => ({
  agents: [],
  viewport: { x: 0, y: 0 },
  zoom: 1,
  selectedAgentId: null,
  cardDisplayModes: {},
  cardZOrder: {},
  nextZOrder: 1,
  isPanning: false,
  zoomMin: 0.5,
  zoomMax: 2,
  maximizeSnapshot: null,

  addAgent: (agent) =>
    set((state) => ({
      agents: [...state.agents, agent],
      // 新 agent 自动置顶
      cardZOrder: { ...state.cardZOrder, [agent.id]: state.nextZOrder },
      nextZOrder: state.nextZOrder + 1,
    })),

  removeAgent: (id) =>
    set((state) => {
      const { [id]: _m, ...restModes } = state.cardDisplayModes;
      const { [id]: _z, ...restZ } = state.cardZOrder;
      // 如果删的正好是最大化的那张，恢复画布并清快照
      const snap = state.maximizeSnapshot;
      const restoreCanvas =
        snap && snap.agentId === id
          ? {
              zoom: snap.zoom,
              viewport: snap.viewport,
              maximizeSnapshot: null,
            }
          : {};
      return {
        ...restoreCanvas,
        agents: state.agents.filter((a) => a.id !== id),
        cardDisplayModes: restModes,
        cardZOrder: restZ,
      };
    }),

  bringAgentToFront: (id) =>
    set((state) => {
      // 已经在最顶层就别动，避免无谓 state 更新触发 re-render
      const currentZ = state.cardZOrder[id] ?? 0;
      if (currentZ === state.nextZOrder - 1) return state;
      return {
        cardZOrder: { ...state.cardZOrder, [id]: state.nextZOrder },
        nextZOrder: state.nextZOrder + 1,
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

  clearAgentScopesForGroup: (groupId) =>
    set((state) => ({
      agents: state.agents.map((a) => {
        if (a.scope?.kind === "group" && a.scope.groupId === groupId) {
          const next: Agent = { ...a };
          delete next.scope;
          return next;
        }
        return a;
      }),
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

  enterCardMaximize: (id) =>
    set((state) => {
      // 已经有别的卡片最大化时先拒绝，避免快照被覆盖
      if (state.maximizeSnapshot && state.maximizeSnapshot.agentId !== id) {
        return state;
      }
      const agent = state.agents.find((a) => a.id === id);
      if (!agent) return state;
      return {
        maximizeSnapshot: {
          agentId: id,
          zoom: state.zoom,
          viewport: state.viewport,
          agentPosition: agent.position,
          agentSize: agent.size,
        },
        // 重置画布 transform，让 canvas-layer 变成 identity
        // 这样子元素的 absolute inset:0 就能精确贴合 canvas 容器
        zoom: 1,
        viewport: { x: 0, y: 0 },
        cardDisplayModes: { ...state.cardDisplayModes, [id]: "maximized" },
      };
    }),

  exitCardMaximize: () =>
    set((state) => {
      const snap = state.maximizeSnapshot;
      if (!snap) return state;
      return {
        zoom: snap.zoom,
        viewport: snap.viewport,
        agents: state.agents.map((a) =>
          a.id === snap.agentId
            ? { ...a, position: snap.agentPosition, size: snap.agentSize }
            : a,
        ),
        cardDisplayModes: {
          ...state.cardDisplayModes,
          [snap.agentId]: "normal",
        },
        maximizeSnapshot: null,
      };
    }),

  getCardZOrder: (id) => {
    return get().cardZOrder[id] ?? 1;
  },

  relayoutAgents: (availableWidth) =>
    set((state) => {
      if (state.agents.length === 0) return state;

      const maxRowRight =
        Math.max(400, availableWidth) - RELAYOUT_PADDING;
      let cursorX = RELAYOUT_PADDING;
      let cursorY = RELAYOUT_PADDING;
      let rowHeight = 0;

      // 把 maximized 的卡片复位为 normal — 重排后该是干净网格
      const nextDisplayModes = { ...state.cardDisplayModes };

      const nextAgents = state.agents.map((agent) => {
        if (nextDisplayModes[agent.id] === "maximized") {
          nextDisplayModes[agent.id] = "normal";
        }
        const w = agent.size.width;
        const h =
          nextDisplayModes[agent.id] === "minimized"
            ? MINIMIZED_HEIGHT
            : agent.size.height;

        // 行内放不下就换行（除非已经在行首）
        if (cursorX !== RELAYOUT_PADDING && cursorX + w > maxRowRight) {
          cursorX = RELAYOUT_PADDING;
          cursorY += rowHeight + RELAYOUT_GAP;
          rowHeight = 0;
        }

        const placed = { ...agent, position: { x: cursorX, y: cursorY } };
        cursorX += w + RELAYOUT_GAP;
        if (h > rowHeight) rowHeight = h;
        return placed;
      });

      return {
        agents: nextAgents,
        cardDisplayModes: nextDisplayModes,
        viewport: { x: 0, y: 0 },
        // 重排会清掉 maximized 状态，对应快照也必须作废
        maximizeSnapshot: null,
      };
    }),

  hydrateFromWorkspace: (snapshot) => {
    const zValues = Object.values(snapshot.cardZOrder);
    const maxZ = zValues.length > 0 ? Math.max(...zValues) : 0;
    set({
      agents: snapshot.agents,
      viewport: snapshot.viewport,
      zoom: snapshot.zoom,
      cardDisplayModes: snapshot.cardDisplayModes,
      cardZOrder: snapshot.cardZOrder,
      nextZOrder: maxZ + 1,
      selectedAgentId: null,
      isPanning: false,
    });
  },
}));
