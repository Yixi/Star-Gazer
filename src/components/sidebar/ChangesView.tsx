/**
 * Changes 视图 — 只展示本次未提交的变更文件
 *
 * 两种排版：
 * - tree：压缩目录树（VS Code 风格，折叠只有单子节点的目录链）
 * - flat：拍平列表，文件名前显示相对路径前缀
 *
 * 顶部小工具栏显示统计（N changed · +A -D）
 * 点击文件 → Panel 打开 working diff
 */
import { useMemo, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { usePanelStore } from "@/stores/panelStore";
import { ChangedFileRow } from "./ChangedFileRow";
import { CommitBar } from "./CommitBar";
import type { Project } from "@/types/project";
import type { GitFileChange } from "@/services/git";

interface ChangesViewProps {
  project: Project;
}

/** 合并后的变更条目 */
interface MergedChange {
  path: string;
  status: "modified" | "added" | "deleted" | "untracked" | "renamed";
  additions: number;
  deletions: number;
}

/** 压缩树节点 */
interface TreeNode {
  name: string;          // 显示名（可能是 "a/b/c"，多段压缩）
  path: string;          // 相对路径（基于 project）
  isDir: boolean;
  children?: TreeNode[];
  change?: MergedChange;
}

export function ChangesView({ project }: ChangesViewProps) {
  const gitStatus = useProjectStore((s) => s.gitStatusByProject[project.id]);
  const flat = useProjectStore((s) => s.flatMode);
  const openTab = usePanelStore((s) => s.openTab);
  const openPanel = usePanelStore((s) => s.openPanel);

  // 合并 staged + unstaged + untracked，去重（以 unstaged 优先）
  const changes: MergedChange[] = useMemo(() => {
    if (!gitStatus) return [];
    const map = new Map<string, MergedChange>();
    const add = (c: GitFileChange) => {
      const existing = map.get(c.path);
      const status = normalizeStatus(c.status);
      if (existing) {
        existing.additions += c.additions;
        existing.deletions += c.deletions;
      } else {
        map.set(c.path, {
          path: c.path,
          status,
          additions: c.additions,
          deletions: c.deletions,
        });
      }
    };
    for (const c of gitStatus.staged) add(c);
    for (const c of gitStatus.unstaged) add(c);
    for (const path of gitStatus.untracked) {
      if (!map.has(path)) {
        map.set(path, { path, status: "untracked", additions: 0, deletions: 0 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
  }, [gitStatus]);

  // 统计
  const totalAdd = changes.reduce((sum, c) => sum + c.additions, 0);
  const totalDel = changes.reduce((sum, c) => sum + c.deletions, 0);

  const handleClickFile = (relPath: string) => {
    const fullPath = project.path + "/" + relPath;
    openTab({
      id: fullPath,
      title: relPath.split("/").pop() || relPath,
      type: "diff",
      filePath: fullPath,
      projectPath: project.path,
      isPreview: true,
      isDirty: false,
      diffSource: { kind: "working" },
    });
    openPanel();
  };

  if (!gitStatus) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: 60, color: "#6b7280" }}
      >
        加载 git 状态...
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Commit / Push / Pull / Fetch 操作条 — 即使没有本地改动也常驻，方便 sync */}
      <CommitBar project={project} />

      {changes.length === 0 ? (
        <div
          className="flex items-center justify-center text-xs"
          style={{ height: 48, color: "#6b7280" }}
        >
          没有未提交的变更
        </div>
      ) : (
        <>
          {/* 顶部统计 */}
          <div
            className="flex items-center justify-between flex-shrink-0"
            style={{
              padding: "4px 14px",
              fontSize: 10,
              color: "#6b7280",
              fontFamily: "'SF Mono', Menlo, monospace",
            }}
          >
            <span>{changes.length} changed</span>
            <span className="tabular-nums" style={{ gap: 4 }}>
              {totalAdd > 0 && <span style={{ color: "#22c55e" }}>+{totalAdd} </span>}
              {totalDel > 0 && <span style={{ color: "#ef4444" }}>-{totalDel}</span>}
            </span>
          </div>

          {/* 文件列表 */}
          {flat ? (
            <FlatList changes={changes} onClick={handleClickFile} projectPath={project.path} />
          ) : (
            <TreeList changes={changes} onClick={handleClickFile} projectPath={project.path} />
          )}
        </>
      )}
    </div>
  );
}

/** 拍平列表 — 只显示文件名，完整相对路径走 hover tooltip */
function FlatList({
  changes,
  onClick,
  projectPath,
}: {
  changes: MergedChange[];
  onClick: (relPath: string) => void;
  projectPath: string;
}) {
  return (
    <>
      {changes.map((c) => {
        const name = c.path.split("/").pop() || c.path;
        return (
          <div key={c.path} title={c.path}>
            <ChangedFileRow
              fullPath={projectPath + "/" + c.path}
              name={name}
              status={c.status}
              diffStat={{ additions: c.additions, deletions: c.deletions }}
              onClick={() => onClick(c.path)}
            />
          </div>
        );
      })}
    </>
  );
}

/** 压缩目录树渲染（默认全展开，用户可折叠） */
function TreeList({
  changes,
  onClick,
  projectPath,
}: {
  changes: MergedChange[];
  onClick: (relPath: string) => void;
  projectPath: string;
}) {
  // 跟踪用户手动折叠的目录（默认空 = 全展开）
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildCompressedTree(changes), [changes]);

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
        <TreeNodeRow
          key={node.path}
          node={node}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
          onClickFile={onClick}
          projectPath={projectPath}
        />
      ))}
    </>
  );
}

