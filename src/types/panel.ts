/** 面板 Tab 类型 */
export type PanelTabType = "file" | "diff" | "markdown" | "commit-files";

/** Diff 数据源 */
export type DiffSource =
  | { kind: "working" }                                 // 工作区未提交改动（默认）
  | { kind: "commit"; hash: string }                    // 单个 commit
  | { kind: "range"; from: string; to: string };        // 多 commit 合并范围

/** 面板 Tab */
export interface PanelTab {
  /** Tab 唯一 ID */
  id: string;
  /** Tab 标题 */
  title: string;
  /** Tab 类型 */
  type: PanelTabType;
  /** 文件路径（range 全量 diff 时可能为空字符串） */
  filePath: string;
  /** 是否已修改（未保存） */
  isDirty: boolean;
  /** Diff 数据源（仅 diff 类型有意义，缺省为 working） */
  diffSource?: DiffSource;
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
