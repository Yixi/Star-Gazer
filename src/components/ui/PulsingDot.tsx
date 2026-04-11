/**
 * 脉动蓝点组件 — 实时写入指示器
 *
 * 6px 圆点，周期 1.4s 的脉动效果：
 * - 透明度和缩放脉动
 * - 蓝色发光光晕 (box-shadow: 0 0 8px #4a9eff)
 *
 * 支持自定义颜色，默认使用 Agent 蓝色。
 */
import { cn } from "@/lib/utils";

interface PulsingDotProps {
  /** Agent 颜色名称，用于自动匹配色值 */
  color?: "blue" | "orange" | "purple" | "green" | "pink" | "yellow" | "cyan" | "red";
  /** 自定义大小（px），默认 6 */
  size?: number;
  /** 额外的 className */
  className?: string;
}

/** 颜色到 CSS 变量的映射 */
const COLOR_MAP: Record<string, { bg: string; glow: string }> = {
  blue: { bg: "var(--sg-agent-blue)", glow: "var(--sg-glow-blue)" },
  orange: { bg: "var(--sg-agent-orange)", glow: "var(--sg-glow-orange)" },
  purple: { bg: "var(--sg-agent-purple)", glow: "var(--sg-glow-purple)" },
  green: { bg: "var(--sg-agent-green)", glow: "var(--sg-glow-green)" },
  pink: { bg: "var(--sg-agent-pink)", glow: "var(--sg-glow-pink)" },
  yellow: { bg: "var(--sg-agent-yellow)", glow: "var(--sg-glow-yellow)" },
  cyan: { bg: "var(--sg-agent-cyan)", glow: "var(--sg-glow-cyan)" },
  red: { bg: "var(--sg-agent-red)", glow: "var(--sg-glow-red)" },
};

export function PulsingDot({ color = "blue", size = 6, className }: PulsingDotProps) {
  const colorConfig = COLOR_MAP[color] ?? COLOR_MAP.blue;

  return (
    <span
      className={cn("inline-block rounded-full flex-shrink-0", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: colorConfig.bg,
        animation: "sg-pulse-dot 1.4s ease-in-out infinite",
        boxShadow: `0 0 8px ${colorConfig.glow}`,
      }}
      aria-label="正在写入"
      role="status"
    />
  );
}
