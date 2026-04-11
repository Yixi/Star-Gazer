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
  /** 当前激活的项目 */
  activeProject: Project | null;
  /** 文件树数据 */
  fileTree: FileNode[];
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
  /** 设置当前项目 */
  setActiveProject: (project: Project | null) => void;
  /** 更新文件树 */
  setFileTree: (tree: FileNode[]) => void;
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
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProject: null,
  fileTree: [],
  isLoading: false,
  gitBranch: "main",
  fileDiffStats: {},
  writingFiles: new Set(),
  hoveredAgentId: null,
  agentFileMap: {},

  addProject: (project) =>
    set((state) => ({ projects: [...state.projects, project] })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProject:
        state.activeProject?.id === id ? null : state.activeProject,
    })),

  setActiveProject: (project) => set({ activeProject: project }),

  setFileTree: (tree) => set({ fileTree: tree }),

  setLoading: (loading) => set({ isLoading: loading }),

  setGitBranch: (branch) => set({ gitBranch: branch }),

  setFileDiffStats: (stats) => set({ fileDiffStats: stats }),

  setFileWriting: (path, writing) =>
    set((state) => {
      const newSet = new Set(state.writingFiles);
      if (writing) {
        newSet.add(path);
      } else {
        newSet.delete(path);
      }
      return { writingFiles: newSet };
    }),

  setHoveredAgent: (agentId) => set({ hoveredAgentId: agentId }),

  setAgentFileMap: (map) => set({ agentFileMap: map }),
}));
