/**
 * FAB (Floating Action Button) — 画布右下角创建 Agent 按钮
 *
 * 设计稿规格：
 * - 48x48 圆形，绝对定位 right:24 bottom:24
 * - 渐变填充：accent-hover → accent-active（180deg）
 * - 阴影：0 14px 40px rgba(74,158,255,.45) + inset 高光
 * - 外圈 ring-pulse：inset -6px 1px 边框，scale .9→1.25 + opacity .6→0，2.4s 循环
 * - 内容：+ 字符 24px / weight 300
 * - hover 阴影扩大；点击轻微缩小
 */
import { useState } from "react";

interface FABProps {
  onClick: () => void;
}

export function FAB({ onClick }: FABProps) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className="absolute outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={{
        right: 24,
        bottom: 24,
        width: 48,
        height: 48,
        borderRadius: 9999,
        background: "linear-gradient(180deg, var(--sg-accent-hover) 0%, var(--sg-accent-active) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: hovered
          ? "0 18px 50px rgba(74,158,255,0.55), inset 0 1px 0 rgba(255,255,255,0.25)"
          : "0 14px 40px rgba(74,158,255,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
        color: "#fff",
        fontSize: 24,
        fontWeight: 300,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        zIndex: 4,
        transform: pressed ? "scale(0.95)" : "scale(1)",
        transition: "box-shadow 200ms var(--sg-ease-in-out), transform 100ms var(--sg-ease-out)",
        animation: "sg-fade-in-up 300ms var(--sg-ease-out) both",
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      title="新建 Agent (Cmd+N)"
    >
      {/* 外圈脉动光环 — 2.4s 无限循环 */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: -6,
          borderRadius: 9999,
          border: "1px solid rgba(74, 158, 255, 0.4)",
          animation: "sg-fab-ring 2.4s ease-out infinite",
          pointerEvents: "none",
        }}
      />
      {/* + 字符 */}
      <span style={{ position: "relative" }}>+</span>
    </button>
  );
}
