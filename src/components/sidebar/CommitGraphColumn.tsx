/**
 * 单行 commit 图形列 — 绘制分支线 + 节点圆点
 *
 * 渲染策略：
 * - 每个 lane 宽度 LANE_WIDTH（12px）
 * - 行高必须与 CommitRow 保持一致（32px）
 * - 用 SVG path 画垂直线段和弯折连接
 */
import type { GraphNode } from "@/lib/commitGraph";

const LANE_WIDTH = 12;
const ROW_HEIGHT = 32;
const NODE_RADIUS = 3.5;

interface CommitGraphColumnProps {
  node: GraphNode;
  /** 是否高亮（commit 被选中） */
  selected?: boolean;
}

export function CommitGraphColumn({ node, selected }: CommitGraphColumnProps) {
  // 计算 SVG 宽度（至少容纳所有 active lanes）
  const maxLaneInRow = Math.max(
    node.lane,
    ...node.activeLanes.map((l) => l.lane),
    ...node.edges.map((e) => Math.max(e.fromLane, e.toLane)),
    0,
  );
  const width = (maxLaneInRow + 1) * LANE_WIDTH + LANE_WIDTH / 2;

  const centerY = ROW_HEIGHT / 2;

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="flex-shrink-0"
      style={{ display: "block" }}
    >
      {/* 1. 绘制所有经过当前行的 activeLanes 垂直线（从顶到底） */}
      {node.activeLanes.map(({ lane, color }) => {
        // 当前 commit 所在 lane：上半段画到节点中心，下半段从节点中心开始（如果有第一父连接）
        if (lane === node.lane) {
          return (
            <line
              key={`active-${lane}`}
              x1={laneX(lane)}
              y1={0}
              x2={laneX(lane)}
              y2={centerY}
              stroke={color}
              strokeWidth={1.5}
            />
          );
        }
        // 其他 active lane：全程直线穿过
        return (
          <line
            key={`active-${lane}`}
            x1={laneX(lane)}
            y1={0}
            x2={laneX(lane)}
            y2={ROW_HEIGHT}
            stroke={color}
            strokeWidth={1.5}
          />
        );
      })}

      {/* 2. 绘制 edges（从当前 commit 到父 commit） */}
      {node.edges.map((edge, i) => {
        const x1 = laneX(edge.fromLane);
        const x2 = laneX(edge.toLane);
        if (x1 === x2) {
          // 直线向下
          return (
            <line
              key={`edge-${i}`}
              x1={x1}
              y1={centerY}
              x2={x1}
              y2={ROW_HEIGHT}
              stroke={edge.color}
              strokeWidth={1.5}
            />
          );
        }
        // 弯折：从 (x1, center) 直下 4px，斜向 (x2, ROW_HEIGHT - 4)，再直下
        const d = `M ${x1} ${centerY} L ${x1} ${centerY + 6} L ${x2} ${ROW_HEIGHT - 2} L ${x2} ${ROW_HEIGHT}`;
        return (
          <path
            key={`edge-${i}`}
            d={d}
            stroke={edge.color}
            strokeWidth={1.5}
            fill="none"
          />
        );
      })}

      {/* 3. 绘制节点圆点 */}
      <circle
        cx={laneX(node.lane)}
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

export { LANE_WIDTH, ROW_HEIGHT };
