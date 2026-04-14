/**
 * Workspace 文件数据模型 —— VSCode `.code-workspace` 风格
 *
 * Workspace 是磁盘上的一个 JSON 文件（扩展名 .sgw），由用户决定存放位置。
 * 应用只维护 recent 索引，不管理 workspace 本体。
 */
import type { Project, ProjectGroup } from "./project";
import type { SidebarViewMode } from "@/stores/projectStore";
import type { Agent } from "./agent";
import type { PanelTab } from "./panel";
import type { CardDisplayMode } from "@/stores/canvasStore";

export interface WorkspaceCanvasSnapshot {
  agents: Agent[];
  viewport: { x: number; y: number };
  zoom: number;
  cardDisplayModes: Record<string, CardDisplayMode>;
  cardZOrder: Record<string, number>;
}

export interface WorkspacePanelSnapshot {
  tabs: PanelTab[];
  activeTabId: string | null;
  isOpen: boolean;
  width: number;
}

export interface WorkspaceUISnapshot {
  activeProjectId: string | null;
  expandedProjectIds: Record<string, boolean>;
  viewMode: SidebarViewMode;
  flatMode: boolean;
}

export interface WorkspaceFile {
  version: 1;
  name: string;
  projects: Project[];
  /**
   * 项目组数组（可选）。
   * 老 workspace 文件没这字段，解析时填空数组即可 —— 完全向后兼容。
   */
  projectGroups?: ProjectGroup[];
  canvas: WorkspaceCanvasSnapshot;
  panel: WorkspacePanelSnapshot;
  ui: WorkspaceUISnapshot;
}

export interface RecentEntry {
  path: string;
  name: string;
  lastOpened: number;
}

export interface RecentWorkspaces {
  recent: RecentEntry[];
  lastOpenedPath: string | null;
}
