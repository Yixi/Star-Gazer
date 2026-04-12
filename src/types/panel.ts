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
  /**
   * 是否为 preview tab — VSCode 风格的"临时 tab"
   *
   * - 单击文件 → 打开为 preview tab（文件名斜体显示）
   * - 同一时刻全局只有一个 preview tab；再打开新 preview 会"替换" 旧的 slot
   * - 双击 tab 标题、双击文件树条目、开始编辑 → 升级为 permanent
   * - undefined 或 false = 已固定，不会被替换
   */
  isPreview?: boolean;
  /**
   * Tab 所属项目的绝对路径 — 用作 git 命令的 repoPath
   *
   * 不要依赖全局 activeProject.path 来跑 git 命令：用户可能同时打开多个项目，
   * 切换 active project 时旧 tab 仍然留在面板里，若这时用 activeProject 去
   * 跑 git diff，会把文件绝对路径传给一个不属于它的仓库，git 返回空结果，
   * 前端就会误显示"没有检测到差异"。每个 tab 在 openTab 时绑定自己的
   * 项目路径，diff / commit-files / breadcrumb 等视图都应读这个字段。
   */
  projectPath?: string;
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
