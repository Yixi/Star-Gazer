/**
 * 画布工具栏 - 浮动在画布上方
 */
import { Plus, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";

export function CanvasToolbar() {
  const { zoom, setZoom, setViewport } = useCanvasStore();

  const handleZoomIn = () => setZoom(zoom + 0.1);
  const handleZoomOut = () => setZoom(zoom - 0.1);
  const handleResetView = () => {
    setViewport({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-1">
      <button
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="新建 Agent (Cmd+N)"
      >
        <Plus className="w-4 h-4" />
      </button>
      <div className="w-px h-5 bg-border" />
      <button
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        onClick={handleZoomOut}
        title="缩小"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <span className="text-xs text-muted-foreground min-w-[36px] text-center">
        {Math.round(zoom * 100)}%
      </span>
      <button
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        onClick={handleZoomIn}
        title="放大"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <div className="w-px h-5 bg-border" />
      <button
        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        onClick={handleResetView}
        title="重置视图"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </div>
  );
}
