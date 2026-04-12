import { create } from "zustand";
import type { Project, FileNode } from "@/types/project";
import type { GitStatusSummary, GitLogEntry } from "@/services/git";

/** 文件 Git diff 统计 */
export interface FileDiffStat {
  additions: number;
  deletions: number;
}

/** 侧边栏视图模式（每个项目独立） */
export type SidebarViewMode = "files" | "changes" | "history";

interface ProjectState {
  /** 所有项目列表 */
  projects: Project[];
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
  /** 当前 hover 高亮的 agent ID */
  hoveredAgentId: string | null;
  /** agent 修改的文件映射 (agentId -> filePaths[]) */
  agentFileMap: Record<string, string[]>;
  /** 每个项目的侧边栏视图模式 */
  viewModes: Record<string, SidebarViewMode>;
  /** 每个项目的 Changes/History 文件列表排版（tree/flat） */
  flatModes: Record<string, boolean>;
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
  /** 设置 hover 的 agent */
  setHoveredAgent: (agentId: string | null) => void;
  /** 设置 agent 文件映射 */
  setAgentFileMap: (map: Record<string, string[]>) => void;
  /** 更新指定项目中目录节点的子节点（按需加载） */
  updateNodeChildren: (projectId: string, nodeId: string, children: FileNode[]) => void;

  /** 设置侧边栏视图模式 */
  setViewMode: (projectId: string, mode: SidebarViewMode) => void;
  /** 设置 tree/flat 排版 */
  setFlatMode: (projectId: string, flat: boolean) => void;
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
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProject: null,
  expandedProjectIds: {},
  projectFileTrees: {},
  isLoading: false,
  gitBranch: "main",
  fileDiffStats: {},
  writingFiles: new Set(),
  hoveredAgentId: null,
  agentFileMap: {},
  viewModes: {},
  flatModes: {},
  selectedCommits: {},
  historySplit: {},
  gitStatusByProject: {},
  gitLogByProject: {},

  addProject: (project) =>
    set((state) => {
      if (state.projects.some((p) => p.id === project.id)) return state;
      return { projects: [...state.projects, project] };
    }),

  removeProject: (id) =>
    set((state) => {
      const { [id]: _e, ...newExpanded } = state.expandedProjectIds;
      const { [id]: _t, ...restTrees } = state.projectFileTrees;
      return {
        projects: state.projects.filter((p) => p.id !== id),
        activeProject: state.activeProject?.id === id ? null : state.activeProject,
        expandedProjectIds: newExpanded,
        projectFileTrees: restTrees,
      };
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

  setHoveredAgent: (agentId) => set({ hoveredAgentId: agentId }),

  setAgentFileMap: (map) => set({ agentFileMap: map }),

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

  setViewMode: (projectId, mode) =>
    set((state) => ({
      viewModes: { ...state.viewModes, [projectId]: mode },
    })),

  setFlatMode: (projectId, flat) =>
    set((state) => ({
      flatModes: { ...state.flatModes, [projectId]: flat },
    })),

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
}));
