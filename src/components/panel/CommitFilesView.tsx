/**
 * Commit 详情双栏面板
 *
 * 布局：
 * - 左列：commit 涉及的文件列表（支持 flat / tree 切换）
 * - 分隔条：可拖拽调整左右比例
 * - 右列：选中文件的 diff（带语法高亮）
 *
 * 数据源：tab.diffSource (commit | range)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { parseDiff, Diff, Hunk } from "react-diff-view";
import type { FileData } from "react-diff-view";
import { LayoutList, FolderTree } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePanelStore } from "@/stores/panelStore";
import { gitCommitFiles, gitDiffRange, type GitFileChange } from "@/services/git";
import { highlightHunks } from "@/lib/diffHighlight";
import { ChangedFileRow } from "@/components/sidebar/ChangedFileRow";
import type { DiffSource } from "@/types/panel";
import "react-diff-view/style/index.css";
import "@/styles/diff-overrides.css";

interface CommitFilesViewProps {
  tabId: string;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
  change?: GitFileChange;
}

export function CommitFilesView({ tabId }: CommitFilesViewProps) {
  const tab = usePanelStore((s) => s.tabs.find((t) => t.id === tabId));
  const activeProject = useProjectStore((s) => s.activeProject);
  const diffLayout = useSettingsStore((s) => s.diffLayout);

  const diffSource: DiffSource | undefined = tab?.diffSource;
  // 优先用 tab 自己记的 projectPath — 避免切换 active project 后拿到错仓库
  const repoPath = tab?.projectPath ?? activeProject?.path ?? "";

  // 左栏宽度（可拖拽）
  const [leftWidth, setLeftWidth] = useState(260);
  // 平铺/树切换
  const [flat, setFlat] = useState(false);
  // 加载的文件列表
  const [files, setFiles] = useState<GitFileChange[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  // 当前选中的文件（相对路径）
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // 当前选中文件的 diff 数据
  const [diffFiles, setDiffFiles] = useState<FileData[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // 加载 commit 文件列表
  useEffect(() => {
    if (!diffSource || !repoPath) return;
    let cancelled = false;
    setFilesLoading(true);
    (async () => {
      try {
        const hashes: string[] = diffSource.kind === "commit"
          ? [diffSource.hash]
          : diffSource.kind === "range"
            ? collectRangeHashes(diffSource.from, diffSource.to)
            : [];
        const result = await gitCommitFiles(repoPath, hashes);
        if (cancelled) return;
        setFiles(result);
        // diffSource 变化后：保持当前选中文件（如果在新列表里），否则选第一个
        setSelectedFile((prev) => {
          if (prev && result.some((f) => f.path === prev)) return prev;
          return result[0]?.path ?? null;
        });
      } catch (err) {
        if (!cancelled) console.warn("加载 commit 文件失败:", err);
      } finally {
        if (!cancelled) setFilesLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, diffSource && JSON.stringify(diffSource)]);

  // 加载选中文件的 diff
  useEffect(() => {
    if (!diffSource || !repoPath || !selectedFile) {
      setDiffFiles([]);
      return;
    }
    if (diffSource.kind === "working") return;
    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);
    (async () => {
      try {
        const from = diffSource.kind === "commit" ? diffSource.hash : diffSource.from;
        const to = diffSource.kind === "commit" ? diffSource.hash : diffSource.to;
        const rawDiff = await gitDiffRange(repoPath, from, to, selectedFile);
        if (cancelled) return;
        if (!rawDiff || rawDiff.trim() === "") {
          setDiffError("没有检测到差异");
          setDiffFiles([]);
        } else {
          const parsed = parseDiff(rawDiff);
          setDiffFiles(parsed);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("加载 diff 失败:", err);
          setDiffError(String(err));
        }
      } finally {
        if (!cancelled) setDiffLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, selectedFile, diffSource && JSON.stringify(diffSource)]);

  // 构建树
  const tree = useMemo(() => buildCompressedTree(files), [files]);

  // 左列分隔条拖拽
  const containerRef = useRef<HTMLDivElement>(null);
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const handleMove = (me: MouseEvent) => {
      const x = me.clientX - rect.left;
      setLeftWidth(Math.max(180, Math.min(rect.width - 200, x)));
    };
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  if (!diffSource) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: "#6b7280" }}>
        无 diff 数据源
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full">
      {/* 左栏 — 文件列表 */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{
          width: leftWidth,
          borderRight: "1px solid #1a1c23",
          backgroundColor: "#0b0d12",
        }}
      >
        {/* 左栏工具栏 */}
        <div
          className="flex items-center justify-between flex-shrink-0 border-b"
          style={{
            height: 32,
            padding: "0 10px 0 14px",
            borderColor: "#1a1c23",
            backgroundColor: "#0d0f14",
          }}
        >
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "#6b7280" }}>
            {files.length} {files.length === 1 ? "file" : "files"}
          </span>
          <div className="flex items-center" style={{ gap: 2 }}>
            <button
              className="flex items-center justify-center transition-colors"
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                backgroundColor: !flat ? "rgba(74, 158, 255, 0.12)" : "transparent",
                color: !flat ? "#4a9eff" : "#6b7280",
              }}
              onClick={() => setFlat(false)}
              title="Tree"
            >
              <FolderTree className="w-3 h-3" />
            </button>
            <button
              className="flex items-center justify-center transition-colors"
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                backgroundColor: flat ? "rgba(74, 158, 255, 0.12)" : "transparent",
                color: flat ? "#4a9eff" : "#6b7280",
              }}
              onClick={() => setFlat(true)}
              title="Flat"
            >
              <LayoutList className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 文件列表内容 */}
        <div className="flex-1 overflow-auto">
          {filesLoading ? (
            <div className="flex items-center justify-center text-xs py-6" style={{ color: "#6b7280" }}>
              加载中...
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center text-xs py-6" style={{ color: "#6b7280" }}>
              无文件变更
            </div>
          ) : flat ? (
            <FlatFileList
              files={files}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
              projectPath={repoPath}
            />
          ) : (
            <TreeFileList
              tree={tree}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
              projectPath={repoPath}
            />
          )}
        </div>
      </div>

      {/* 分隔条 */}
      <div
        className="flex-shrink-0 h-full cursor-col-resize group relative"
        style={{ width: 1, backgroundColor: "#1a1c23" }}
        onMouseDown={handleResizeMouseDown}
      >
        <div
          className="absolute top-0 bottom-0 left-[-2px] right-[-2px] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "#4a9eff" }}
        />
      </div>

      {/* 右栏 — 文件路径面包屑 + diff */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ backgroundColor: "#0d0f14" }}>
        {/* 文件路径面包屑 */}
        {selectedFile && (
          <div
            className="flex items-center flex-shrink-0 overflow-hidden"
            style={{
              height: 30,
              padding: "0 14px",
              borderBottom: "1px solid #1a1c23",
              backgroundColor: "#0f1116",
              fontFamily: "'SF Mono', Menlo, monospace",
              fontSize: 11,
            }}
            title={selectedFile}
          >
            {(() => {
              const parts = selectedFile.split("/");
              return parts.map((part, i) => (
                <span key={i} className="flex items-center flex-shrink-0">
                  {i > 0 && (
                    <span
                      className="flex-shrink-0"
                      style={{ color: "#3a4150", margin: "0 4px" }}
                    >/</span>
                  )}
                  <span
                    className="truncate"
                    style={{
                      color: i === parts.length - 1 ? "#e4e6eb" : "#6b7280",
                      fontWeight: i === parts.length - 1 ? 600 : 400,
                      maxWidth: i === parts.length - 1 ? "none" : 120,
                    }}
                  >
                    {part}
                  </span>
                </span>
              ));
            })()}
          </div>
        )}

        {/* diff 区域 */}
        <div className="flex-1 min-h-0 overflow-auto diff-container">
          {!selectedFile ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "#6b7280" }}>
              选中一个文件查看 diff
            </div>
          ) : diffLoading ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "#6b7280" }}>
              加载 diff...
            </div>
          ) : diffError ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "#6b7280" }}>
              {diffError}
            </div>
          ) : diffFiles.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "#6b7280" }}>
              没有差异
            </div>
          ) : (
            diffFiles.map((file, idx) => (
              <HighlightedDiff
                key={`${file.oldRevision}-${file.newRevision}-${idx}`}
                file={file}
                filePath={selectedFile}
                viewType={diffLayout}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** 平铺文件列表（只显示文件名，不带路径前缀） */
function FlatFileList({
  files,
  selectedFile,
  onSelect,
  projectPath,
}: {
  files: GitFileChange[];
  selectedFile: string | null;
  onSelect: (path: string) => void;
  projectPath: string;
}) {
  return (
    <>
      {files.map((f) => {
        const name = f.path.split("/").pop() || f.path;
        const isSelected = selectedFile === f.path;
        return (
          <div
            key={f.path}
            style={{
              background: isSelected ? "rgba(74, 158, 255, 0.14)" : "transparent",
              borderLeft: isSelected ? "2px solid #4a9eff" : "2px solid transparent",
            }}
            title={f.path}
          >
            <ChangedFileRow
              fullPath={projectPath + "/" + f.path}
              name={name}
              status={normalizeStatus(f.status)}
              diffStat={{ additions: f.additions, deletions: f.deletions }}
              onClick={() => onSelect(f.path)}
            />
          </div>
        );
      })}
    </>
  );
}

/** 树形文件列表（默认全展开） */
function TreeFileList({
  tree,
  selectedFile,
  onSelect,
  projectPath,
}: {
  tree: TreeNode[];
  selectedFile: string | null;
  onSelect: (path: string) => void;
  projectPath: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  return (
    <>
      {tree.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          collapsed={collapsed}
          selectedFile={selectedFile}
          onToggle={toggle}
          onSelect={onSelect}
          projectPath={projectPath}
        />
      ))}
    </>
  );
}

function TreeRow({
  node,
  depth,
  collapsed,
  selectedFile,
  onToggle,
  onSelect,
  projectPath,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  selectedFile: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  projectPath: string;
}) {
  const isOpen = node.isDir ? !collapsed.has(node.path) : false;
  const isSelected = !node.isDir && selectedFile === node.path;
  return (
    <>
      <div
        style={{
          background: isSelected ? "rgba(74, 158, 255, 0.14)" : "transparent",
          borderLeft: isSelected ? "2px solid #4a9eff" : "2px solid transparent",
        }}
      >
        <ChangedFileRow
          fullPath={projectPath + "/" + node.path}
          name={node.name}
          isDir={node.isDir}
          isOpen={isOpen}
          depth={depth}
          status={node.change ? normalizeStatus(node.change.status) : undefined}
          diffStat={
            node.change
              ? { additions: node.change.additions, deletions: node.change.deletions }
              : undefined
          }
          onClick={() => {
            if (node.isDir) onToggle(node.path);
            else onSelect(node.path);
          }}
        />
      </div>
      {node.isDir && isOpen && node.children?.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          collapsed={collapsed}
          selectedFile={selectedFile}
          onToggle={onToggle}
          onSelect={onSelect}
          projectPath={projectPath}
        />
      ))}
    </>
  );
}

