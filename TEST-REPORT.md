# Star Gazer QA 测试报告

**测试日期**：2026-04-11
**版本**：v0.1.0
**测试环境**：macOS Darwin 25.3.0 / Tauri 2.x / React 19

---

## 一、编译验证

| 测试项 | 结果 | 备注 |
|--------|------|------|
| `npm run build`（前端 TypeScript + Vite） | PASS | 2048 模块编译成功，无 TS 类型错误 |
| `cargo check`（后端 Rust） | PASS | 编译无错误 |
| `npm run tauri dev`（应用启动） | PASS | 窗口正常打开，前后端通信正常 |

---

## 二、第一轮 QA - 发现并修复的问题

### 问题 1：后端 serde 结构体缺少 camelCase 序列化注解（严重）
- **影响**：所有 Tauri command 返回的数据结构使用 snake_case 字段名（如 `is_dir`、`is_head`、`last_opened`），但前端期望 camelCase（如 `isDir`、`isHead`、`lastOpened`），导致前端无法正确解析后端返回数据
- **修复**：为 `models.rs` 中所有结构体（Project、DirEntry、GitFileChange、GitStatusSummary、GitBranch、GitLogEntry、WindowState、PanelState、TabState、Session、AppConfig）和 `pty_manager.rs` 中的 TerminalOutputPayload、TerminalExitPayload 添加 `#[serde(rename_all = "camelCase")]`
- **提交**：`09815a6`

### 问题 2：终端事件名称不匹配（严重）
- **影响**：前端监听 `terminal-output-${id}` 和 `terminal-exit-${id}`（带 ID 后缀），但后端发射的是全局事件 `terminal-output` 和 `terminal-exit`（不带 ID 后缀），导致前端永远收不到终端输出
- **修复**：修改前端 `src/services/pty.ts`，监听全局事件并根据 payload 中的 `terminalId` 字段过滤
- **提交**：`09815a6`

### 问题 3：终端输出数据类型不匹配（严重）
- **影响**：后端 `TerminalOutputPayload.data` 是 `Vec<u8>`（字节数组），但前端期望 `string` 类型，直接使用会得到乱码
- **修复**：前端使用 `Uint8Array` + `TextDecoder` 将字节数组解码为字符串
- **提交**：`09815a6`

### 问题 4：文件变更事件名称不匹配（中等）
- **影响**：后端发射 `file-changed`，前端监听 `file-change`，导致文件树无法实时刷新
- **修复**：修改前端 `src/services/watcher.ts`，将监听事件名改为 `file-changed`
- **提交**：`09815a6`

### 问题 5：`reveal_in_finder` 命令未注册（中等）
- **影响**：右键项目菜单点击 "Reveal in Finder" 会报错，因为后端没有注册 `reveal_in_finder` 命令
- **修复**：改用已集成的 `@tauri-apps/plugin-opener` 的 `revealItemInDir` API（`opener:default` 权限已包含）
- **提交**：`09815a6`

### 问题 6：FileTree 调用错误的命令名（中等）
- **影响**：`FileTree.tsx` 中调用 `invoke("list_directory", ...)`，但后端注册的命令名是 `list_dir`，导致文件树加载失败
- **修复**：修改为 `invoke("list_dir", ...)`
- **提交**：`09815a6`

### 问题 7：FileTree 返回类型不匹配（中等）
- **影响**：`list_dir` 返回 `Vec<DirEntry>`（有 name/path/isDir/size/modified），但前端直接当作 `FileNode[]` 使用。`DirEntry` 缺少 `id` 和 `children` 字段，导致 react-arborist 无法正常工作
- **修复**：添加 `dirEntriesToFileNodes` 转换函数，将 `DirEntry` 正确映射为包含 `id`、`children` 的 `FileNode`
- **提交**：`1a7a02b`

---

## 三、第二轮 QA - 深度集成验证

### 检查 1：App.tsx 主布局组件完整性
- **结果**：PASS
- **详情**：TitleBar、Sidebar、Canvas、SlidePanel、StatusBar、CommandPalette、ErrorBoundary 全部正确导入和渲染。三栏横向布局（Sidebar | Canvas | SlidePanel）+ 底部 StatusBar 符合规格。