function TreeNodeRow({
  node,
  depth,
  collapsed,
  onToggle,
  onClickFile,
  projectPath,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onClickFile: (relPath: string) => void;
  projectPath: string;
}) {
  // 默认展开，只有用户手动折叠过的才是 closed
  const isOpen = node.isDir ? !collapsed.has(node.path) : false;
  const fullPath = projectPath + "/" + node.path;

  return (
    <>
      <ChangedFileRow
        fullPath={fullPath}
        name={node.name}
        isDir={node.isDir}
        isOpen={isOpen}
        depth={depth}
        status={node.change?.status}
        diffStat={
          node.change
            ? { additions: node.change.additions, deletions: node.change.deletions }
            : undefined
        }
        onClick={() => {
          if (node.isDir) {
            onToggle(node.path);
          } else {
            onClickFile(node.path);
          }
        }}
      />
      {node.isDir && isOpen && node.children?.map((child) => (
        <TreeNodeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          collapsed={collapsed}
          onToggle={onToggle}
          onClickFile={onClickFile}
          projectPath={projectPath}
        />
      ))}
    </>
  );
}

/**
 * 构建压缩目录树：折叠只有单个子目录的目录链。
 * 例如 a/b/c/file.ts 如果 a、b 下各只有一个子节点，会压缩成 a/b/c 节点。
 */
function buildCompressedTree(changes: MergedChange[]): TreeNode[] {
  // 先构建完整树
  interface RawNode {
    name: string;
    path: string;
    isDir: boolean;
    children: Map<string, RawNode>;
    change?: MergedChange;
  }
  const root: RawNode = {
    name: "",
    path: "",
    isDir: true,
    children: new Map(),
  };

  for (const change of changes) {
    const parts = change.path.split("/");
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
          change: isLast ? change : undefined,
        });
      }
      current = current.children.get(part)!;
    }
  }

  // 压缩：如果目录只有一个子目录且自己没有文件，合并
  const compress = (raw: RawNode): TreeNode => {
    if (!raw.isDir) {
      return {
        name: raw.name,
        path: raw.path,
        isDir: false,
        change: raw.change,
      };
    }
    // 合并单子目录链
    let node = raw;
    const nameParts: string[] = [raw.name];
    while (
      node.children.size === 1 &&
      !node.change &&
      nameParts[nameParts.length - 1] !== ""
    ) {
      const [only] = Array.from(node.children.values());
      if (!only.isDir) break;
      nameParts.push(only.name);
      node = only;
    }
    const children = Array.from(node.children.values())
      .map(compress)
      .sort((a, b) => {
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

  return Array.from(root.children.values())
    .map(compress)
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function normalizeStatus(s: string): MergedChange["status"] {
  switch (s) {
    case "modified":
    case "typechange":
      return "modified";
    case "added":
      return "added";
    case "deleted":
      return "deleted";
    case "renamed":
    case "copied":
      return "renamed";
    default:
      return "modified";
  }
}
