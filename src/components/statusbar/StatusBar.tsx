/**
 * 状态栏 - 固定在窗口底部，高度 24px
 * 显示全局信息：Git 分支、Agent 数量、缩放级别等
 */
import { GitBranch, Bot, Zap } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";

export function StatusBar() {
  const { agents, zoom } = useCanvasStore();

  const activeAgents = agents.filter((a) => a.status === "running").length;

  return (
    <footer className="flex items-center justify-between h-6 px-3 bg-card border-t border-border text-[11px] text-muted-foreground select-none">
      {/* 左侧信息 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          <span>main</span>
        </div>
        <div className="flex items-center gap-1">
          <Bot className="w-3 h-3" />
          <span>
            {agents.length} Agent{agents.length !== 1 ? "s" : ""}
          </span>
          {activeAgents > 0 && (
            <span className="flex items-center gap-0.5 text-agent-green">
              <Zap className="w-2.5 h-2.5" />
              {activeAgents} 运行中
            </span>
          )}
        </div>
      </div>

      {/* 右侧信息 */}
      <div className="flex items-center gap-3">
        <span>缩放 {Math.round(zoom * 100)}%</span>
        <span>Star Gazer v0.1.0</span>
      </div>
    </footer>
  );
}
