/**
 * History 视图 — 浏览 commit 历史
 *
 * 上下分栏：
 * - 上段：commit 列表（支持单选/Cmd+toggle/Shift+range）
 * - 分隔条：可拖拽调整比例，显示 "N selected · shortA..shortB ✕"
 * - 下段：选中 commit 涉及的文件列表（复用 ChangedFileRow）
 *
 * 点击文件 → Panel 打开对应 range 的 diff
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, GitPullRequestArrow } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { usePanelStore } from "@/stores/panelStore";
import { useGitLog } from "@/hooks/useGitLog";
import { CommitRow } from "./CommitRow";
import { ChangedFileRow } from "./ChangedFileRow";
import { gitCommitFiles, type GitFileChange } from "@/services/git";
import type { Project } from "@/types/project";

interface HistoryViewProps {
  project: Project;
}

const DEFAULT_SPLIT = 0.55;
const CONTAINER_HEIGHT = 480; // 默认显示高度，会被内容撑开或 flex 压缩

/** 稳定的空数组引用，避免 Zustand selector 返回新引用导致无限循环 */
const EMPTY_HASHES: string[] = [];

export function HistoryView({ project }: HistoryViewProps) {
  const { entries, isLoading } = useGitLog(project.id, project.path);
  const selectedCommits = useProjectStore((s) => s.selectedCommits[project.id] ?? EMPTY_HASHES);
  const splitRatio = useProjectStore((s) => s.historySplit[project.id] ?? DEFAULT_SPLIT);
  const flat = useProjectStore((s) => s.flatModes[project.id] ?? false);
  const toggleCommitSelection = useProjectStore((s) => s.toggleCommitSelection);
  const clearCommitSelection = useProjectStore((s) => s.clearCommitSelection);
  const setHistorySplit = useProjectStore((s) => s.setHistorySplit);
  const openTab = usePanelStore((s) => s.openTab);
  const openPanel = usePanelStore((s) => s.openPanel);

  // 下半区的文件列表：根据 selectedCommits 动态加载
  const [commitFiles, setCommitFiles] = useState<GitFileChange[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  useEffect(() => {
    if (selectedCommits.length === 0) {
      setCommitFiles([]);
      return;
    }
    setFilesLoading(true);
    (async () => {
      try {
        const files = await gitCommitFiles(project.path, selectedCommits);
        setCommitFiles(files);
      } catch (err) {
        console.warn("获取 commit 文件失败:", err);
      } finally {
        setFilesLoading(false);
      }
    })();
  }, [selectedCommits, project.path]);

  // 计算 range 起止（按 git log 顺序：entries[0] 是最新的）
  const { from, to, rangeLabel } = useMemo(() => {
    if (selectedCommits.length === 0) return { from: null, to: null, rangeLabel: null };
    const indices = selectedCommits
      .map((h) => entries.findIndex((e) => e.hash === h))
      .filter((i) => i >= 0);
    if (indices.length === 0) return { from: null, to: null, rangeLabel: null };
    // 最旧的 index 最大，最新的最小
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

  // commit 行点击
  const handleCommitClick = (e: React.MouseEvent, hash: string) => {
    const modifier: "single" | "toggle" | "range" = e.shiftKey
      ? "range"
      : e.metaKey || e.ctrlKey
        ? "toggle"
        : "single";
    const allHashes = entries.map((x) => x.hash);
    toggleCommitSelection(project.id, hash, modifier, allHashes);
  };

  // 文件行点击 → 打开 range diff
  const handleFileClick = (relPath: string) => {
    if (!from || !to) return;
    const fullPath = project.path + "/" + relPath;
    const tabId =
      selectedCommits.length === 1
        ? `${to}:${fullPath}`
        : `${from}..${to}:${fullPath}`;
    openTab({
      id: tabId,
      title: relPath.split("/").pop() || relPath,
      type: "diff",
      filePath: fullPath,
      isDirty: false,
      diffSource:
        selectedCommits.length === 1
          ? { kind: "commit", hash: to }
          : { kind: "range", from, to },
    });
    openPanel();
  };

  // Diff all selected — 整体 range（不绑定文件）
  const handleDiffAll = () => {
    if (!from || !to || !rangeLabel) return;
    const tabId = `${from}..${to}`;
    openTab({
      id: tabId,
      title: `Diff ${rangeLabel}`,
      type: "diff",
      filePath: "",
      isDirty: false,
      diffSource:
        selectedCommits.length === 1
          ? { kind: "commit", hash: to }
          : { kind: "range", from, to },
    });
    openPanel();
  };

  // 分隔条拖拽
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const handleSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const handleMove = (me: MouseEvent) => {
      if (!isDraggingRef.current || !rect) return;
      const y = me.clientY - rect.top;
      const ratio = y / rect.height;
      setHistorySplit(project.id, ratio);
    };
    const handleUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
    };

    document.body.style.cursor = "row-resize";
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
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

  const topHeight = Math.floor(CONTAINER_HEIGHT * splitRatio);
  const bottomHeight = CONTAINER_HEIGHT - topHeight - 24; // 减去分隔条 24px

  return (
    <div ref={containerRef} className="flex flex-col" style={{ height: CONTAINER_HEIGHT }}>
      {/* 上段 — commit 列表 */}
      <div className="overflow-y-auto" style={{ height: topHeight }}>
        {entries.map((entry) => (
          <CommitRow
            key={entry.hash}
            entry={entry}
            selected={selectedCommits.includes(entry.hash)}
            onClick={handleCommitClick}
          />
        ))}
      </div>

      {/* 分隔条 + 选区信息 */}
      <div
        className="flex items-center justify-between flex-shrink-0 select-none"
        style={{
          height: 24,
          padding: "0 12px",
          background: "#0d0e13",
          borderTop: "1px solid #1a1c23",
          borderBottom: "1px solid #1a1c23",
          cursor: "row-resize",
          fontSize: 10,
        }}
        onMouseDown={handleSplitMouseDown}
      >
        <div className="flex items-center" style={{ gap: 6, color: "#8b92a3" }}>
          {selectedCommits.length > 0 ? (
            <>
              <span style={{ color: "#4a9eff", fontWeight: 600 }}>
                {selectedCommits.length} selected
              </span>
              <span style={{ color: "#3a4150" }}>·</span>
              <span
                className="tabular-nums"
                style={{ color: "#8b92a3", fontFamily: "'SF Mono', Menlo, monospace" }}
              >
                {rangeLabel}
              </span>
            </>
          ) : (
            <span style={{ color: "#4a5263" }}>Select commits to inspect files</span>
          )}
        </div>

        <div className="flex items-center" style={{ gap: 4 }}>
          {selectedCommits.length > 0 && (
            <>
              <button
                className="flex items-center justify-center rounded hover:bg-white/[0.06]"
                style={{ width: 16, height: 16, color: "#8b92a3" }}
                title="Diff all selected"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDiffAll();
                }}
              >
                <GitPullRequestArrow className="w-3 h-3" />
              </button>
              <button
                className="flex items-center justify-center rounded hover:bg-white/[0.06]"
                style={{ width: 16, height: 16, color: "#8b92a3" }}
                title="清空选择"
                onClick={(e) => {
                  e.stopPropagation();
                  clearCommitSelection(project.id);
                }}
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 下段 — 文件列表 */}
      <div className="overflow-y-auto" style={{ height: Math.max(60, bottomHeight) }}>
        {selectedCommits.length === 0 ? (
          <div
            className="flex items-center justify-center text-xs"
            style={{ height: 60, color: "#4a5263" }}
          >
            选中 commit 查看文件变更
          </div>
        ) : filesLoading ? (
          <div
            className="flex items-center justify-center text-xs"
            style={{ height: 60, color: "#6b7280" }}
          >
            加载文件列表...
          </div>
        ) : commitFiles.length === 0 ? (
          <div
            className="flex items-center justify-center text-xs"
            style={{ height: 60, color: "#6b7280" }}
          >
            无文件变更
          </div>
        ) : (
          <CommitFileList
            files={commitFiles}
            projectPath={project.path}
            flat={flat}
            onClick={handleFileClick}
          />
        )}
      </div>
    </div>
  );
}

/** 选中 commit 的文件列表渲染 */
function CommitFileList({
  files,
  projectPath,
  flat,
  onClick,
}: {
  files: GitFileChange[];
  projectPath: string;
  flat: boolean;
  onClick: (relPath: string) => void;
}) {
  if (flat) {
    return (
      <>
        {files.map((f) => {
          const parts = f.path.split("/");
          const name = parts.pop() || f.path;
          const prefix = parts.length > 0 ? parts.join("/") + "/" : undefined;
          return (
            <ChangedFileRow
              key={f.path}
              fullPath={projectPath + "/" + f.path}
              name={name}
              pathPrefix={prefix}
              status={normalizeFileStatus(f.status)}
              diffStat={{ additions: f.additions, deletions: f.deletions }}
              onClick={() => onClick(f.path)}
            />
          );
        })}
      </>
    );
  }
  // 简化树模式：按目录分组一级
  // 为保持与 ChangesView 一致的视觉和行为，使用相同的压缩树展示
  // 这里简化：直接用 flat 列表（可后续迭代加目录）
  return (
    <>
      {files.map((f) => {
        const parts = f.path.split("/");
        const name = parts.pop() || f.path;
        const prefix = parts.length > 0 ? parts.join("/") + "/" : undefined;
        return (
          <ChangedFileRow
            key={f.path}
            fullPath={projectPath + "/" + f.path}
            name={name}
            pathPrefix={prefix}
            status={normalizeFileStatus(f.status)}
            diffStat={{ additions: f.additions, deletions: f.deletions }}
            onClick={() => onClick(f.path)}
          />
        );
      })}
    </>
  );
}

function normalizeFileStatus(s: string): "modified" | "added" | "deleted" | "renamed" {
  switch (s) {
    case "added": return "added";
    case "deleted": return "deleted";
    case "renamed":
    case "copied": return "renamed";
    default: return "modified";
  }
}
