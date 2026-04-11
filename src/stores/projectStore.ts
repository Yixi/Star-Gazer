import { create } from "zustand";
import type { Project, FileNode } from "@/types/project";

interface ProjectState {
  /** 所有项目列表 */
  projects: Project[];
  /** 当前激活的项目 */
  activeProject: Project | null;
  /** 文件树数据 */
  fileTree: FileNode[];
  /** 文件树加载状态 */
  isLoading: boolean;

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
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProject: null,
  fileTree: [],
  isLoading: false,

  addProject: (project) =>
    set((state) => ({ projects: [...state.projects, project] })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    })),

  setActiveProject: (project) => set({ activeProject: project }),

  setFileTree: (tree) => set({ fileTree: tree }),

  setLoading: (loading) => set({ isLoading: loading }),
}));