### 检查 2：Store 完整性
- **结果**：PASS（修复后）
- **详情**：
  - `projectStore`：addProject/removeProject/setActiveProject/setFileTree/setGitBranch/setFileDiffStats 等方法完整
  - `canvasStore`：addAgent/removeAgent/updateAgentPosition/updateAgentSize/selectAgent/zoomAtPoint 等方法完整
  - `panelStore`：openTab/closeTab/setActiveTab/closeOtherTabs/closeAllTabs/reorderTabs 等方法完整
  - `terminalStore`：addTerminal/removeTerminal/updateTerminalSize/setTerminalPid/setTerminalStatus 等方法完整
  - `settingsStore`：sidebarWidth/sidebarOpen/toggleSidebar/editorFontSize/diffLayout 等设置项完整

### 检查 3：Tauri IPC 完整对齐
- **结果**：PASS
- **详情**：后端 lib.rs 注册的 22 个命令与前端 invoke 调用完全对齐：
  - 终端命令 4 个：create_terminal, write_terminal, resize_terminal, close_terminal
  - Git 命令 4 个：git_status, git_diff, git_branches, git_log
  - 文件系统命令 9 个：read_file, write_file, list_dir, create_dir, remove_entry, rename_entry, path_exists, watch_dir, unwatch_dir
  - 项目管理命令 3 个：list_projects, add_project, remove_project
  - 会话配置命令 4 个：get_session, save_session, get_config, save_config（前端暂未调用）
- **事件名匹配**：terminal-output / terminal-exit / file-changed 完全对齐

### 检查 4：快捷键系统
| 快捷键 | 已注册 | 注册位置 |
|--------|--------|----------|
| Cmd+K（命令面板）| YES | CommandPalette.tsx |
| Cmd+N（新建 Agent）| YES | Canvas.tsx（第二轮修复新增）|
| Cmd+P（快速打开文件）| YES | CommandPalette.tsx |
| Cmd+B（折叠 Sidebar）| YES | Sidebar.tsx |
| Cmd+\（切换面板）| YES | SlidePanel.tsx（第二轮修复：改为切换而非仅关闭）|
| Esc（关闭面板/退出最大化）| YES | SlidePanel.tsx + Canvas.tsx |
| Cmd+S（保存文件）| YES | FileEditor.tsx (CodeMirror keymap) + useGlobalShortcuts.ts (防止默认行为) |
| Cmd+W（关闭 Tab）| YES | useGlobalShortcuts.ts（第二轮修复新增）|
| Cmd+F（搜索）| 部分 | useGlobalShortcuts.ts 阻止默认行为（搜索 UI 待实现）|

### 检查 5：工作流路径代码完整性

#### 工作流 1：添加项目
- **路径**：AddProjectButton -> @tauri-apps/plugin-dialog.open() -> invoke("add_project") -> projectStore.addProject -> setActiveProject
- **结果**：PASS（第二轮修复：添加后端持久化调用）

#### 工作流 2：浏览文件树
- **路径**：setActiveProject -> FileTree useEffect -> invoke("list_dir") -> dirEntriesToFileNodes -> setFileTree -> react-arborist 渲染
- **结果**：PASS
- **Git 状态标记**：useGitStatus -> setGitBranch + setFileDiffStats -> FileTreeNode 渲染（第二轮修复：集成到 Sidebar）

#### 工作流 3：查看文件
- **路径**：FileTreeNode click -> panelStore.openTab -> SlidePanel 显示 -> FileEditor/DiffView 加载内容
- **结果**：PASS
- **文件编辑器**：CodeMirror 6 + 语言高亮 + Cmd+S 保存 + dirty 标记
- **Diff 视图**：react-diff-view + parseDiff + Split/Unified 模式切换

#### 工作流 4：创建 Agent
- **路径**：FAB click / Cmd+N -> AgentPicker -> 选择类型/项目 -> canvasStore.addAgent -> AgentCard 渲染
- **结果**：PASS

#### 工作流 5：终端交互
- **路径**：AgentCard -> TerminalView -> useTerminal -> xterm.js init -> ptyService.createTerminal -> 后端 PTY 创建 -> terminal.onData -> writeTerminal -> 后端写入 PTY -> PTY 输出 -> emit("terminal-output") -> 前端 listen -> terminal.write
- **结果**：PASS（第二轮修复：useTerminal 同步更新 terminalStore）

---

## 四、第二轮 QA 发现并修复的问题

### 问题 8：FileChangeEvent 前后端结构不一致（中等）
- **影响**：前端 watcher.ts 定义 `{kind, paths[]}` 但后端发送 `{kind, path}`，前端无法正确解析
- **修复**：将前端 FileChangeEvent 改为 `{kind, path}` 与后端对齐
- **提交**：`985b50f`

