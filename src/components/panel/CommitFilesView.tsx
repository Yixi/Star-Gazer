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
import { parseDiff, Diff, Hunk, Decoration } from "react-diff-view";
import type { FileData } from "react-diff-view";
import { LayoutList, FolderTree } from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePanelStore } from "@/stores/panelStore";
import { gitCommitFiles, gitDiffRange, type GitFileChange } from "@/services/git";
import { highlightHunks, detectEffectiveDiffType } from "@/lib/diffHighlight";
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

/**
 * 模块级 commit range 文件列表缓存
 *
 * commit range 指向不可变的历史引用（from/to 都是 hash），结果永远不变，
 * 适合做强缓存。缓存键 `repoPath|from..to`，限量 30 条 LRU，避免无限增长。
 * 快速来回切换 commit 时可以直接命中，不再触发后端 git 子进程。
 */
const FILES_CACHE = new Map<string, GitFileChange[]>();
const FILES_CACHE_MAX = 30;
function filesCacheKey(repoPath: string, from: string, to: string) {
  return `${repoPath}|${from}..${to}`;
}
function filesCacheGet(key: string): GitFileChange[] | undefined {
  const val = FILES_CACHE.get(key);
  if (val) {
    // LRU：命中后搬到最新
    FILES_CACHE.delete(key);
    FILES_CACHE.set(key, val);
  }
  return val;
}
function filesCacheSet(key: string, value: GitFileChange[]) {
  if (FILES_CACHE.has(key)) FILES_CACHE.delete(key);
  FILES_CACHE.set(key, value);
  while (FILES_CACHE.size > FILES_CACHE_MAX) {
    const firstKey = FILES_CACHE.keys().next().value;
    if (firstKey === undefined) break;
    FILES_CACHE.delete(firstKey);
  }
}

export function CommitFilesView({ tabId }: CommitFilesViewProps) {
  const tab = usePanelStore((s) => s.tabs.find((t) => t.id === tabId));
  const activeProject = useProjectStore((s) => s.activeProject);
  const diffLayout = useSettingsStore((s) => s.diffLayout);

  const diffSource: DiffSource | undefined = tab?.diffSource;
  // 优先用 tab 自己记的 projectPath — 避免切换 active project 后拿到错仓库
  const repoPath = tab?.projectPath ?? activeProject?.path ?? "";
  // 稳定 diffSource 的标识，避免 JSON.stringify 作为依赖每次都产生新引用
  const diffSourceKey = useMemo(() => {
    if (!diffSource) return "none";
    if (diffSource.kind === "working") return "working";
    if (diffSource.kind === "commit") return `commit:${diffSource.hash}`;
    return `range:${diffSource.from}..${diffSource.to}`;
  }, [diffSource]);

  // 左栏宽度（可拖拽）
  const [leftWidth, setLeftWidth] = useState(260);
  // 平铺/树切换
  const [flat, setFlat] = useState(false);
  // 加载的文件列表
  const [files, setFiles] = useState<GitFileChange[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);
  // 当前选中的文件（相对路径）
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // 当前选中文件的 diff 数据
  const [diffFiles, setDiffFiles] = useState<FileData[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // 加载 commit range 涉及的文件列表（后端走一次 git diff，不漏掉中间 commit）
  useEffect(() => {
    if (!diffSource || !repoPath) return;
    if (diffSource.kind === "working") return;

    // 提取 from/to — commit 和 range 两种形态统一
    const from = diffSource.kind === "commit" ? diffSource.hash : diffSource.from;
    const to = diffSource.kind === "commit" ? diffSource.hash : diffSource.to;

    // range 一旦变化，立刻清空旧文件列表和选中文件，避免 UI 显示陈旧数据
    // （关键修复：之前 catch 只 console.warn，失败时旧列表会残留）
    setFilesError(null);

    // 缓存命中：同步返回，完全不触发 loading，避免来回切换时的闪烁
    const key = filesCacheKey(repoPath, from, to);
    const cached = filesCacheGet(key);
    if (cached) {
      setFiles(cached);
      setFilesLoading(false);
      setSelectedFile((prev) => {
        if (prev && cached.some((f) => f.path === prev)) return prev;
        return cached[0]?.path ?? null;
      });
      return;
    }

    // 缓存未命中：清空展示 + 进入 loading，等待后端返回
    setFiles([]);
    setSelectedFile(null);
    setFilesLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const result = await gitCommitFiles(repoPath, from, to);
        if (cancelled) return;
        filesCacheSet(key, result);
        setFiles(result);
        setSelectedFile(result[0]?.path ?? null);
      } catch (err) {
        if (cancelled) return;
        console.warn("加载 commit 文件失败:", err);
        setFiles([]);
        setSelectedFile(null);
        setFilesError(String(err));
      } finally {
        if (!cancelled) setFilesLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, diffSourceKey]);

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
  }, [repoPath, selectedFile, diffSourceKey]);

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
          borderRight: "1px solid var(--sg-border-primary)",
          backgroundColor: "var(--sg-bg-sidebar)",
        }}
      >
        {/* 左栏工具栏 */}
        <div
          className="flex items-center justify-between flex-shrink-0 border-b"
          style={{
            height: 32,
            padding: "0 10px 0 14px",
            borderColor: "var(--sg-border-primary)",
            backgroundColor: "var(--sg-bg-code)",
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
          ) : filesError ? (
            <div
              className="text-xs py-4 px-3 whitespace-pre-wrap break-words"
              style={{ color: "#ef4444" }}
            >
              加载失败：{filesError}
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
        style={{ width: 1, backgroundColor: "var(--sg-border-primary)" }}
        onMouseDown={handleResizeMouseDown}
      >
        <div
          className="absolute top-0 bottom-0 left-[-2px] right-[-2px] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "#4a9eff" }}
        />
      </div>

      {/* 右栏 — 文件路径面包屑 + diff */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ backgroundColor: "var(--sg-bg-code)" }}>
        {/* 文件路径面包屑 */}
        {selectedFile && (
          <div
            className="flex items-center flex-shrink-0 overflow-hidden"
            style={{
              height: 30,
              padding: "0 14px",
              borderBottom: "1px solid var(--sg-border-primary)",
              backgroundColor: "var(--sg-bg-canvas)",
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
  // 按 hunk 内容检测有效 diff 类型，让 react-diff-view 的 monotonous 单列渲染接管
  // 纯新增/纯删除文件（见 diffHighlight.ts 注释）
  const effectiveType = useMemo(() => detectEffectiveDiffType(file), [file]);
  return (
    <Diff
      viewType={viewType}
      diffType={effectiveType}
      hunks={file.hunks}
      tokens={tokens}
      className="diff-view-table"
    >
      {(hunks) =>
        hunks.flatMap((hunk) => [
          <Decoration key={`sep-${hunk.content}`} className="diff-hunk-header">
            {hunk.content}
          </Decoration>,
          <Hunk key={hunk.content} hunk={hunk} />,
        ])
      }
    </Diff>
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