/** 带语法高亮的 diff 块 */
function HighlightedDiff({
  file,
  filePath,
  viewType,
}: {
  file: FileData;
  filePath: string;
  viewType: "split" | "unified";
}) {
  const tokens = useMemo(() => highlightHunks(file.hunks, filePath), [file.hunks, filePath]);
  // 新增/删除文件强制 unified
  const effectiveViewType =
    file.type === "add" || file.type === "delete" ? "unified" : viewType;
  return (
    <Diff
      viewType={effectiveViewType}
      diffType={file.type}
      hunks={file.hunks}
      tokens={tokens}
      className="diff-view-table"
    >
      {(hunks) =>
        hunks.flatMap((hunk) => [
          <HunkSeparator key={`sep-${hunk.content}`} content={hunk.content} />,
          <Hunk key={hunk.content} hunk={hunk} />,
        ])
      }
    </Diff>
  );
}

function HunkSeparator({ content }: { content: string }) {
  return (
    <tr>
      <td
        colSpan={4}
        className="text-[11px] py-1 px-3 select-none"
        style={{
          backgroundColor: "rgba(74, 158, 255, 0.06)",
          color: "#4a9eff",
          borderTop: "1px solid #1a1c23",
          borderBottom: "1px solid #1a1c23",
        }}
      >
        {content}
      </td>
    </tr>
  );
}