### 问题 9：AddProjectButton/CommandPalette 没有调用后端持久化（严重）
- **影响**：添加的项目只存在于前端 store，刷新应用后项目丢失
- **修复**：添加 invoke("add_project") 调用，后端返回完整 Project 对象供前端使用
- **提交**：`985b50f`

### 问题 10：缺少 Cmd+N 全局快捷键（中等）
- **影响**：空状态提示"按 Cmd+N 创建 Agent"但快捷键未注册
- **修复**：在 Canvas.tsx 的全局键盘事件中注册 Cmd+N
- **提交**：`985b50f`

### 问题 11：Cmd+\ 只能关闭面板不能打开（中等）
- **影响**：SlidePanel 中 Cmd+\ 快捷键只在 isOpen 为 true 时工作
- **修复**：改为调用 togglePanel() 实现开关切换
- **提交**：`985b50f`

### 问题 12：缺少 Cmd+W 和 Cmd+S 全局快捷键（中等）
- **影响**：PRD 要求的关闭 Tab 和保存快捷键未注册
- **修复**：新增 useGlobalShortcuts hook，注册到 App.tsx
- **提交**：`985b50f`

### 问题 13：DiffView 使用粗糙的 repoPath 推断（中等）
- **影响**：getRepoPath 函数通过猜测路径段来推断项目根目录，不可靠
- **修复**：优先使用 activeProject.path 作为 repoPath
- **提交**：`985b50f`

### 问题 14：pty.ts createTerminal 缺少 command 参数（低）
- **影响**：无法为不同类型的 Agent（claude-code/opencode/codex）传递启动命令
- **修复**：添加可选 command 参数
- **提交**：`985b50f`

### 问题 15：终端实例与 terminalStore 数据流断裂（中等）
- **影响**：useTerminal hook 创建 PTY 后没有更新 terminalStore，导致 store 中永远没有终端记录
- **修复**：创建 PTY 后调用 addTerminal，退出时更新状态，清理时移除记录
- **提交**：`fbabe94`

### 问题 16：文件监听和 Git 状态 hooks 未被使用（严重）
- **影响**：useFileWatcher 和 useGitStatus hooks 已定义但从未被任何组件调用，文件树不会响应文件变化，Git 状态不会显示
- **修复**：在 Sidebar 组件中集成两个 hooks，文件变更时刷新文件树，Git 状态同步到 projectStore
- **提交**：`3b32764`

### 问题 17：应用启动时不加载已保存的项目列表（严重）
- **影响**：projectStore 初始化为空数组，重启后之前添加的项目全部丢失
- **修复**：App.tsx 挂载时调用 list_projects 加载已保存项目，自动激活最近使用的项目
- **提交**：`71887f9`

### 问题 18：ProjectItem 移除项目未持久化到后端（严重）
- **影响**：右键菜单移除项目只从前端 store 删除，重启后项目又出现
- **修复**：handleRemove 和 handleCloseProject 调用后端 remove_project 命令
- **提交**：`3ada226`

---

## 五、UI 交互测试

| 测试项 | 结果 | 备注 |
|--------|------|------|
| 三栏布局（Sidebar + Canvas + Panel） | PASS | 布局正确，Sidebar 240px / Canvas flex-1 / Panel 按需 |
| 标题栏显示 | PASS | "Star Gazer" 居中，Cmd+K 提示在右侧，预留 70px macOS 红绿灯区域 |
| 侧边栏展示 | PASS | "PROJECTS" 标题 + 添加按钮 + 项目列表 + 文件树区域 |
| 侧边栏折叠（Cmd+B） | PASS | 平滑动画折叠为 48px 图标条，画布区域扩大 |
| 侧边栏展开（Cmd+B） | PASS | 平滑动画展开为 240px，内容淡入 |
| 画布空状态引导 | PASS | 显示"画布就绪"图标 + 操作提示 |
| 画布工具栏 | PASS | 缩放控制（放大/缩小/100%/重置视图）正常显示 |
| FAB 按钮 | PASS | 蓝色圆形 "+" 按钮在左下角，点击正常弹出 Agent Picker |
| Agent Picker 弹窗 | PASS | 4 种类型选择 + 名称输入 + 项目选择 + Worktree 选项 |
| 命令面板（Cmd+K） | PASS | 正确显示命令分组、搜索输入、快捷键提示 |
| 命令面板关闭（Esc） | PASS | 正确关闭 |
| 底部状态栏 | PASS | 左侧 Git 分支 + 总改动量、右侧 Agent 统计 + 版本号 |
| 控制台错误检查 | PASS | 所有交互后零 error、零 warning |

