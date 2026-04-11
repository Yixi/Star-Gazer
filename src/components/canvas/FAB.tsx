/**
 * FAB (Floating Action Button) — 左下角创建 Agent 按钮
 *
 * 视觉效果：
 * - 渐变蓝色背景：linear-gradient(135deg, #4a9eff 0%, #3b82f6 100%)
 * - 阴影：0 10px 30px rgba(74,158,255,0.45) + 内嵌白色高光
 * - 悬停时轻微放大(1.08) + 阴影扩大
 * - 点击时收缩反馈(0.95)
 * - 入场淡入动画
 */
import { Plus } from "lucide-react";

interface FABProps {
  onClick: () => void;
}

export function FAB({ onClick }: FABProps) {
  return (
    <button
      className="absolute bottom-5 left-5 z-20 flex items-center justify-center w-11 h-11 rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={{
        background: "linear-gradient(135deg, #4a9eff 0%, #3b82f6 100%)",
        boxShadow:
          "0 10px 30px rgba(74,158,255,0.45), inset 0 0 0 1px rgba(255,255,255,0.15)",
        transition:
          "transform 150ms var(--sg-ease-out, ease-out), box-shadow 200ms var(--sg-ease-in-out, ease)",
        animation: "sg-fade-in-up 300ms var(--sg-ease-out, ease-out) both",
      }}
      onClick={onClick}
      title="新建 Agent (Cmd+N)"
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.08)";
        e.currentTarget.style.boxShadow =
          "0 14px 40px rgba(74,158,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow =
          "0 10px 30px rgba(74,158,255,0.45), inset 0 0 0 1px rgba(255,255,255,0.15)";
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.95)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1.08)";
      }}
    >
      <Plus className="w-6 h-6" strokeWidth={1.5} />
    </button>
  );
}