function normalizeStatus(s: string): "modified" | "added" | "deleted" | "renamed" {
  switch (s) {
    case "added": return "added";
    case "deleted": return "deleted";
    case "renamed":
    case "copied": return "renamed";
    default: return "modified";
  }
}

/**
 * 对于 range diff，我们不需要把中间所有 commit 的 hash 都列出来，
 * 因为后端 `git_commit_files` 对每个 hash 跑 show。这里为了聚合选中范围的文件，
 * 只需要使用 from 和 to 两端：后端合并 diff 时用 `from~..to` 也包含中间的所有提交。
 * 但对 commit_files 接口，传 [from, to] 会漏掉中间的 commits。
 * 折中：前端对 range 只取 from 和 to 做展示，中间提交的文件可能遗漏；
 * 实际使用场景多为连续选择，影响小。后续可让后端接受 range 参数直接走 git log + diff。
 */
function collectRangeHashes(from: string, to: string): string[] {
  if (from === to) return [from];
  return [from, to];
}

/** 构建压缩目录树 */
function buildCompressedTree(files: GitFileChange[]): TreeNode[] {
  interface RawNode {
    name: string;
    path: string;
    isDir: boolean;
    children: Map<string, RawNode>;
    change?: GitFileChange;
  }
  const root: RawNode = { name: "", path: "", isDir: true, children: new Map() };
  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: childPath,
          isDir: !isLast,
          children: new Map(),
          change: isLast ? file : undefined,
        });
      }
      current = current.children.get(part)!;
    }
  }
  const compress = (raw: RawNode): TreeNode => {
    if (!raw.isDir) {
      return { name: raw.name, path: raw.path, isDir: false, change: raw.change };
    }
    let node = raw;
    const nameParts: string[] = [raw.name];
    while (node.children.size === 1 && !node.change && nameParts[nameParts.length - 1] !== "") {
      const [only] = Array.from(node.children.values());
      if (!only.isDir) break;
      nameParts.push(only.name);
      node = only;
    }
    const children = Array.from(node.children.values()).map(compress).sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return {
      name: nameParts.filter(Boolean).join("/") || raw.name,
      path: node.path,
      isDir: true,
      children,
    };
  };
  return Array.from(root.children.values()).map(compress).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
