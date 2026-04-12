/**
 * 单行 commit 图形列 — 绘制 pass-through 直线 + upper/lower 半段 + 节点圆点
 *
 * 数据源：commitGraph.ts 的 GraphNode
 * - passThrough：从行顶到行底穿越的 lane（不碰节点）
 * - upperToNode：从行顶 (fromLaneX, 0) 到节点中心 (myLaneX, centerY) 的半段
 * - lowerFromNode：从节点中心 (myLaneX, centerY) 到行底 (toLaneX, h) 的半段
 *
 * 相同 lane 画直线，跨 lane 画平滑三次 Bezier 曲线（上下切线保持垂直）
 */
import type { GraphNode } from "@/lib/commitGraph";

const LANE_WIDTH = 12;
const ROW_HEIGHT = 24;
const NODE_RADIUS = 3;

interface CommitGraphColumnProps {
  node: GraphNode;
  /** 是否高亮（commit 被选中） */
  selected?: boolean;
}

/** 计算本行实际占用的最大 lane（含 passThrough / upper / lower / 自身 lane） */
function maxLaneOfRow(node: GraphNode): number {
  let m = node.lane;
  for (const p of node.passThrough) if (p.lane > m) m = p.lane;
  for (const u of node.upperToNode) if (u.fromLane > m) m = u.fromLane;
  for (const l of node.lowerFromNode) if (l.toLane > m) m = l.toLane;
  return m;
}

export function CommitGraphColumn({
  node,
  selected,
}: CommitGraphColumnProps) {
  // SVG 宽度 = 本行最宽 lane + 半个 lane 的右留白
  // （不再按全局 totalLanes 对齐，让后续 hash/message 紧跟图元，节约空间）
  const rowMax = maxLaneOfRow(node);
  const width = (rowMax + 1) * LANE_WIDTH;
  const centerY = ROW_HEIGHT / 2;
  const myX = laneX(node.lane);

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="flex-shrink-0"
      style={{ display: "block" }}
    >
      {/* 1. Pass-through 垂直线（穿越当前行、不碰节点的 lane） */}
      {node.passThrough.map(({ lane, color }) => (
        <line
          key={`pt-${lane}`}
          x1={laneX(lane)}
          y1={0}
          x2={laneX(lane)}
          y2={ROW_HEIGHT}
          stroke={color}
          strokeWidth={1.5}
        />
      ))}

      {/* 2. Upper half：从行顶到节点中心（入 node） */}
      {node.upperToNode.map(({ fromLane, color }) => {
        const fromX = laneX(fromLane);
        if (fromX === myX) {
          return (
            <line
              key={`up-${fromLane}`}
              x1={myX}
              y1={0}
              x2={myX}
              y2={centerY}
              stroke={color}
              strokeWidth={1.5}
            />
          );
        }
        return (
          <path
            key={`up-${fromLane}`}
            d={bendPath(fromX, 0, myX, centerY)}
            stroke={color}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}

      {/* 3. Lower half：从节点中心到行底（出 node） */}
      {node.lowerFromNode.map(({ toLane, color }, i) => {
        const toX = laneX(toLane);
        if (toX === myX) {
          return (
            <line
              key={`dn-${i}-${toLane}`}
              x1={myX}
              y1={centerY}
              x2={myX}
              y2={ROW_HEIGHT}
              stroke={color}
              strokeWidth={1.5}
            />
          );
        }
        return (
          <path
            key={`dn-${i}-${toLane}`}
            d={bendPath(myX, centerY, toX, ROW_HEIGHT)}
            stroke={color}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}

      {/* 4. 节点圆点 */}
      <circle
        cx={myX}
        cy={centerY}
        r={selected ? NODE_RADIUS + 1.5 : NODE_RADIUS}
        fill={selected ? node.color : "#0b0d12"}
        stroke={node.color}
        strokeWidth={selected ? 2 : 1.5}
      />
    </svg>
  );
}

function laneX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

/**
 * 平滑三次 Bezier 曲线：端点处切线保持垂直
 *
 * 原理：把两个控制点都放在 midY 上，与各自端点共享 x 坐标 →
 * - (x1, y1) 的切线是 (x1, y1) → (x1, midY)，垂直
 * - (x2, y2) 的切线是 (x2, midY) → (x2, y2)，垂直
 * 两端无尖角，与相邻的垂直 lane 平滑衔接
 */
function bendPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

export { LANE_WIDTH, ROW_HEIGHT };
