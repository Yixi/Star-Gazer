/**
 * 画布空状态引导 — 当画布上没有任何卡片时显示
 *
 * 视觉效果：
 * - 中心放置微妙的 Star Gazer logo / 图标
 * - ��示文字："点击 + 或按 Cmd+N 创建你的第一个 Agent"
 * - 整体使用淡入动画
 * - 不阻碍交互（pointer-events-none）
 */
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export function CanvasEmptyState() {
  const { t } = useTranslation();
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      style={{
        animation: "sg-fade-in 600ms var(--sg-ease-out, ease-out) both",
      }}
    >
      <div className="text-center flex flex-col items-center gap-4">
        {/* Star Gazer 图标 — 微妙的星光效果 */}
        <div
          className="relative"
          style={{
            animation: "sg-breathe 3s ease-in-out infinite",
          }}
        >
          {/* 外层光晕 */}
          <div
            className="absolute inset-0 rounded-full blur-xl"
            style={{
              background: "radial-gradient(circle, rgba(74,158,255,0.12) 0%, transparent 70%)",
              transform: "scale(2.5)",
            }}
          />
          {/* 图标 */}
          <div
            className="relative flex items-center justify-center rounded-2xl"
            style={{
              width: 64,
              height: 64,
              background: "linear-gradient(135deg, rgba(74,158,255,0.08) 0%, rgba(59,130,246,0.04) 100%)",
              border: "1px solid rgba(74,158,255,0.12)",
            }}
          >
            <Sparkles
              className="w-7 h-7"
              style={{ color: "var(--sg-accent, #4a9eff)" }}
              strokeWidth={1.5}
            />
          </div>
        </div>

        {/* 标题 */}
        <div>
          <p
            className="text-base font-medium"
            style={{ color: "var(--sg-text-secondary, #b8bcc4)" }}
          >
            {t("canvas.ready")}
          </p>
          {/* 操作提示 */}
          <p
            className="text-sm mt-1.5"
            style={{ color: "var(--sg-text-hint, #6b7280)" }}
          >
            {t("canvas.createFirstAgent")
              .split(/<kbd>|<\/kbd>/)
              .map((part, i) =>
                i % 2 === 1 ? (
                  <kbd
                    key={i}
                    className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      background: "var(--sg-bg-card-header)",
                      border: "1px solid var(--sg-border-divider)",
                      color: "var(--sg-text-secondary)",
                    }}
                  >
                    {part}
                  </kbd>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
          </p>
        </div>
      </div>
    </div>
  );
}
