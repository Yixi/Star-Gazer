/**
 * 状态栏 - 固定在窗口底部，高度 24px
 *
 * 左：项目名、分支、总改动量
 * 右：Agent 统计、版本号
 */
import { GitBranch, Bot, FileCode } from "lucide-react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useProjectStore } from "@/stores/projectStore";

export function StatusBar() {
  const agents = useCanvasStore((s) => s.agents);
  const activeProject = useProjectStore((s) => s.activeProject);
  const gitBranch = useProjectStore((s) => s.gitBranch);
  const fileDiffStats = useProjectStore((s) => s.fileDiffStats);

  const activeAgents = agents.filter((a) => a.status === "running").length;

  // 总改动量
  const totalChanges = Object.values(fileDiffStats).reduce(
    (acc, stat) => ({
      additions: acc.additions + stat.additions,
      deletions: acc.deletions + stat.deletions,
    }),
    { additions: 0, deletions: 0 }
  );

  return (
    <footer
      className="flex items-center justify-between h-6 px-3 select-none flex-shrink-0"
      style={{
        backgroundColor: "#0d0e13",
        borderTop: "1px solid #1a1c23",
        fontSize: 10,
        color: "#8b92a3",
      }}
    >
      {/* 左侧信息 */}
      <div className="flex items-center gap-3">
        {/* 项目名 */}
        {activeProject && (
          <span className="flex items-center gap-1" style={{ color: "#b8bcc4" }}>
            {activeProject.name}
          </span>
        )}

        {/* Git 分支 */}
        <div className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          <span>{gitBranch || "main"}</span>
        </div>

        {/* 总改动量 */}
        {(totalChanges.additions > 0 || totalChanges.deletions > 0) && (
          <div className="flex items-center gap-1">
            <FileCode className="w-3 h-3" />
            {totalChanges.additions > 0 && (
              <span style={{ color: "#22c55e" }}>+{totalChanges.additions}</span>
            )}
            {totalChanges.deletions > 0 && (
              <span style={{ color: "#ef4444" }}>-{totalChanges.deletions}</span>
            )}
          </div>
        )}
      </div>

      {/* 右侧信息 */}
      <div className="flex items-center gap-3">
        {/* Agent 统计 */}
        <div className="flex items-center gap-1">
          <Bot className="w-3 h-3" />
          <span>
            {agents.length} Agent{agents.length !== 1 ? "s" : ""}
          </span>
          {activeAgents > 0 && (
            <span
              className="flex items-center gap-1 ml-0.5"
              style={{ color: "#22c55e" }}
            >
              <span className="writing-pulse" style={{ width: 4, height: 4 }} />
              <span>{activeAgents} 运行中</span>
            </span>
          )}
        </div>

        {/* 版本号 */}
        <span style={{ color: "#6b7280" }}>Star Gazer v0.1.0</span>
      </div>
    </footer>
  );
}
