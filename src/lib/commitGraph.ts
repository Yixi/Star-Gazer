/**
 * Commit 分支图布局算法
 *
 * 参考 VS Code Git Graph 的 lane 分配策略：
 * - 每个 commit 占据一个 lane（垂直列）
 * - 从上到下顺序处理（entries 已按时间倒序）
 * - 每个 commit 继承其第一个子 commit 的 lane（当前 active lane）
 * - merge commits 有多个父，每个父占用不同 lane
 * - 分支创建/终止时分配新 lane
 *
 * 输出：每个 commit 的 lane 索引 + 它的所有连接线段
 */
import type { GitLogEntry } from "@/services/git";

export interface GraphNode {
  /** commit hash */
  hash: string;
  /** 节点所在的 lane（列索引，从 0 开始） */
  lane: number;
  /** 当前行激活的 lanes 快照（用于渲染经过当前行的所有垂直线） */
  activeLanes: Array<{ lane: number; color: string }>;
  /** 从该节点出发连向父节点的边 */
  edges: Array<{
    fromLane: number;
    toLane: number;
    color: string;
    /** 父 commit 在后续行中的索引偏移；>1 表示跨越多行 */
    parentOffset: number;
  }>;
  /** 此节点的颜色 */
  color: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  /** 所有同时出现过的最大 lane 数（决定图形宽度） */
  maxLanes: number;
}

/** 分支颜色调色板（与 agent 色一致，避免视觉冲突） */
const LANE_COLORS = [
  "#4a9eff", // blue
  "#22c55e", // green
  "#a78bfa", // purple
  "#ff8c42", // orange
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#eab308", // yellow
  "#ef4444", // red
];

function colorForLane(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

/**
 * 计算 commit 图布局
 *
 * 算法概要（单次自顶向下扫描）：
 * - `pendingLanes` 数组：每个位置表示一个 lane 当前期待哪个 commit hash
 * - 处理每个 commit：
 *   1. 查找它是否已经被某个 pending lane 期待（即作为之前某个 commit 的父）
 *      - 如果是，取最左侧的匹配 lane 作为当前 commit 的 lane，其他匹配 lane 合并过来
 *      - 如果不是（如分支 tip），分配新 lane（最左侧空闲位置）
 *   2. 将当前 commit 的父 commits 放入 pendingLanes
 *      - 第一个父：占用当前 lane
 *      - 其他父（merge）：分配新 lane
 */
export function computeGraphLayout(entries: GitLogEntry[]): GraphLayout {
  // pendingLanes[i] = 正在等待被 "当前 commit" 继承的 lane 所对应的 commit hash
  // undefined 表示该 lane 空闲
  const pendingLanes: (string | undefined)[] = [];
  const nodes: GraphNode[] = [];
  let maxLanes = 0;

  for (let i = 0; i < entries.length; i++) {
    const commit = entries[i];

    // 步骤 1：找到这个 commit 所在的 lane（它被哪些 pending lane 期待）
    let myLane = -1;
    const matchedLanes: number[] = [];
    for (let j = 0; j < pendingLanes.length; j++) {
      if (pendingLanes[j] === commit.hash) {
        matchedLanes.push(j);
        if (myLane === -1) myLane = j;
      }
    }

    if (myLane === -1) {
      // 没有被期待 → 分配新 lane（最左侧空闲位置）
      let emptyIdx = pendingLanes.findIndex((x) => x === undefined);
      if (emptyIdx === -1) emptyIdx = pendingLanes.length;
      pendingLanes[emptyIdx] = commit.hash;
      myLane = emptyIdx;
      matchedLanes.push(emptyIdx);
    }

    const myColor = colorForLane(myLane);

    // 步骤 2：收集当前行 activeLanes 快照
    // 包括所有非空的 pending lanes 以及 merge lanes
    const activeLanes: GraphNode["activeLanes"] = [];
    for (let j = 0; j < pendingLanes.length; j++) {
      if (pendingLanes[j] !== undefined) {
        activeLanes.push({ lane: j, color: colorForLane(j) });
      }
    }

    // 步骤 3：处理父 commits（当前 commit 出发的边）
    const edges: GraphNode["edges"] = [];

    // 释放此 commit 占用的所有 matched lanes（除了要重用给第一个父的那个）
    for (const lane of matchedLanes) {
      pendingLanes[lane] = undefined;
    }

    if (commit.parents.length === 0) {
      // 根 commit，无出边
    } else {
      // 第一个父继承当前 lane（颜色 / 主分支线）
      const firstParent = commit.parents[0];
      const firstParentIdx = findParentIndexAfter(entries, firstParent, i);

      // 尝试复用当前 lane 给第一个父
      // 但如果该 lane 已被其他 commit 期待（不太可能因为刚刚清除）
      pendingLanes[myLane] = firstParent;
      edges.push({
        fromLane: myLane,
        toLane: myLane,
        color: myColor,
        parentOffset: firstParentIdx === -1 ? 1 : firstParentIdx - i,
      });

      // 额外父（merge commit）：为每个分配新 lane
      for (let p = 1; p < commit.parents.length; p++) {
        const parent = commit.parents[p];
        // 检查这个 parent 是否已经被其他 lane 期待 → 直接连到那里
        const existing = pendingLanes.findIndex((x) => x === parent);
        if (existing !== -1) {
          const parentIdx = findParentIndexAfter(entries, parent, i);
          edges.push({
            fromLane: myLane,
            toLane: existing,
            color: colorForLane(existing),
            parentOffset: parentIdx === -1 ? 1 : parentIdx - i,
          });
        } else {
          // 分配新 lane
          let newLane = pendingLanes.findIndex((x) => x === undefined);
          if (newLane === -1) newLane = pendingLanes.length;
          pendingLanes[newLane] = parent;
          const parentIdx = findParentIndexAfter(entries, parent, i);
          edges.push({
            fromLane: myLane,
            toLane: newLane,
            color: colorForLane(newLane),
            parentOffset: parentIdx === -1 ? 1 : parentIdx - i,
          });
        }
      }
    }

    // 紧缩尾部空 lanes
    while (pendingLanes.length > 0 && pendingLanes[pendingLanes.length - 1] === undefined) {
      pendingLanes.pop();
    }

    const currentLaneCount = Math.max(
      pendingLanes.length,
      activeLanes.length,
      myLane + 1,
    );
    if (currentLaneCount > maxLanes) maxLanes = currentLaneCount;

    nodes.push({
      hash: commit.hash,
      lane: myLane,
      activeLanes,
      edges,
      color: myColor,
    });
  }

  return { nodes, maxLanes };
}

function findParentIndexAfter(
  entries: GitLogEntry[],
  parentHash: string,
  fromIdx: number,
): number {
  for (let i = fromIdx + 1; i < entries.length; i++) {
    if (entries[i].hash === parentHash) return i;
  }
  return -1;
}
