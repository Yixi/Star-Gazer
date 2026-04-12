/**
 * Commit 分支图布局算法
 *
 * 参考 VS Code Git Graph (mhutchie/vscode-git-graph) 的 lane 分配策略：
 * - 维护 pendingLanes[]：每一槽位记录当前这一列正在等待哪个 commit hash
 * - 遍历 commits（按时间倒序）：
 *   · 被期待的 commit → 取最左 matched lane 作为 myLane，其余 matched lane 合并过来
 *   · 未被期待（分支 tip）→ 分配最左空位
 *   · 第一父继承 myLane（若第一父已被其他 lane 期待则反向并入那条 lane）
 *   · 附加父各自占新 lane 或合并到已有 lane
 *
 * 输出：每行的 pass-through 直线 + upper-to-node 入点段 + lower-from-node 出点段
 * 渲染器拿到这三组原子图元就能把 merge / branch / pass-through 全部画对。
 */
import type { GitLogEntry } from "@/services/git";

export interface PassThrough {
  /** 这条 lane 的列索引 */
  lane: number;
  /** 线段颜色 */
  color: string;
}

export interface UpperSegment {
  /** 行顶点所在的 lane（下半段终点固定是 commit 所在的 myLane） */
  fromLane: number;
  color: string;
}

export interface LowerSegment {
  /** 行底点所在的 lane（上半段起点固定是 commit 所在的 myLane） */
  toLane: number;
  color: string;
}

export interface GraphNode {
  /** commit hash */
  hash: string;
  /** 该 commit 圆点所在的 lane */
  lane: number;
  /** commit 圆点颜色（= 所在 lane 的颜色） */
  color: string;
  /** 穿过当前行、但不碰到圆点的垂直线 */
  passThrough: PassThrough[];
  /** 从行顶到圆点中心的半段（可能是直线或曲线） */
  upperToNode: UpperSegment[];
  /** 从圆点中心到行底的半段（可能是直线或曲线） */
  lowerFromNode: LowerSegment[];
}

export interface GraphLayout {
  nodes: GraphNode[];
  /** 整张图同时出现过的最大 lane 数 — 决定渲染时 SVG 的固定宽度 */
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

export function computeGraphLayout(entries: GitLogEntry[]): GraphLayout {
  /** 每个 lane 正在等待的 commit hash；undefined 表示空闲 */
  const pending: (string | undefined)[] = [];
  const nodes: GraphNode[] = [];
  let maxLanes = 0;

  for (const commit of entries) {
    // ─── 步骤 1：快照上行状态 ──────────────────────────
    const prevPending = pending.slice();

    // 找到所有期待该 commit 的 lane（matched 中的第 0 个 = myLane）
    const matched: number[] = [];
    for (let i = 0; i < prevPending.length; i++) {
      if (prevPending[i] === commit.hash) matched.push(i);
    }

    let myLane: number;
    if (matched.length > 0) {
      myLane = matched[0];
      // 所有被 matched 的 lane 都被当前 commit "消费"
      for (const i of matched) pending[i] = undefined;
    } else {
      // 分支尖端 —— 分配最左空位
      let i = pending.findIndex((x) => x === undefined);
      if (i === -1) i = pending.length;
      myLane = i;
      // pending[myLane] 保持 undefined，由第一父写入
    }

    // ─── 步骤 2：处理父 commits，构造 lowerFromNode ──────
    const lowerFromNode: LowerSegment[] = [];

    if (commit.parents.length > 0) {
      // 第一父：优先继承 myLane；但若已被另一 lane 期待，则反向并入那条 lane
      const fp = commit.parents[0];
      const existingFp = pending.findIndex((h) => h === fp);
      if (existingFp !== -1 && existingFp !== myLane) {
        // 第一父已被其他 lane 持有 → 当前 lane 在这里终止，弯回到那条 lane
        lowerFromNode.push({
          toLane: existingFp,
          color: colorForLane(existingFp),
        });
        // pending[myLane] 保持 undefined — 让出槽位供后续复用
      } else {
        pending[myLane] = fp;
        lowerFromNode.push({ toLane: myLane, color: colorForLane(myLane) });
      }

      // 附加父（merge commit 的第 2、3… 个父）
      for (let p = 1; p < commit.parents.length; p++) {
        const par = commit.parents[p];
        const existing = pending.findIndex((h) => h === par);
        if (existing !== -1) {
          // 已有 lane 等这个父 → 直接连过去
          lowerFromNode.push({
            toLane: existing,
            color: colorForLane(existing),
          });
        } else {
          // 分配新 lane 给这个父（创建侧支）
          let newLane = pending.findIndex((x) => x === undefined);
          if (newLane === -1) newLane = pending.length;
          pending[newLane] = par;
          lowerFromNode.push({
            toLane: newLane,
            color: colorForLane(newLane),
          });
        }
      }
    }

    // 紧缩尾部空 lanes（防止图形宽度无限增长）
    while (pending.length > 0 && pending[pending.length - 1] === undefined) {
      pending.pop();
    }

    const nextPending = pending.slice();

    // ─── 步骤 3：构造 upperToNode + passThrough ─────────
    const upperToNode: UpperSegment[] = [];
    const passThrough: PassThrough[] = [];
    const scanLen = Math.max(prevPending.length, nextPending.length);

    for (let i = 0; i < scanLen; i++) {
      const topActive = prevPending[i] !== undefined;
      const isMatched = matched.includes(i);

      if (i === myLane) {
        // 当前 commit 所在 lane：若之前已在等待此 commit，画一根从行顶到圆心的直线
        if (topActive) {
          upperToNode.push({ fromLane: myLane, color: colorForLane(myLane) });
        }
        continue;
      }

      if (topActive && isMatched) {
        // 侧 lane 被当前 commit 吸收 —— 画入点弯线 (i → myLane)
        upperToNode.push({ fromLane: i, color: colorForLane(i) });
      } else if (topActive) {
        // 穿越行的 pass-through 直线
        passThrough.push({ lane: i, color: colorForLane(i) });
      }
      // !topActive 意味着这个 lane 是被当前 commit 的 parent 新占的，
      // 它的视觉 "出生" 由 lowerFromNode 处理，这里不管。
    }

    const rowWidth = Math.max(
      prevPending.length,
      nextPending.length,
      myLane + 1,
    );
    if (rowWidth > maxLanes) maxLanes = rowWidth;

    nodes.push({
      hash: commit.hash,
      lane: myLane,
      color: colorForLane(myLane),
      passThrough,
      upperToNode,
      lowerFromNode,
    });
  }

  return { nodes, maxLanes };
}
