/**
 * History 视图 — 浏览 commit 历史
 *
 * - commit 列表占满侧边栏高度
 * - 顶部紧凑状态栏：显示 "N selected · hashA..hashB ✕"，未选中时显示提示
 * - 多选：单击/Cmd+toggle/Shift+range
 * - 选中变化 → 自动在右侧 Panel 打开/更新 commit-files 视图（复用同一 tab）
 */
import { useEffect, useMemo, useState } from "react";
import { X, Filter } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { usePanelStore } from "@/stores/panelStore";
import { useGitLog } from "@/hooks/useGitLog";
import { CommitRow } from "./CommitRow";
import { computeGraphLayout } from "@/lib/commitGraph";
import type { Project } from "@/types/project";
import type { GitLogEntry } from "@/services/git";

interface HistoryViewProps {
  project: Project;
}

/** 稳定的空数组引用，避免 Zustand selector 返回新引用导致无限循环 */
const EMPTY_HASHES: string[] = [];

/** commit-files tab 的稳定 id — 确保选中变化时更新同一 tab 而非新开 */
const COMMIT_FILES_TAB_ID = "commit-files";

export function HistoryView({ project }: HistoryViewProps) {
  const { entries, isLoading } = useGitLog(project.id, project.path);
  const selectedCommits = useProjectStore((s) => s.selectedCommits[project.id] ?? EMPTY_HASHES);
  const toggleCommitSelection = useProjectStore((s) => s.toggleCommitSelection);
  const clearCommitSelection = useProjectStore((s) => s.clearCommitSelection);
  const openTab = usePanelStore((s) => s.openTab);

  // 分支过滤：null 表示全部分支
  const [selectedBranches, setSelectedBranches] = useState<Set<string> | null>(null);
  const [showBranchFilter, setShowBranchFilter] = useState(false);

  // 从 entries 的 refs 中提取所有本地分支名
  const allBranches = useMemo(() => {
    const branches = new Set<string>();
    for (const e of entries) {
      for (const ref of e.refs) {
        const name = ref
          .replace(/^HEAD ->\s*/, "")
          .replace(/^tag:\s*/, "");
        // 只收集本地分支（跳过 origin/xxx 和 tag）
        if (!ref.startsWith("tag:") && !name.startsWith("origin/") && name !== "HEAD") {
          branches.add(name.trim());
        }
      }
    }
    return Array.from(branches).sort();
  }, [entries]);

  // 根据分支过滤条件筛选 commits
  const filteredEntries = useMemo(() => {
    if (!selectedBranches || selectedBranches.size === 0) return entries;
    // 从 selected branches 的 HEAD 开始做一次可达性遍历
    const reachable = new Set<string>();
    // 找到每个选中分支的 tip commit
    const tips: string[] = [];
    for (const entry of entries) {
      for (const ref of entry.refs) {
        const cleanName = ref.replace(/^HEAD ->\s*/, "").trim();
        if (selectedBranches.has(cleanName) || selectedBranches.has(cleanName.replace(/^origin\//, ""))) {
          tips.push(entry.hash);
        }
      }
    }
    const hashIndex = new Map<string, GitLogEntry>();
    for (const e of entries) hashIndex.set(e.hash, e);
    const stack = [...tips];
    while (stack.length > 0) {
      const h = stack.pop()!;
      if (reachable.has(h)) continue;
      reachable.add(h);
      const e = hashIndex.get(h);
      if (e) stack.push(...e.parents);
    }
    return entries.filter((e) => reachable.has(e.hash));
  }, [entries, selectedBranches]);

  // 计算分支图布局
  const graphLayout = useMemo(() => computeGraphLayout(filteredEntries), [filteredEntries]);

  // 计算 range 起止（按 git log 顺序：entries[0] 是最新的）
  const { from, to, rangeLabel } = useMemo(() => {
    if (selectedCommits.length === 0) return { from: null, to: null, rangeLabel: null };
    const indices = selectedCommits
      .map((h) => entries.findIndex((e) => e.hash === h))
      .filter((i) => i >= 0);
    if (indices.length === 0) return { from: null, to: null, rangeLabel: null };
    const oldestIdx = Math.max(...indices);
    const newestIdx = Math.min(...indices);
    const oldest = entries[oldestIdx];
    const newest = entries[newestIdx];
    const label =
      selectedCommits.length === 1
        ? newest.shortHash
        : `${oldest.shortHash}..${newest.shortHash}`;
    return { from: oldest.hash, to: newest.hash, rangeLabel: label };
  }, [selectedCommits, entries]);

  // 选中变化 → 自动打开/更新 commit-files 面板
  useEffect(() => {
    if (selectedCommits.length === 0 || !from || !to || !rangeLabel) return;
    openTab({
      id: COMMIT_FILES_TAB_ID,
      title: `Commit ${rangeLabel}`,
      type: "commit-files",
      filePath: "",
      projectPath: project.path,
      isDirty: false,
      diffSource:
        selectedCommits.length === 1
          ? { kind: "commit", hash: to }
          : { kind: "range", from, to },
    });
  }, [selectedCommits, from, to, rangeLabel, openTab]);

  const handleCommitClick = (e: React.MouseEvent, hash: string) => {
    const modifier: "single" | "toggle" | "range" = e.shiftKey
      ? "range"
      : e.metaKey || e.ctrlKey
        ? "toggle"
        : "single";
    const allHashes = filteredEntries.map((x) => x.hash);
    toggleCommitSelection(project.id, hash, modifier, allHashes);
  };

  const toggleBranch = (branch: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next.size === 0 ? null : next;
    });
  };

  if (isLoading && entries.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: 60, color: "#6b7280" }}
      >
        加载 commit 历史...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: 60, color: "#6b7280" }}
      >
        没有 commit 历史
      </div>
    );
  }

  const branchFilterActive = selectedBranches !== null && selectedBranches.size > 0;

  return (
    <div className="flex flex-col" style={{ position: "relative" }}>
      {/* 紧凑状态栏 */}
      <div
        className="flex items-center justify-between flex-shrink-0 select-none"
        style={{
          height: 24,
          padding: "0 8px 0 14px",
          background: "#0d0e13",
          borderBottom: "1px solid #161820",
          fontSize: 10,
        }}
      >
        <div className="flex items-center min-w-0" style={{ gap: 6, color: "#8b92a3" }}>
          {selectedCommits.length > 0 ? (
            <>
              <span style={{ color: "#4a9eff", fontWeight: 600 }}>
                {selectedCommits.length} selected
              </span>
              <span style={{ color: "#3a4150" }}>·</span>
              <span
                className="tabular-nums truncate"
                style={{ color: "#8b92a3", fontFamily: "'SF Mono', Menlo, monospace" }}
              >
                {rangeLabel}
              </span>
            </>
          ) : (
            <span style={{ color: "#4a5263" }}>
              {filteredEntries.length} commits
              {branchFilterActive && ` · ${selectedBranches!.size} branches`}
            </span>
          )}
        </div>

        <div className="flex items-center flex-shrink-0" style={{ gap: 2 }}>
          {/* 分支过滤按钮 */}
          {allBranches.length > 0 && (
            <button
              className="flex items-center justify-center rounded transition-colors"
              style={{
                width: 18,
                height: 16,
                color: branchFilterActive ? "#4a9eff" : "#8b92a3",
                background: branchFilterActive || showBranchFilter ? "rgba(74,158,255,0.12)" : "transparent",
              }}
              title="过滤分支"
              onClick={() => setShowBranchFilter((v) => !v)}
            >
              <Filter className="w-3 h-3" />
            </button>
          )}
          {/* 清空选择 */}
          {selectedCommits.length > 0 && (
            <button
              className="flex items-center justify-center rounded hover:bg-white/[0.06]"
              style={{ width: 16, height: 16, color: "#8b92a3" }}
              title="清空选择"
              onClick={() => clearCommitSelection(project.id)}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 分支过滤下拉面板 */}
      {showBranchFilter && (
        <div
          className="flex-shrink-0"
          style={{
            background: "#0d0e13",
            borderBottom: "1px solid #161820",
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{ padding: "4px 14px", fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            <span>BRANCHES</span>
            {branchFilterActive && (
              <button
                className="hover:text-white"
                style={{ color: "#4a9eff" }}
                onClick={() => setSelectedBranches(null)}
              >
                show all
              </button>
            )}
          </div>
          {allBranches.map((branch) => {
            const checked = !selectedBranches || selectedBranches.has(branch);
            return (
              <label
                key={branch}
                className="flex items-center cursor-pointer hover:bg-white/[0.04]"
                style={{ padding: "3px 14px", gap: 8, fontSize: 11 }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBranch(branch)}
                  className="w-3 h-3 accent-[#4a9eff] flex-shrink-0"
                />
                <span
                  className="truncate"
                  style={{
                    color: checked ? "#e4e6eb" : "#6b7280",
                    fontFamily: "'SF Mono', Menlo, monospace",
                  }}
                >
                  {branch}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* commit 列表 — 固定最大高度内部滚动 */}
      <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
        {filteredEntries.map((entry, idx) => (
          <CommitRow
            key={entry.hash}
            entry={entry}
            selected={selectedCommits.includes(entry.hash)}
            graphNode={graphLayout.nodes[idx]}
            totalLanes={graphLayout.maxLanes}
            onClick={handleCommitClick}
          />
        ))}
      </div>
    </div>
  );
}
