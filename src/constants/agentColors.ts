/**
 * Agent 色盘 → HEX 值的共享映射
 *
 * 在需要 JS 运算颜色值（例如拼接 `${hex}60` 做透明阴影、对 canvas/svg 设置属性）
 * 的场景使用。纯 CSS 场景应优先使用 design-tokens.css 里的 `var(--sg-agent-*)`。
 *
 * 新增颜色时同时更新 design-tokens.css 的 `--sg-agent-*` 变量，保持一致。
 */
import type { AgentColor } from "@/types/agent";

/**
 * Agent 色盘的 HEX 映射
 *
 * 类型故意放宽为 `Record<string, string | undefined>`，让调用方可以用运行时
 * 的 string 直接索引（例如 `data.agentColor` 类型本身就是 string），避免
 * 每个调用点都要 `as AgentColor` 断言。AgentColor 仍然作为"已知 key"的文档。
 */
export const AGENT_COLOR_HEX: Record<string, string> = {
  blue: "#4a9eff",
  orange: "#ff8c42",
  purple: "#a78bfa",
  green: "#22c55e",
  pink: "#ec4899",
  yellow: "#eab308",
  cyan: "#06b6d4",
  red: "#ef4444",
} satisfies Record<AgentColor, string>;

/** 取对应颜色 HEX，未知颜色回落到蓝色 */
export function agentColorHex(color: string | undefined): string {
  if (!color) return AGENT_COLOR_HEX.blue;
  return AGENT_COLOR_HEX[color] ?? AGENT_COLOR_HEX.blue;
}
