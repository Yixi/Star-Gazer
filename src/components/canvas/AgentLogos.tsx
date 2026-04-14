/**
 * Agent 品牌 logo - 内联 SVG 组件
 *
 * 这些是基于几何基元手绘的品牌意象标记，用来在 AgentPicker / 卡片头部快速
 * 识别 agent 类型。颜色用 `currentColor`，调用方通过 `style={{ color }}`
 * 或 `className="text-..."` 控制着色。
 */

interface LogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Claude / Anthropic — 8 射线星芒
 * 4 条旋转的圆角矩形叠加，形成 Anthropic 品牌常见的 asterisk 造型。
 */
export function ClaudeLogo({ size = 20, className, style }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="11" y="2.5" width="2" height="19" rx="1" />
      <rect
        x="11"
        y="2.5"
        width="2"
        height="19"
        rx="1"
        transform="rotate(45 12 12)"
      />
      <rect
        x="11"
        y="2.5"
        width="2"
        height="19"
        rx="1"
        transform="rotate(90 12 12)"
      />
      <rect
        x="11"
        y="2.5"
        width="2"
        height="19"
        rx="1"
        transform="rotate(135 12 12)"
      />
    </svg>
  );
}

/**
 * OpenAI Codex — 六边椭圆结
 * 三个 60° 偏转的扁椭圆叠加，模拟 OpenAI 品牌的花瓣结构。
 */
export function CodexLogo({ size = 20, className, style }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <ellipse
        cx="12"
        cy="12"
        rx="9"
        ry="3.6"
        transform="rotate(60 12 12)"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="9"
        ry="3.6"
        transform="rotate(-60 12 12)"
      />
    </svg>
  );
}

/**
 * OpenCode — 圆角方框内的 `< /` 字样
 * 呼应 opencode.ai 的方形 chevron 品牌语言。
 */
export function OpenCodeLogo({ size = 20, className, style }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M9.5 9.5 L6.5 12 L9.5 14.5" />
      <path d="M14.5 9 L17 15" />
    </svg>
  );
}
