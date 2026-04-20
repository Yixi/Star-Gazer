import { create } from "zustand";
import type { Project, ProjectGroup, FileNode } from "@/types/project";
import type { GitStatusSummary, GitLogEntry } from "@/services/git";
import type { WorkspaceFile } from "@/types/workspace";
import { syncWorkspaceProjectPaths } from "@/services/workspace";
import { useCanvasStore } from "./canvasStore";

/**
 * 把当前 projects + projectGroups 的路径列表推送给后端沙箱。
 *
 * fs.rs 的路径校验读 WorkspaceManager 的内存列表，add/remove 后必须立即
 * 同步，否则用户点开刚加进来的项目里的文件会直接被拒。fire-and-forget。
 *
 * 组的父目录 path 也要一起送进去，因为 agent 关联整个组时 PTY 在父目录启动，
 * 可能在父目录下读取共享文件（比如 .env / README）。
 */
function pushProjectPathsToBackend(
  projects: Project[],
  groups: ProjectGroup[],
): void {
  const paths = [
    ...projects.map((p) => p.path),
    ...groups.map((g) => g.path),
  ];
  syncWorkspaceProjectPaths(paths).catch((err) => {
    console.warn("syncWorkspaceProjectPaths failed:", err);
  });
}

/**
 * 取一组路径的公共父目录。用在拖拽合组时给新 group 算 path
 * （agent 关联该组时 PTY 在这里启动）。
 *
 * 实现：先把每条 path 取 parent，再按 "/" 切片找最长公共前缀；
 * 无公共前缀时退化到第一条 path 的 parent。
 */
