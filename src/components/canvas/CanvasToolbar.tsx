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

  return (
    <div
      className="absolute top-3 right-4 z-10 flex items-center gap-1 rounded-lg p-1"
      style={{
        background: "rgba(22, 24, 32, 0.8)",
        backdropFilter: "blur(8px)",
        border: "1px solid #1f2128",
      }}
    >
      <button
        className="p-1.5 rounded-md hover:bg-white/10 text-[#8b92a3] hover:text-white transition-colors"
        onClick={handleZoomOut}
        title="缩小"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      <button
        className="text-[10px] text-[#8b92a3] hover:text-white min-w-[40px] text-center px-1.5 py-1 rounded-md hover:bg-white/10 transition-colors"
        onClick={handleZoomReset}
        title="点击重置为 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        className="p-1.5 rounded-md hover:bg-white/10 text-[#8b92a3] hover:text-white transition-colors"
        onClick={handleZoomIn}
        title="放大"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
      <div className="w-px h-4 bg-[#1f2128] mx-0.5" />
      <button
        className="p-1.5 rounded-md hover:bg-white/10 text-[#8b92a3] hover:text-white transition-colors"
        onClick={handleResetView}
        title="重置视图"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
