/**
 * Agent 颜色盘 - 为每个 Agent 分配不同颜色
 */
import type { AgentColor } from "@/types/agent";

/** 颜色配置映射 */
export const AGENT_COLORS: Record<
  AgentColor,
  { label: string; bg: string; border: string; text: string }
> = {
  blue: {
    label: "蓝色",
    bg: "bg-agent-blue/20",
    border: "border-agent-blue",
    text: "text-agent-blue",
  },
  green: {
    label: "绿色",
    bg: "bg-agent-green/20",
    border: "border-agent-green",
    text: "text-agent-green",
  },
  orange: {
    label: "橙色",
    bg: "bg-agent-orange/20",
    border: "border-agent-orange",
    text: "text-agent-orange",
  },
  purple: {
    label: "紫色",
    bg: "bg-agent-purple/20",
    border: "border-agent-purple",
    text: "text-agent-purple",
  },
  pink: {
    label: "粉色",
    bg: "bg-agent-pink/20",
    border: "border-agent-pink",
    text: "text-agent-pink",
  },
  cyan: {
    label: "青色",
    bg: "bg-agent-cyan/20",
    border: "border-agent-cyan",
    text: "text-agent-cyan",
  },
  yellow: {
    label: "黄色",
    bg: "bg-agent-yellow/20",
    border: "border-agent-yellow",
    text: "text-agent-yellow",
  },
  red: {
    label: "红色",
    bg: "bg-agent-red/20",
    border: "border-agent-red",
    text: "text-agent-red",
  },
};

/** 可用颜色列表 */
export const AVAILABLE_COLORS: AgentColor[] = [
  "blue",
  "green",
  "orange",
  "purple",
  "pink",
  "cyan",
  "yellow",
  "red",
];

/** 获取下一个可用颜色（循环分配） */
export function getNextColor(usedColors: AgentColor[]): AgentColor {
  const available = AVAILABLE_COLORS.filter((c) => !usedColors.includes(c));
  if (available.length > 0) return available[0];
  // 全部用完则循环
  return AVAILABLE_COLORS[usedColors.length % AVAILABLE_COLORS.length];
}
