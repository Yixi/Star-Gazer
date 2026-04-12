# Star Gazer

Mac 原生轻量开发工作台，专为多 AI agent 并行工作流设计。详细 PRD 见 `docs/StarGazer-PRD.md`，视觉设计稿见 `docs/StarGazer-Mockup.html`。

## 技术栈

- **应用框架**: Tauri 2.x（WKWebView，不打包 Chromium）
- **前端**: React 19 + TypeScript 严格模式 + Vite
- **样式**: Tailwind CSS 4.x（CSS-based config，无 tailwind.config.js）+ shadcn/ui
- **状态管理**: Zustand
- **后端**: Rust
- **包管理**: pnpm（不要用 npm/yarn）

## 命令

- `pnpm install` — 安装依赖
- `pnpm build` — 前端构建（tsc + vite build）
- `pnpm tauri dev` — 启动开发模式
- `pnpm tauri build` — 构建发布包
- `cargo check` — 在 src-tauri/ 下检查 Rust 编译

## 架构约束

### 布局：Sidebar + Canvas + 右侧浮动面板
```
Sidebar(240px) | Canvas(flex)  ┊ SlidePanel(800px,浮层)
底部 StatusBar(24px)
```
**SlidePanel 是浮动覆盖层**，绝对定位悬浮在 Canvas 之上，不占用 flex 空间。从右侧
`translateX` 滑入（240ms GPU 加速），默认 800px 宽、可拖拽调整到 320-1200px。左缘 1px
边线 + 向左投射的阴影体现浮层感；左缘有 4px 拖拽握把（向左拖变宽）。画布只放 Agent
终端卡片，文件/diff/commit 视图在浮动面板里。

### Panel Tab 语义（VSCode 风格 preview）
- **Preview tab**：单击文件打开的临时 tab，文件名用**斜体**显示。全局同时只有一个
  preview tab；再开新 preview 会替换同一 slot，避免快速浏览时 tab 无限增长。
- **Pin 触发**：① 双击 tab 标题 ② 双击文件树条目 ③ 开始编辑（markDirty 自动 pin）
- 调用 `openTab` 时显式传 `isPreview: true/false` 指定模式；已 pinned 的 tab 不会
  退回 preview。

### 前端分层
```
src/
  components/   — React 组件，按功能域分目录（canvas/ sidebar/ panel/ terminal/ ...）
  stores/       — Zustand store，每个功能域一个（canvasStore, panelStore, projectStore, terminalStore, settingsStore）
  services/     — Tauri IPC 调用封装（git.ts, pty.ts, fs.ts, watcher.ts）
  hooks/        — 自定义 hooks
  types/        — TypeScript 类型定义
  styles/       — design-tokens.css（设计系统）+ globals.css + animations.css
```

### Rust 后端分层
```
src-tauri/src/
  commands/     — Tauri command 处理函数（薄层，调用 services）
  services/     — 业务逻辑（pty_manager, git_service, file_watcher, project_manager, session_manager）
  types/        — 数据模型（所有 serde 结构体必须 #[serde(rename_all = "camelCase")]）
```

### 前后端通信规则
- Rust → 前端数据：字段一律 **camelCase**（通过 serde rename_all）
- Tauri command 名称：**snake_case**（`create_terminal`, `git_status`）
- Tauri event 名称：**kebab-case**（`terminal-output`, `file-changed`）
- 前端 invoke 的 command 名必须和 `lib.rs` 注册的完全一致

### Git 方案
Shell out 到系统 `git` 命令（参考 VSCode），不用 libgit2。通过 `GitService` 封装，tokio spawn 子进程。

### 性能硬指标（不可妥协）
- 冷启动 < 1.2s，空闲内存 < 150MB，终端输入延迟 < 16ms，画布拖拽 60fps

## 设计系统

颜色、间距、字体等 token 定义在 `src/styles/design-tokens.css`，组件中通过 CSS 变量或 Tailwind 引用。不要硬编码颜色值。

Agent 色盘：蓝 `#4a9eff` / 橙 `#ff8c42` / 紫 `#a78bfa` / 绿 `#22c55e` / 粉 `#ec4899` / 黄 `#eab308`

## 开发规范

- 不加 LSP、debugger、插件系统、跨平台支持 — 这些是明确的反目标
- 新增 Rust 结构体必须加 `#[serde(rename_all = "camelCase")]`
- 新增 Tauri command 必须在 `lib.rs` 的 `invoke_handler` 中注册
- 动画优先用 CSS transition/animation（GPU 加速），复杂场景才用 JS
- 提交信息格式：`feat(模块): 描述` / `fix(模块): 描述` / `style(ux): 描述`
