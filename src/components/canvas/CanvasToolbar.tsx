/**
 * 画布工具栏 — 浮动在画布顶部居中
 *
 * 设计稿规格：
 * - position absolute, top:12, left:50%, translateX(-50%)
 * - 半透明背景 rgba(13,15,20,.7) + backdrop-filter blur(20) saturate(140%)
 * - border 1px solid var(--sg-border-secondary)，radius 8，padding 5
 * - box-shadow 0 8px 24px rgba(0,0,0,.5)
 *
 * 内部分段：
 * - 左：zoom 控件（- / N% / +）
 * - 中：分隔
 * - 右：fit-all（重排）+ panel toggle + command
 */
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
  PanelRightOpen,
  PanelRightClose,
  Command as CommandIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/stores/canvasStore";
import { usePanelStore } from "@/stores/panelStore";

interface CanvasToolbarProps {
  onRelayout: () => void;
}

export function CanvasToolbar({ onRelayout }: CanvasToolbarProps) {
  const { t } = useTranslation();
  const { zoom, setZoom, setViewport, agents } = useCanvasStore();
  const panelOpen = usePanelStore((s) => s.isOpen);
  const togglePanel = usePanelStore((s) => s.togglePanel);

  const handleZoomIn = () => setZoom(zoom + 0.1);
  const handleZoomOut = () => setZoom(zoom - 0.1);
  const handleZoomReset = () => setZoom(1);
  const handleResetView = () => {
    setViewport({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div
      className="absolute flex items-center"
      style={{
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        gap: 6,
        padding: 5,
        background: "rgba(13, 15, 20, 0.7)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: "1px solid var(--sg-border-secondary)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
        zIndex: 3,
        fontFamily: "var(--sg-font-mono)",
        fontSize: 10.5,
        color: "var(--sg-text-tertiary)",
      }}
    >
      <IconBtn
        title={t("canvas.zoomOut") ?? "Zoom out"}
        onClick={handleZoomOut}
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </IconBtn>
      <button
        type="button"
        onClick={handleZoomReset}
        className="transition-colors"
        style={{
          fontFamily: "var(--sg-font-mono)",
          fontSize: 10.5,
          fontWeight: 500,
          color: "var(--sg-text-secondary)",
          background: "transparent",
          border: "none",
          padding: "0 6px",
          height: 24,
          minWidth: 42,
          cursor: "pointer",
        }}
        title={t("canvas.resetZoom") ?? "Reset zoom"}
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconBtn title={t("canvas.zoomIn") ?? "Zoom in"} onClick={handleZoomIn}>
        <ZoomIn className="w-3.5 h-3.5" />
      </IconBtn>

      <Sep />

      <IconBtn
        title={t("canvas.resetView") ?? "Fit all"}
        onClick={handleResetView}
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </IconBtn>
      <IconBtn
        title={t("canvas.relayoutTooltip") ?? "Relayout"}
        onClick={onRelayout}
        disabled={agents.length === 0}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </IconBtn>

      <Sep />

      <IconBtn
        title={panelOpen ? "关闭面板 (⌘\\)" : "打开面板 (⌘\\)"}
        onClick={togglePanel}
      >
        {panelOpen ? (
          <PanelRightClose className="w-3.5 h-3.5" />
        ) : (
          <PanelRightOpen className="w-3.5 h-3.5" />
        )}
      </IconBtn>
      <IconBtn
        title="命令面板 (⌘K)"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("stargazer:open-command-palette"))
        }
      >
        <CommandIcon className="w-3.5 h-3.5" />
      </IconBtn>
    </div>
  );
}

/** 工具栏 icon 按钮 — 28x24 圆角 5 hover 高亮 */
function IconBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        width: 28,
        height: 24,
        borderRadius: 5,
        color: "var(--sg-text-tertiary)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--sg-font-mono)",
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
        e.currentTarget.style.color = "var(--sg-text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--sg-text-tertiary)";
      }}
    >
      {children}
    </button>
  );
}

/** 1px x 18px 竖向分隔 */
function Sep() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 18,
        background: "var(--sg-border-secondary)",
      }}
    />
  );
}
