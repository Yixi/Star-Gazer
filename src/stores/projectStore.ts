import { create } from "zustand";
import type { Project, FileNode } from "@/types/project";

/** 文件 Git diff 统计 */
export interface FileDiffStat {
  additions: number;
  deletions: number;
}

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
}));
