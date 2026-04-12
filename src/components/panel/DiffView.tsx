/**
 * Diff 视图 - 使用 react-diff-view + unidiff 展示文件差异
 *
 * 功能：
 * - 集成 react-diff-view 渲染 diff
 * - Split 视图（左右分栏）和 Unified 视图
 * - Hunk 分隔符，行号
 * - 从后端 git_diff 获取 unified diff 文本
 */
import { useEffect, useMemo, useState } from "react";
import { parseDiff, Diff, Hunk } from "react-diff-view";
import type { FileData } from "react-diff-view";
import { usePanelStore } from "@/stores/panelStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { DiffSource } from "@/types/panel";
import { highlightHunks } from "@/lib/diffHighlight";
import "react-diff-view/style/index.css";
import "@/styles/diff-overrides.css";

interface DiffViewProps {
  filePath: string;
  tabId: string;
}

export function DiffView({ filePath, tabId }: DiffViewProps) {
  // 从 tab 读取 diffSource，缺省为 working
  const tab = usePanelStore((s) => s.tabs.find((t) => t.id === tabId));
  const diffSource: DiffSource = tab?.diffSource ?? { kind: "working" };
  const [diffFiles, setDiffFiles] = useState<FileData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const diffLayout = useSettingsStore((s) => s.diffLayout);
  const setDiffStat = usePanelStore((s) => s.setDiffStat);
  const activeProject = useProjectStore((s) => s.activeProject);
  // 订阅当前文件的 git diff 统计，文件变化时自动重新加载 diff
  const fileStat = useProjectStore((s) => s.fileDiffStats[filePath]);
  const statKey = fileStat
    ? `${fileStat.additions}/${fileStat.deletions}`
    : "none";

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const loadDiff = async () => {
      try {
        // 从后端获取 git diff，根据 diffSource 路由不同命令
        const { invoke } = await import("@tauri-apps/api/core");
        // 优先用 tab 自己记的 projectPath — 避免用户切换 active project 后
        // 把 Y-Vibe-IDE 的文件路径传给 Y-ROM-Manager 仓库之类的错仓库问题
        const repoPath =
          tab?.projectPath ?? activeProject?.path ?? getRepoPath(filePath);
        const effectiveFilePath = filePath || null;
        let rawDiff: string;
        if (diffSource.kind === "working") {
          rawDiff = await invoke<string>("git_diff", {
            repoPath,
            filePath,
          });
        } else if (diffSource.kind === "commit") {
          rawDiff = await invoke<string>("git_diff_range", {
            repoPath,
            from: diffSource.hash,
            to: diffSource.hash,
            filePath: effectiveFilePath,
          });
        } else {
          // range
          rawDiff = await invoke<string>("git_diff_range", {
            repoPath,
            from: diffSource.from,
            to: diffSource.to,
            filePath: effectiveFilePath,
          });
        }

        if (cancelled) return;

        if (!rawDiff || rawDiff.trim() === "") {
          setError("没有检测到差异");
          setIsLoading(false);
          return;
        }

        const files = parseDiff(rawDiff);
        setDiffFiles(files);

        // 计算 diff 统计
        if (files.length > 0) {
          let additions = 0;
          let deletions = 0;
          for (const file of files) {
            for (const hunk of file.hunks) {
              for (const change of hunk.changes) {
                if (change.type === "insert") additions++;
                if (change.type === "delete") deletions++;
              }
            }
          }
          setDiffStat(tabId, additions, deletions);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("Failed to load diff, using mock:", err);
        // 开发时使用 mock diff
        loadMockDiff(filePath, setDiffFiles, setDiffStat, tabId);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadDiff();
    return () => { cancelled = true; };
    // statKey 依赖：当 git status 刷新后，若该文件的 +A -D 统计变了，重新 fetch diff
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, tabId, setDiffStat, tab?.projectPath, activeProject?.path, diffSource.kind, JSON.stringify(diffSource), statKey]);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: "#6b7280" }}
      >
        加载 Diff...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: "#6b7280" }}
      >
        {error}
      </div>
    );
  }

  if (diffFiles.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: "#6b7280" }}
      >
        没有差异
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto diff-container">
      {diffFiles.map((file, index) => (
        <FileDiffBlock
          key={`${file.oldRevision}-${file.newRevision}-${index}`}
          file={file}
          filePath={filePath}
          viewType={diffLayout}
        />
      ))}
    </div>
  );
}

/** 单个文件的 diff 渲染块（带语法高亮） */
function FileDiffBlock({
  file,
  filePath,
  viewType,
}: {
  file: FileData;
  filePath: string;
  viewType: "split" | "unified";
}) {
  // 推断用于高亮的文件路径：优先使用当前 tab 的 filePath，否则用 diff 的新文件名
  const pathForLang = filePath || file.newPath || file.oldPath || "";
  const tokens = useMemo(() => highlightHunks(file.hunks, pathForLang), [file.hunks, pathForLang]);
  // 新增/删除文件只有单侧内容，split 视图空一半，强制 unified
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

/** Hunk 分隔符 */
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

/** 简单的项目路径提取 */
function getRepoPath(filePath: string): string {
  // 尝试找到项目根目录（向上查找到 .git 同级）
  // 简单实现：取 filePath 的前几段
  const parts = filePath.split("/");
  // 查找常见项目根标志
  for (let i = parts.length - 1; i >= 0; i--) {
    if (["src", "lib", "app", "packages", "components"].includes(parts[i])) {
      return parts.slice(0, i).join("/");
    }
  }
  return parts.slice(0, -1).join("/");
}

/** 开发用 mock diff */
function loadMockDiff(
  filePath: string,
  setDiffFiles: (files: FileData[]) => void,
  setDiffStat: (tabId: string, additions: number, deletions: number) => void,
  tabId: string
) {
  const fileName = filePath.split("/").pop() || "file";
  const mockDiffText = `--- a/${fileName}
+++ b/${fileName}
@@ -1,8 +1,12 @@
 import React from 'react';
-import { useState } from 'react';
+import { useState, useEffect } from 'react';
+import { useStore } from './store';

 export function Component() {
-  const [count, setCount] = useState(0);
+  const [count, setCount] = useState(0);
+  const store = useStore();
+
+  useEffect(() => {
+    store.init();
+  }, []);

   return (
-    <div>{count}</div>
+    <div className="component">
+      <span>{count}</span>
+      <button onClick={() => setCount(c => c + 1)}>+</button>
+    </div>
   );
 }
`;

  try {
    const files = parseDiff(mockDiffText);
    setDiffFiles(files);
    setDiffStat(tabId, 10, 3);
  } catch {
    console.warn("Mock diff parsing failed");
  }
}
