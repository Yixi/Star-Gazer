/**
 * 状态栏 - 固定在窗口底部
 *
 * 设计稿规格：
 * - padding: 6px 16px
 * - gap: 14px
 * - font-size: 10px
 * - color: #8b92a3
 * - 分隔符: · (middle dot), color: #3a4150
 * - 左侧: stargazer-app · main · +168 -28 across 7 files
 * - 右侧: 3 agents · 2 running · 1 waiting
 */
import { useCanvasStore } from "@/stores/canvasStore";
import { useProjectStore } from "@/stores/projectStore";

const Dot = () => <span style={{ color: '#3a4150' }}>·</span>;

export function StatusBar() {
  const agents = useCanvasStore((s) => s.agents);
  const activeProject = useProjectStore((s) => s.activeProject);
  const gitBranch = useProjectStore((s) => s.gitBranch);
  const fileDiffStats = useProjectStore((s) => s.fileDiffStats);

  const activeAgents = agents.filter((a) => a.status === "running").length;
  const waitingAgents = agents.filter((a) => a.status === "waiting").length;

  // 文件数
  const fileCount = Object.keys(fileDiffStats).length;

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
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        backgroundColor: '#0d0e13',
        borderTop: '1px solid #1a1c23',
        fontSize: 10,
        color: '#8b92a3',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* 左侧: 项目名 · 分支 · 改动统计 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {activeProject && (
          <span>{activeProject.name}</span>
        )}
        {activeProject && (
          <>
            <Dot />
            <span>{gitBranch || "main"}</span>
          </>
        )}
        {(totalChanges.additions > 0 || totalChanges.deletions > 0) && (
          <>
            <Dot />
            <span>
              {totalChanges.additions > 0 && (
                <span style={{ color: '#22c55e' }}>+{totalChanges.additions}</span>
              )}
              {totalChanges.additions > 0 && totalChanges.deletions > 0 && ' '}
              {totalChanges.deletions > 0 && (
                <span style={{ color: '#ef4444' }}>-{totalChanges.deletions}</span>
              )}
              {fileCount > 0 && (
                <span> across {fileCount} files</span>
              )}
            </span>
          </>
        )}
      </div>

      {/* 右侧: Agent 统计 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span>{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
        {activeAgents > 0 && (
          <>
            <Dot />
            <span style={{ color: '#22c55e' }}>{activeAgents} running</span>
          </>
        )}
        {waitingAgents > 0 && (
          <>
            <Dot />
            <span style={{ color: '#febc2e' }}>{waitingAgents} waiting</span>
          </>
        )}
      </div>
    </footer>
  );
}