function deriveGroupPath(paths: string[]): string {
  if (paths.length === 0) return "";
  const parents = paths.map((p) => {
    const i = p.lastIndexOf("/");
    return i >= 0 ? p.substring(0, i) : p;
  });
  const parts = parents.map((p) => p.split("/"));
  const minLen = Math.min(...parts.map((s) => s.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const seg = parts[0][i];
    if (parts.every((s) => s[i] === seg)) common.push(seg);
    else break;
  }
  const joined = common.join("/");
  // joined 可能是空字符串（完全没共同前缀）或仅 "/"（只有 root），
  // 这两种情况都退化到第一个成员的 parent
  if (!joined || joined === "/") return parents[0];
  return joined;
}

/** 从一组路径推导组名：取公共父目录 basename，兜底 "新分组" */
function deriveGroupName(paths: string[]): string {
  const parent = deriveGroupPath(paths);
  const seg = parent.split("/").filter(Boolean).pop();
  return seg && seg.length > 0 ? seg : "新分组";
}

/**
 * 在 projects 数组里找一个合适的位置把新成员追加到 `groupId` 组的末尾。
 * 返回的 index 是 "插入位置"（splice idx），保证插入后组成员保持相邻。
 *
 * 若组当前没成员（极端情况），回退到数组末尾。
 */
function findGroupInsertEnd(projects: Project[], groupId: string): number {
  let lastIdx = -1;
  for (let i = 0; i < projects.length; i++) {
    if (projects[i].groupId === groupId) lastIdx = i;
  }
  return lastIdx < 0 ? projects.length : lastIdx + 1;
}

/** 移除没有任何成员的孤儿组 */
function pruneEmptyGroups(
  groups: ProjectGroup[],
  projects: Project[],
): ProjectGroup[] {
  const used = new Set(projects.map((p) => p.groupId).filter(Boolean));
  return groups.filter((g) => used.has(g.id));
}

/** 文件 Git diff 统计 */
export interface FileDiffStat {
  additions: number;
  deletions: number;
}

/** 侧边栏视图模式（每个项目独立） */
export type SidebarViewMode = "files" | "changes" | "history";

interface ProjectState {
  /** 所有项目列表（包含独立项目和组成员；组成员通过 Project.groupId 识别） */
  projects: Project[];
  /** 项目组列表（从父目录批量导入生成） */
  projectGroups: ProjectGroup[];
  /** 当前激活的项目（用于 git 状态、文件监听等） */
  activeProject: Project | null;
  /** 已展开的项目 ID 映射（多个项目可同时展开） */
  expandedProjectIds: Record<string, boolean>;
  /** 每个项目的文件树数据 (projectId -> FileNode[]) */
  projectFileTrees: Record<string, FileNode[]>;
  /** 文件树加载状态 */
  isLoading: boolean;
  /** Git 分支名 */
  gitBranch: string;
  /** 文件 diff 统计映射 (filePath -> stats) */
  fileDiffStats: Record<string, FileDiffStat>;
  /** 正在写入的文件路径集合 */
  writingFiles: Set<string>;
  /** 侧边栏视图模式（全局，所有项目共用） */
  viewMode: SidebarViewMode;
  /** Changes/History 文件列表排版（全局，tree/flat） */
  flatMode: boolean;
  /** 每个项目的 History 选中 commit 列表（按时间倒序存储） */
  selectedCommits: Record<string, string[]>;
  /** 每个项目的 History 上下分隔比例 0..1（默认 0.55） */
  historySplit: Record<string, number>;
  /** 每个项目的完整 git 状态（从 Sidebar 顶层 useGitStatus 写入） */
  gitStatusByProject: Record<string, GitStatusSummary>;
  /** 每个项目的 commit 历史缓存 */
  gitLogByProject: Record<string, GitLogEntry[]>;

  /** 添加项目 */
  addProject: (project: Project) => void;
  /** 移除项目 */
  removeProject: (id: string) => void;
  /**
   * 一次性导入一个项目组及其全部成员。
   * members 参数不要求带 groupId，会在内部自动填充 group.id。
   *
   * **async** —— 会先 await sandbox sync 落盘后端，再 setState。这样 React
   * 在渲染 FileTree 之前后端沙箱已经认识这些新路径，不会被拒绝。
   */
  addProjectGroup: (
    group: ProjectGroup,
    members: Array<Omit<Project, "groupId">>,
  ) => Promise<void>;
  /** 删除整个项目组 + 所有成员 projects。引用该组的 agent 由 canvasStore 清理 scope */
  removeProjectGroup: (groupId: string) => void;
  /** 重命名组（不改 path） */
  renameProjectGroup: (groupId: string, name: string) => void;
  /**
   * 拖拽排序 — 把 fromId 移动到 toId 的 before/after 位置
   * 用于 Sidebar 里项目拖拽重排
   */
  reorderProjects: (
    fromId: string,
    toId: string,
    position: "before" | "after",
  ) => void;
  /**
   * 拖拽排序（顶层行级别）—— key 是 project.id（独立项目）或 group.id（项目组）。
   * 组作为一个整体参与排序，组内成员顺序保持不变。
   */
  reorderSidebarEntries: (
    fromKey: string,
    toKey: string,
    position: "before" | "after",
  ) => void;
  /**
   * 把一组现有项目合并成一个新分组。
   * - `memberIds` 至少 2 项；第一个作为锚点，新组插在它原来的位置
   * - 成员若原本就在其他组里，会自动脱离（老组空了会自动清理）
   * - 组的 path 取成员路径的公共父目录，用作 agent PTY cwd
   * - 组的 name 若未给，取公共父目录 basename（兜底 "新分组"）
   */
  createGroupFromProjects: (
    memberIds: string[],
    name?: string,
  ) => Promise<void>;
  /**
   * 把一个项目移动到指定组。
   * - `refMemberId` 给了就落在该成员前/后；否则追加到组末尾
   * - 若项目原来就在别的组里，会自动脱离（老组空了自动清理）
   */
  moveProjectIntoGroup: (
    projectId: string,
    groupId: string,
    opts?: { refMemberId?: string; position?: "before" | "after" },
  ) => void;
  /**
   * 把一个组成员拖出来变独立项目。
   * - `refKey` 可以是顶层 project.id 或 group.id；未给则追加到末尾
   * - 项目脱离后老组若空了会自动清理
   */
  detachProjectToTopLevel: (
    projectId: string,
    opts?: { refKey?: string; position?: "before" | "after" },
  ) => void;
  /** 设置当前项目（git/文件监听的目标） */
  setActiveProject: (project: Project | null) => void;
  /** 切换项目展开/折叠 */
  toggleProjectExpanded: (id: string) => void;
  /** 更新指定项目的文件树 */
  setProjectFileTree: (projectId: string, tree: FileNode[]) => void;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 设置 Git 分支 */
  setGitBranch: (branch: string) => void;
  /** 设置文件 diff 统计 */
  setFileDiffStats: (stats: Record<string, FileDiffStat>) => void;
  /** 标记文件正在写入 */
  setFileWriting: (path: string, writing: boolean) => void;
  /** 更新指定项目中目录节点的子节点（按需加载） */
  updateNodeChildren: (projectId: string, nodeId: string, children: FileNode[]) => void;

  /** 设置侧边栏视图模式（全局） */
  setViewMode: (mode: SidebarViewMode) => void;
  /** 设置 tree/flat 排版（全局） */
  setFlatMode: (flat: boolean) => void;
  /** 切换 commit 选中：single 单选、toggle Cmd+click、range Shift+click */
  toggleCommitSelection: (
    projectId: string,
    hash: string,
    modifier: "single" | "toggle" | "range",
    allHashes: string[],
  ) => void;
  /** 清空 commit 选中 */
  clearCommitSelection: (projectId: string) => void;
  /** 设置 History 上下分隔比例 */
  setHistorySplit: (projectId: string, ratio: number) => void;
  /** 写入完整 git 状态 */
  setGitStatus: (projectId: string, status: GitStatusSummary) => void;
  /** 写入 git log 缓存 */
  setGitLog: (projectId: string, log: GitLogEntry[]) => void;

  /**
   * 从 workspace 文件快照批量替换 project 相关字段。
   *
   * 只写 projects / activeProject / expandedProjectIds / viewMode / flatMode，
   * 其它运行时派生字段（gitStatus、fileTree、diffStats...）保持清空初值，
   * 由各自的 hook 重新跑。
   *
   * **禁止在此处触发 side effect**（比如调 setActiveProject 触发的 git 同步）——
   * 直接 setState 到位即可，autosave 由 isHydrating 屏蔽。
   */
  hydrateFromWorkspace: (ws: WorkspaceFile) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  projectGroups: [],
  activeProject: null,
  expandedProjectIds: {},
  projectFileTrees: {},
  isLoading: false,
  gitBranch: "main",
  fileDiffStats: {},
  writingFiles: new Set(),
  viewMode: "files",
  flatMode: false,
  selectedCommits: {},
  historySplit: {},
  gitStatusByProject: {},
  gitLogByProject: {},

  addProject: (project) =>
    set((state) => {
      if (state.projects.some((p) => p.id === project.id)) return state;
      const nextProjects = [...state.projects, project];
      pushProjectPathsToBackend(nextProjects, state.projectGroups);
      return { projects: nextProjects };
    }),

  removeProject: (id) =>
    set((state) => {
      const { [id]: _e, ...newExpanded } = state.expandedProjectIds;
      const { [id]: _t, ...restTrees } = state.projectFileTrees;
      const nextProjects = state.projects.filter((p) => p.id !== id);
      pushProjectPathsToBackend(nextProjects, state.projectGroups);
      return {
        projects: nextProjects,
        activeProject: state.activeProject?.id === id ? null : state.activeProject,
        expandedProjectIds: newExpanded,
        projectFileTrees: restTrees,
      };
    }),

  addProjectGroup: async (group, members) => {
    const state = useProjectStore.getState();
    // dedupe: 同 id 的 group 不重复加
    if (state.projectGroups.some((g) => g.id === group.id)) return;
    const memberSet = new Set(state.projects.map((p) => p.id));
    const memberProjects: Project[] = members
      .filter((m) => !memberSet.has(m.id))
      .map((m) => ({ ...m, groupId: group.id }));
    const nextProjects = [...state.projects, ...memberProjects];
    const nextGroups = [...state.projectGroups, group];

    // 关键：先 await 把新路径塞进后端沙箱，再 setState。
    // 否则 React 会先渲染 FileTree，触发 list_dir 竞态，被沙箱拒绝。
    try {
      await syncWorkspaceProjectPaths([
        ...nextProjects.map((p) => p.path),
        ...nextGroups.map((g) => g.path),
      ]);
    } catch (err) {
      console.warn("syncWorkspaceProjectPaths failed during addProjectGroup:", err);
    }

    useProjectStore.setState({
      projects: nextProjects,
      projectGroups: nextGroups,
    });
  },

  removeProjectGroup: (groupId) =>
    set((state) => {
      // 要删的成员 id 先收集起来，用来清理派生字段
      const memberIds = state.projects
        .filter((p) => p.groupId === groupId)
        .map((p) => p.id);
      const nextExpanded = { ...state.expandedProjectIds };
      const nextTrees = { ...state.projectFileTrees };
      for (const mid of memberIds) {
        delete nextExpanded[mid];
        delete nextTrees[mid];
      }
      const nextProjects = state.projects.filter((p) => p.groupId !== groupId);
      const nextGroups = state.projectGroups.filter((g) => g.id !== groupId);
      pushProjectPathsToBackend(nextProjects, nextGroups);
      // 清理引用该组的 agent scope（卡片保留，只熄灭联动指示）
      useCanvasStore.getState().clearAgentScopesForGroup(groupId);
      return {
        projects: nextProjects,
        projectGroups: nextGroups,
        expandedProjectIds: nextExpanded,
        projectFileTrees: nextTrees,
        activeProject:
          state.activeProject && memberIds.includes(state.activeProject.id)
            ? null
            : state.activeProject,
      };
    }),

  renameProjectGroup: (groupId, name) =>
    set((state) => ({
      projectGroups: state.projectGroups.map((g) =>
        g.id === groupId ? { ...g, name } : g,
      ),
    })),

  reorderProjects: (fromId, toId, position) =>
    set((state) => {
      if (fromId === toId) return state;
      const arr = [...state.projects];
      const fromIdx = arr.findIndex((p) => p.id === fromId);
      if (fromIdx < 0) return state;
      const [moved] = arr.splice(fromIdx, 1);
      // 注意：移除源后目标索引会变化，这里要用移除后的数组重新找
      let toIdx = arr.findIndex((p) => p.id === toId);
      if (toIdx < 0) {
        // 目标找不到（理论不会），回滚
        arr.splice(fromIdx, 0, moved);
        return state;
      }
      if (position === "after") toIdx += 1;
      arr.splice(toIdx, 0, moved);
      pushProjectPathsToBackend(arr, state.projectGroups);
      return { projects: arr };
    }),

  createGroupFromProjects: async (memberIds, name) => {
    if (memberIds.length < 2) return;
    const state = useProjectStore.getState();
    const idSet = new Set(memberIds);
    // 按 memberIds 给定顺序找出对应的 Project，过滤掉无效 id
    const members = memberIds
      .map((id) => state.projects.find((p) => p.id === id))
      .filter((p): p is Project => !!p);
    if (members.length < 2) return;

    const newGroup: ProjectGroup = {
      id: `group-${
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      }`,
      name: (name ?? "").trim() || deriveGroupName(members.map((m) => m.path)),
      path: deriveGroupPath(members.map((m) => m.path)),
    };

    // 以 memberIds[0] 在 projects 数组里的位置为锚点
    const anchorIdx = state.projects.findIndex((p) => p.id === members[0].id);
    const removedBefore = state.projects
      .slice(0, anchorIdx)
      .filter((p) => idSet.has(p.id)).length;
    const insertIdx = anchorIdx - removedBefore;

    const stripped = state.projects.filter((p) => !idSet.has(p.id));
    const rebuilt: Project[] = members.map((m) => ({
      ...m,
      groupId: newGroup.id,
    }));
    stripped.splice(insertIdx, 0, ...rebuilt);

    // 如果成员原本分属的老组现在没成员了，清掉
    const nextGroups = pruneEmptyGroups(
      [...state.projectGroups, newGroup],
      stripped,
    );

    // 先 await 沙箱同步（新 group.path 可能没被加进 allow-list），再 setState
    try {
      await syncWorkspaceProjectPaths([
        ...stripped.map((p) => p.path),
        ...nextGroups.map((g) => g.path),
      ]);
    } catch (err) {
      console.warn(
        "syncWorkspaceProjectPaths failed during createGroupFromProjects:",
        err,
      );
    }

    useProjectStore.setState({
      projects: stripped,
      projectGroups: nextGroups,
      expandedProjectIds: {
        ...state.expandedProjectIds,
        [newGroup.id]: true,
      },
    });
  },

  moveProjectIntoGroup: (projectId, groupId, opts) =>
    set((state) => {
      const target = state.projects.find((p) => p.id === projectId);
      if (!target) return state;
      if (target.groupId === groupId && !opts?.refMemberId) return state;
      const group = state.projectGroups.find((g) => g.id === groupId);
      if (!group) return state;

      // 从数组里摘出目标
      const stripped = state.projects.filter((p) => p.id !== projectId);
      const moved: Project = { ...target, groupId };

      let insertIdx: number;
      if (opts?.refMemberId) {
        const refIdx = stripped.findIndex((p) => p.id === opts.refMemberId);
        if (refIdx < 0) {
          // ref 找不到，退化为追加
          insertIdx = findGroupInsertEnd(stripped, groupId);
        } else {
          insertIdx = opts.position === "before" ? refIdx : refIdx + 1;
        }
      } else {
        insertIdx = findGroupInsertEnd(stripped, groupId);
      }
      stripped.splice(insertIdx, 0, moved);

      const nextGroups = pruneEmptyGroups(state.projectGroups, stripped);
      pushProjectPathsToBackend(stripped, nextGroups);
      // 确保目标组展开，方便用户看到结果
      return {
        projects: stripped,
        projectGroups: nextGroups,
        expandedProjectIds: {
          ...state.expandedProjectIds,
          [groupId]: true,
        },
      };
    }),

  detachProjectToTopLevel: (projectId, opts) =>
    set((state) => {
      const target = state.projects.find((p) => p.id === projectId);
      if (!target) return state;
      if (!target.groupId && !opts?.refKey) return state;

      const stripped = state.projects.filter((p) => p.id !== projectId);
      const detached: Project = { ...target };
      delete detached.groupId;

      let insertIdx: number;
      if (opts?.refKey) {
        const position = opts.position ?? "before";
        const refGroup = state.projectGroups.find(
          (g) => g.id === opts.refKey,
        );
        if (refGroup) {
          // refKey 是组 id：before → 组首成员之前；after → 组末成员之后
          const groupIndices = stripped
            .map((p, i) => ({ p, i }))
            .filter((x) => x.p.groupId === refGroup.id)
            .map((x) => x.i);
          if (groupIndices.length === 0) {
            insertIdx = stripped.length;
          } else if (position === "before") {
            insertIdx = groupIndices[0];
          } else {
            insertIdx = groupIndices[groupIndices.length - 1] + 1;
          }
        } else {
          const refIdx = stripped.findIndex((p) => p.id === opts.refKey);
          if (refIdx < 0) {
            insertIdx = stripped.length;
          } else {
            insertIdx = position === "before" ? refIdx : refIdx + 1;
          }
        }
      } else {
        insertIdx = stripped.length;
      }
      stripped.splice(insertIdx, 0, detached);

      const nextGroups = pruneEmptyGroups(state.projectGroups, stripped);
      pushProjectPathsToBackend(stripped, nextGroups);
      return { projects: stripped, projectGroups: nextGroups };
    }),

  reorderSidebarEntries: (fromKey, toKey, position) =>
    set((state) => {
      if (fromKey === toKey) return state;

      // 1) 从 projects 顺序构建 top-level entries，组成员相邻保持原序
      type Entry =
        | { kind: "group"; groupId: string; members: Project[] }
        | { kind: "project"; project: Project };
      const seen = new Set<string>();
      const entries: Entry[] = [];
      for (const p of state.projects) {
        if (p.groupId) {
          if (seen.has(p.groupId)) continue;
          seen.add(p.groupId);
          const group = state.projectGroups.find((g) => g.id === p.groupId);
          if (!group) {
            // 孤儿成员（groupId 指向已删 group）—— 当独立项目处理
            entries.push({ kind: "project", project: p });
            continue;
          }
          const members = state.projects.filter((x) => x.groupId === p.groupId);
          entries.push({ kind: "group", groupId: p.groupId, members });
        } else {
          entries.push({ kind: "project", project: p });
        }
      }

      // 2) 拖动
      const keyOf = (e: Entry) =>
        e.kind === "group" ? e.groupId : e.project.id;
      const fromIdx = entries.findIndex((e) => keyOf(e) === fromKey);
      if (fromIdx < 0) return state;
      const [moved] = entries.splice(fromIdx, 1);
      let toIdx = entries.findIndex((e) => keyOf(e) === toKey);
      if (toIdx < 0) {
        entries.splice(fromIdx, 0, moved);
        return state;
      }
      if (position === "after") toIdx += 1;
      entries.splice(toIdx, 0, moved);

      // 3) 展平回 projects 数组
      const nextProjects: Project[] = [];
      for (const e of entries) {
        if (e.kind === "group") {
          nextProjects.push(...e.members);
        } else {
          nextProjects.push(e.project);
        }
      }
      pushProjectPathsToBackend(nextProjects, state.projectGroups);
      return { projects: nextProjects };
    }),

  setActiveProject: (project) => set({ activeProject: project }),

  toggleProjectExpanded: (id) =>
    set((state) => {
      const prev = state.expandedProjectIds;
      if (prev[id]) {
        const { [id]: _, ...rest } = prev;
        return { expandedProjectIds: rest };
      }
      return { expandedProjectIds: { ...prev, [id]: true } };
    }),

  setProjectFileTree: (projectId, tree) =>
    set((state) => ({
      projectFileTrees: { ...state.projectFileTrees, [projectId]: tree },
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setGitBranch: (branch) => set({ gitBranch: branch }),

  setFileDiffStats: (stats) => set({ fileDiffStats: stats }),

  setFileWriting: (path, writing) =>
    set((state) => {
      const newSet = new Set(state.writingFiles);
      if (writing) { newSet.add(path); } else { newSet.delete(path); }
      return { writingFiles: newSet };
    }),

  updateNodeChildren: (projectId, nodeId, children) =>
    set((state) => {
      const tree = state.projectFileTrees[projectId] ?? [];
      const updateChildren = (nodes: FileNode[]): FileNode[] =>
        nodes.map((node) => {
          if (node.id === nodeId) return { ...node, children };
          if (node.children) return { ...node, children: updateChildren(node.children) };
          return node;
        });
      return {
        projectFileTrees: {
          ...state.projectFileTrees,
          [projectId]: updateChildren(tree),
        },
      };
    }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setFlatMode: (flat) => set({ flatMode: flat }),

  toggleCommitSelection: (projectId, hash, modifier, allHashes) =>
    set((state) => {
      const current = state.selectedCommits[projectId] ?? [];
      let next: string[] = [];
      if (modifier === "single") {
        // 单击：仅选中这一个
        next = [hash];
      } else if (modifier === "toggle") {
        // Cmd/Ctrl+click：切换
        if (current.includes(hash)) {
          next = current.filter((h) => h !== hash);
        } else {
          next = [...current, hash];
        }
      } else if (modifier === "range") {
        // Shift+click：从当前最后一个选中项到 hash 的区间
        if (current.length === 0) {
          next = [hash];
        } else {
          const lastSelected = current[current.length - 1];
          const startIdx = allHashes.indexOf(lastSelected);
          const endIdx = allHashes.indexOf(hash);
          if (startIdx === -1 || endIdx === -1) {
            next = [...current, hash];
          } else {
            const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            const rangeSlice = allHashes.slice(from, to + 1);
            const merged = new Set([...current, ...rangeSlice]);
            next = Array.from(merged);
          }
        }
      }
      // 保持按 allHashes 的顺序
      const ordered = allHashes.filter((h) => next.includes(h));
      return { selectedCommits: { ...state.selectedCommits, [projectId]: ordered } };
    }),

  clearCommitSelection: (projectId) =>
    set((state) => ({
      selectedCommits: { ...state.selectedCommits, [projectId]: [] },
    })),

  setHistorySplit: (projectId, ratio) =>
    set((state) => ({
      historySplit: { ...state.historySplit, [projectId]: Math.max(0.2, Math.min(0.8, ratio)) },
    })),

  setGitStatus: (projectId, status) =>
    set((state) => ({
      gitStatusByProject: { ...state.gitStatusByProject, [projectId]: status },
    })),

  setGitLog: (projectId, log) =>
    set((state) => ({
      gitLogByProject: { ...state.gitLogByProject, [projectId]: log },
    })),

  hydrateFromWorkspace: (ws) => {
    // 防御性清洗 projectGroups：
    // 过去有个 bug —— Rust 端 scan_git_repos 的 serde rename_all 没 cascade 到
    // enum variant 内部字段，导致 parentPath / parentName 以 snake_case 发给
    // 前端，前端读 undefined，坏组被写进 workspace 文件（只有 id 没有 path）。
    // 这里过滤掉 path / name 缺失的坏组，并把孤儿成员的 groupId 剥掉使其变成
    // 独立项目，避免 ProjectGroupItem.group.path.split 等处 crash。
    const rawGroups = ws.projectGroups ?? [];
    const validGroups = rawGroups.filter(
      (g): g is (typeof g) & { path: string; name: string } =>
        typeof g?.path === "string" &&
        g.path.length > 0 &&
        typeof g?.name === "string" &&
        g.name.length > 0,
    );
    const validGroupIds = new Set(validGroups.map((g) => g.id));
    const sanitizedProjects = ws.projects.map((p) => {
      if (p.groupId && !validGroupIds.has(p.groupId)) {
        const next = { ...p };
        delete next.groupId;
        return next;
      }
      return p;
    });

    const activeId = ws.ui.activeProjectId;
    const active =
      (activeId && sanitizedProjects.find((p) => p.id === activeId)) || null;
    set({
      projects: sanitizedProjects,
      projectGroups: validGroups,
      activeProject: active,
      expandedProjectIds: ws.ui.expandedProjectIds,
      viewMode: ws.ui.viewMode,
      flatMode: ws.ui.flatMode,
      projectFileTrees: {},
      gitStatusByProject: {},
      gitLogByProject: {},
      fileDiffStats: {},
      selectedCommits: {},
      historySplit: {},
      writingFiles: new Set(),
      isLoading: false,
      gitBranch: "",
    });
  },
}));
