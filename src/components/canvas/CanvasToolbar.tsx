/**
 * 画布工具栏 - 浮动在画布右上角
 * 参考 Mockup 样式：半透明背景 + 模糊效果
 */
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";

export function CanvasToolbar() {
  const { zoom, setZoom, setViewport } = useCanvasStore();

  const handleZoomIn = () => setZoom(zoom + 0.1);
  const handleZoomOut = () => setZoom(zoom - 0.1);
  const handleResetView = () => {
    setViewport({ x: 0, y: 0 });
    setZoom(1);
  };

  /** 点击缩放百分比重置为 100% */
  const handleZoomReset = () => {
    setZoom(1);
  };

  const pillStyle: React.CSSProperties = {
    padding: "5px 10px",
    background: "color-mix(in srgb, var(--sg-bg-card) 80%, transparent)",
    backdropFilter: "blur(8px)",
    borderRadius: 5,
    border: "1px solid var(--sg-border-secondary)",
  };

  return (
    <div
      className="absolute z-10 flex items-center text-[10px] text-[#8b92a3]"
      style={{ top: 12, right: 16, gap: 6 }}
    >
      {/* 缩放控件 pill */}
      <div className="flex items-center gap-1" style={pillStyle}>
        <button
          className="p-1 rounded hover:bg-white/10 hover:text-white transition-colors"
          onClick={handleZoomOut}
          title="缩小"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          className="hover:text-white min-w-[36px] text-center px-1 rounded hover:bg-white/10 transition-colors"
          onClick={handleZoomReset}
          title="点击重置为 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          className="p-1 rounded hover:bg-white/10 hover:text-white transition-colors"
          onClick={handleZoomIn}
          title="放大"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3.5 bg-[#1f2128] mx-0.5" />
        <button
          className="p-1 rounded hover:bg-white/10 hover:text-white transition-colors"
          onClick={handleResetView}
          title="重置视图"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* 布局模式 pill */}
      <button
        className="hover:text-white hover:bg-white/10 transition-colors"
        style={pillStyle}
        title="布局模式"
      >
        Layout: default
      </button>
    </div>
  );
}
