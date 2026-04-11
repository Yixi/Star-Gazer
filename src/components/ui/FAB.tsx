/**
 * FAB (Floating Action Button) — 悬浮操作按钮
 *
 * 视觉效果：
 * - 渐变蓝色背景：linear-gradient(135deg, #4a9eff 0%, #3b82f6 100%)
 * - 阴影：0 10px 30px rgba(74,158,255,0.45)
 * - 内嵌白色边框高光
 * - 悬停时轻微放大(1.08) + 阴影扩大
 * - 点击时收缩反馈(0.95)
 * - 淡入入场动画
 */
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FABProps {
  /** 点击回调 */
  onClick?: () => void;
  /** 额外 className */
  className?: string;
  /** 按钮标题提示 */
  title?: string;
}

export function FAB({
  onClick,
  className,
  title = "新建 Agent (Cmd+N)",
}: FABProps) {
  return (
    <button
      className={cn(
        "fixed z-50 flex items-center justify-center",
        "rounded-full select-none outline-none",
        "focus-visible:ring-2 focus-visible:ring-white/30",
        className
      )}
      style={{
        /* 尺寸 */
        width: "var(--sg-fab-size, 44px)",
        height: "var(--sg-fab-size, 44px)",
        /* 渐变蓝色背景 */
        background: "linear-gradient(135deg, #4a9eff 0%, #3b82f6 100%)",
        /* 阴影 + 内嵌白色高光 */
        boxShadow:
          "0 10px 30px rgba(74, 158, 255, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.15)",
        /* 位置 */
        bottom: 20,
        left: 20,
        /* 过渡效果 */
        transition:
          "transform 150ms var(--sg-ease-out, ease-out), box-shadow 200ms var(--sg-ease-in-out, ease)",
        /* 入场淡入 */
        animation: "sg-fade-in-up 300ms var(--sg-ease-out, ease-out) both",
      }}
      onClick={onClick}
      title={title}
      onMouseEnter={(e) => {
        /* 悬停：轻微放大 + 阴影扩大 */
        e.currentTarget.style.transform = "scale(1.08)";
        e.currentTarget.style.boxShadow =
          "0 14px 40px rgba(74, 158, 255, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.2)";
      }}
      onMouseLeave={(e) => {
        /* 恢复 */
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow =
          "0 10px 30px rgba(74, 158, 255, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.15)";
      }}
      onMouseDown={(e) => {
        /* 点击收缩 */
        e.currentTarget.style.transform = "scale(0.95)";
      }}
      onMouseUp={(e) => {
        /* 点击释放恢复 */
        e.currentTarget.style.transform = "scale(1.08)";
      }}
    >
      <Plus className="w-6 h-6 text-white" strokeWidth={1.5} />
    </button>
  );
}
