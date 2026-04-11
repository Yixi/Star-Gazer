/** 面板 Tab 类型 */
export type PanelTabType = "file" | "diff" | "markdown";

/** 面板 Tab */
export interface PanelTab {
  /** Tab 唯一 ID */
  id: string;
  /** Tab 标题 */
  title: string;
  /** Tab 类型 */
  type: PanelTabType;
  /** 文件路径 */
  filePath: string;
  /** 是否已修改（未保存） */
  isDirty: boolean;
  /** Diff 信息（仅 diff 类型） */
  diffInfo?: {
    oldPath: string;
    newPath: string;
  };
}

/** 面板状态 */
export interface PanelState {
  /** 是否展开 */
  isOpen: boolean;
  /** 面板宽度 */
  width: number;
  /** 当前激活的 Tab ID */
  activeTabId: string | null;
  /** 所有 Tab */
  tabs: PanelTab[];
}
