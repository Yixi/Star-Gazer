/**
 * 状态栏 — 固定在窗口底部，高度 24px
 *
 * 显示全局信息：Git 分支、Agent 数量、缩放级别等
 * 使用 design tokens CSS 变量
 */
import { GitBranch, Bot, Zap } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useProjectStore } from "@/stores/projectStore";
import { PulsingDot } from "@/components/ui/PulsingDot";

export function StatusBar() {
  const { agents, zoom } = useCanvasStore();
  const gitBranch = useProjectStore((s) => s.gitBranch);

  const activeAgents = agents.filter((a) => a.status === "running").length;

  return (
    <footer
      className="flex items-center justify-between h-6 px-3 select-none flex-shrink-0"
      style={{
        background: "var(--sg-bg-sidebar, #0d0e13)",
        borderTop: "1px solid var(--sg-border-primary, #1a1c23)",
        fontSize: "var(--sg-text-xs, 10px)",
        color: "var(--sg-text-tertiary, #8b92a3)",
      }}
    >
      {/* 左侧信息 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          <span>{gitBranch || "main"}</span>
        </div>
        <div className="flex items-center gap-1">
          <Bot className="w-3 h-3" />
          <span>
            {agents.length} Agent{agents.length !== 1 ? "s" : ""}
          </span>
          {activeAgents > 0 && (
            <span
              className="flex items-center gap-1 ml-0.5"
              style={{ color: "var(--sg-success, #22c55e)" }}
            >
              <PulsingDot color="green" size={4} />
              <span>{activeAgents} 运行中</span>
            </span>
          )}
        </div>
      </div>

      {/* 右侧信息 */}
      <div className="flex items-center gap-3">
        <span>缩放 {Math.round(zoom * 100)}%</span>
        <span
          style={{ color: "var(--sg-text-placeholder, #4a5263)" }}
        >
          Star Gazer v0.1.0
        </span>
      </div>
    </footer>
  );
}