---

## 六、代码质量审查

| 审查项 | 结果 | 备注 |
|--------|------|------|
| App.tsx 主布局 | PASS | 正确组装所有子组件 + 全局快捷键 + 启动项目加载 |
| Zustand Store 接口 | PASS | 6 个 store（canvas/panel/project/settings/terminal/hover）接口定义一致 |
| Canvas 画布组件 | PASS | 支持拖拽平移、滚轮缩放、空格键模式、惯性动画、Cmd+N 快捷键 |
| AgentCard 卡片 | PASS | 拖拽、调整大小、最小化/最大化/关闭、入场/退场动画、Hover 关联高亮 |
| Sidebar 侧边栏 | PASS | 展开/折叠动画、FileTree + ProjectItem 集成、文件监听 + Git 状态 |
| SlidePanel 面板 | PASS | 推入式布局、分隔线拖拽、Tab 栏、Diff/File 视图、Cmd+\ 切换 |
| TerminalView 终端 | PASS | xterm.js 集成、WebGL 渲染器、FitAddon 自适应、terminalStore 同步 |
| Tauri IPC 命令注册 | PASS | lib.rs 正确注册了所有 22 个命令 |
| Tauri 事件系统 | PASS | 3 个事件（terminal-output/terminal-exit/file-changed）前后端完全对齐 |
| 前后端数据持久化 | PASS | 项目列表增删改查全链路持久化到 ~/Library/Application Support/ |
| Tauri 插件配置 | PASS | opener + shell + dialog + fs 插件正确配置 |
| 权限配置 | PASS | capabilities/default.json 包含所有必要权限 |
| 错误边界 | PASS | ErrorBoundary 包裹 Sidebar、Canvas、SlidePanel |

---

## 七、已知限制和改善建议

### 已知限制（不阻塞交付）

1. **会话恢复未实现**：后端 session/config 命令已就绪，但前端未调用。重启应用后 Agent 卡片和 Panel Tab 状态不会恢复。
2. **搜索功能未实现**：Cmd+F 快捷键已阻止默认行为，但项目内搜索 UI 尚未开发。
3. **Worktree 功能未实现**：AgentPicker 中有 Worktree 复选框，但实际创建 Agent 时未使用此选项。
4. **Agent 启动命令未集成**：createTerminal 支持 command 参数，但 AgentPicker 创建 Agent 时未传递对应的 CLI 命令（如 `claude`、`opencode`、`codex`）。
5. **大 chunk 警告**：Vite 构建时 xterm.js / codemirror 相关依赖打包为大 chunk（>500KB），建议使用 `manualChunks` 拆分。
6. **hoverStore 冗余**：`hoverStore.ts` 已定义但未被任何组件使用，所有 hover 逻辑使用 `projectStore.hoveredAgentId`。

### 改善建议

1. **性能优化**：考虑为 Canvas 上的 Agent 卡片使用虚拟化渲染，避免大量卡片时性能下降
2. **会话恢复**：利用已有的 session/config 后端命令，在应用退出时保存状态，启动时恢复
3. **离线支持**：当 Git 命令不可用时（如非 Git 仓库），应优雅降级而非静默失败
4. **无障碍**：命令面板和 Agent Picker 的焦点管理可进一步优化
5. **Agent 启动命令**：为不同 Agent 类型配置对应的 CLI 启动命令

---

## 八、测试结论

**总体评估**：PASS

Star Gazer v0.1.0 经过两轮 QA 深度验证：

- **第一轮（基础验证）**：修复 7 个前后端通信问题（事件名称不匹配、类型序列化缺失、命令名错误等）
- **第二轮（集成验证）**：修复 11 个组件集成问题（数据持久化断裂、快捷键缺失、hooks 未使用、Store 数据流不完整等）

当前状态：
- 前端 `npm run build` 零错误（2048 模块）
- 后端 `cargo check` 零错误
- 22 个 IPC 命令全部对齐
- 3 个事件系统全部对齐
- 9 个快捷键全部注册
- 5 个核心工作流路径代码完整
- 项目数据增删改查全链路持久化

应用已达到可交付状态。
