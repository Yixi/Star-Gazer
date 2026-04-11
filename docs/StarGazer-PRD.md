# Star Gazer PRD

## 1. 产品概述

### 1.1 产品定位

Star Gazer 是一款为 **vibe coding 时代**设计的 Mac 原生轻量开发工作台。它不是又一个 IDE 的翻版，而是围绕"同时指挥多个 AI 编程 agent"这一全新工作模式重新设计的开发环境。

用户的主要工作流不再是"敲代码"，而是：
- 同时启动多个 AI agent（Claude Code / OpenCode / Codex 等）并行工作于不同任务
- 实时审查 agent 产生的文件变更
- 在多个项目之间切换和协调
- 偶尔手动介入修改某个文件

传统 IDE 的"代码编辑器 + 侧边栏"布局是围绕**单人手工编码**设计的，把代码编辑器放在中心、把终端压缩成底部小面板。Star Gazer 反过来——**把终端和 agent 放在舞台中央**，文件和 diff 变成"按需召唤"的辅助视图。

### 1.2 产品名称由来

Star Gazer（观星者）。在 vibe coding 时代，开发者更像是一位观星者——指挥多个 AI agent 在代码宇宙中探索，观察它们的运行轨迹，偶尔调整方向。

### 1.3 一句话描述

一个 Mac 原生、极致轻量、专为多 agent 并行工作流设计的开发工作台。

---

## 2. 目标用户

### 2.1 核心用户画像

重度使用终端 AI 编程工具（Claude Code / Codex / Aider / OpenCode 等）的开发者，具有以下特征：

- 日常同时维护多个 git 仓库
- 习惯让 AI agent 承担 70% 以上的代码编写工作
- 经常需要同时跑多个 agent 处理不同任务（例如一个修 bug、一个加功能、一个写测试）
- 对现有 IDE 的内存占用和功能冗余感到不满
- 对 UI 视觉质感有要求，不接受功能导向但丑陋的工具

### 2.2 典型使用场景

- **场景 A**：同时运行 3 个 Claude Code 实例，分别在 3 个 worktree 里并行推进不同 feature，定期审查各自的改动
- **场景 B**：一边让 agent 跑重构任务，一边手动审查它已经修改完的文件，标记需要人工 review 的地方
- **场景 C**：跨 2-3 个项目同时工作（比如前端 repo + 后端 repo + 共享库），快速在项目之间切换查看各自状态

---

## 3. 产品目标

### 3.1 核心价值主张

1. **agent-native 设计**：围绕"多 agent 并行"重新设计工作台布局，而不是在传统 IDE 上打补丁
2. **审查效率优先**：让"看 agent 改了什么"这件事变得一瞥即知，而不需要切换多个面板
3. **极致轻量**：内存占用比主流 IDE 小一个数量级
4. **视觉质感**：达到 Linear、Raycast、Arc 级别的 UI 精致度

### 3.2 明确的反目标

Star Gazer **不做**以下事情（划定清晰的功能边界）：

- ❌ **不做 LSP、代码补全、跳转定义、重构工具** —— 这些交给 AI agent 处理
- ❌ **不做 debugger** —— 用户在终端里用原生工具
- ❌ **不做插件系统** —— 保持核心精简
- ❌ **不做跨平台** —— 只服务 Mac，充分利用原生能力
- ❌ **不和 VSCode / Cursor 拼功能完整度** —— 做减法才能做出差异化
- ❌ **不做 commit / push / pull 的 GUI** —— 用户在终端里用 git 或 lazygit
- ❌ **不做 merge conflict 解决工具**
- ❌ **不做远程仓库管理**
- ❌ **不做协作功能**

### 3.3 性能硬指标

| 指标 | 要求 |
|---|---|
| 冷启动时间 | < 1.2 秒 |
| 空闲内存占用 | < 150 MB |
| 应用二进制大小 | < 25 MB |
| 终端输入延迟 | < 16ms（60fps 级别） |
| 画布拖拽帧率 | 稳定 60fps |
| 文件树初始化（10 个项目，各 5000 文件） | < 500ms |

性能指标是硬约束，任何功能设计都不能破坏这些指标。

---

## 4. 整体布局

Star Gazer 的窗口采用**三栏横向布局**，从左到右依次是：

1. **左侧 Sidebar（固定 240px，可折叠至 48px）** —— 项目和文件树
2. **侧滑文件审查面板（默认 540px，可调宽，可完全关闭）** —— 文件 / diff 查看
3. **画布主区域（剩余空间，自适应）** —— Agent 终端卡片的舞台

底部还有一条 **状态栏（24px）**，显示全局信息。

参见 `StarGazer-Mockup.html` 查看完整的视觉设计稿。

---

## 5. 详细功能规格

### 5.1 左侧 Sidebar（Projects）

#### 5.1.1 基本结构

- 固定宽度 240px，可通过快捷键或按钮折叠到 48px 的图标条模式
- 顶部标题栏显示 "Projects" 文字和一个 "+" 按钮用于添加项目
- 主体区域按项目分组显示，每个项目可独立展开/折叠

#### 5.1.2 项目条目

每个项目在 sidebar 中显示一行，包含：

- 展开/折叠 caret（▼/▶）
- 文件夹 emoji 图标
- 项目名称
- 右侧：当前所在 git 分支名称（小字）
- 项目折叠时，右侧显示一个小圆点，颜色表示"该项目是否有 agent 正在运行"

#### 5.1.3 项目的添加方式

- 点击标题栏的 "+" 按钮 → 弹出系统文件选择器
- 拖拽文件夹到窗口任意位置 → 自动识别为新项目
- 命令面板（Cmd+K）中输入 "Add Project" → 弹出选择器

#### 5.1.4 项目的管理

右键项目名称弹出上下文菜单：

**新建 agent 部分（最上方）**
- "New Claude Code"（快捷键 ⌘1）
- "New OpenCode"（快捷键 ⌘2）
- "New Codex"（快捷键 ⌘3）
- "New Custom Command..."（自定义命令）

**文件操作部分**
- "Open as file card"
- "Open diff"

**项目管理部分**
- "Rename"
- "Reveal in Finder"
- "Close Project"
- "Remove from Star Gazer"

#### 5.1.5 文件树

项目展开后显示其文件树：

- 基于 react-arborist 的虚拟滚动，支持大型项目
- 文件夹可展开/折叠，状态持久化
- 每一级缩进 16px
- 默认隐藏 `.git`、`node_modules`、`.DS_Store` 等常见目录（可在设置中调整）
- 支持从 `.gitignore` 读取忽略规则

#### 5.1.6 文件树的 Git 状态融合（核心差异化）

这是 Star Gazer 最重要的设计之一。文件树**不是纯文件列表**，而是将 git 状态深度融合进来：

- **未改动的文件**：正常显示
- **已改动的文件**：行末右对齐显示 `+X -Y` 的行数统计（绿色 +、红色 -）
- **新增文件**：只显示绿色 `+X`
- **删除文件**：文件名加删除线，显示红色 `-X`
- **未跟踪文件**（`??`）：文件名斜体，前缀一个小的 `?` 符号
- **冲突文件**：前缀红色 `!` 符号

#### 5.1.7 Agent 颜色标记

每个 agent 卡片在创建时被分配一个颜色（从预设色盘中自动选取，确保同一画布上的 agent 颜色不重复）。当该 agent 修改某个文件时，该文件在文件树中的图标会染上对应颜色。

颜色盘：
- 蓝色 `#4a9eff`
- 橙色 `#ff8c42`
- 紫色 `#a78bfa`
- 绿色 `#22c55e`
- 粉色 `#ec4899`
- 黄色 `#eab308`

如果一个文件被多个 agent 修改过，图标显示为渐变（前一半颜色 + 后一半颜色）或使用中性灰色 + 一个小的"多 agent"标记。

#### 5.1.8 实时写入指示

当 FSEvents 检测到某个文件正在被外部进程（即 agent）写入时，该文件名旁边显示一个 6px 的脉动蓝点动画：

- 动画周期：1.4 秒
- 动画效果：透明度和缩放的脉动，带蓝色发光光晕
- 触发条件：文件最后修改时间在过去 3 秒内
- 自动消失：3 秒内没有新的写入事件

这个设计让用户"看见 agent 正在干活"，建立对 agent 活动的直观感知。

#### 5.1.9 Hover 关联高亮（核心差异化）

当鼠标悬停在画布上的任意 agent 终端卡片时：

1. 该卡片自身带上对应颜色的边框和发光效果
2. 左侧文件树中，**被该 agent 修改过的所有文件**自动高亮：
   - 背景渐变（从左到右的淡色）
   - 左侧 2px 的颜色竖条
   - 文件名变白色加粗
3. 同时，**其他 agent 修改过的文件自动变暗**到 35% 透明度
4. 未被任何 agent 修改的普通文件保持正常

鼠标离开卡片后所有效果平滑恢复。

这个交互让用户在多 agent 场景下能一眼看出"谁改了什么"，无需任何点击。

#### 5.1.10 Sidebar 折叠状态

折叠后 sidebar 只有 48px 宽，仅显示：
- 每个项目的单个图标（文件夹或项目自定义图标）
- 小圆点状态指示
- 鼠标悬停某个项目图标时，弹出浮层显示完整的文件树（仅悬停期间可见）

折叠的触发方式：
- 窗口右上角的 Focus 按钮
- 快捷键 `Cmd+B`

---

### 5.2 侧滑文件审查面板（Slide Panel）

#### 5.2.1 基本行为

- 默认宽度 540px，用户可通过拖动右侧的分隔线调整，范围 320px - 900px
- 宽度设置持久化
- 打开时将画布推到右侧，不是覆盖画布
- 完全关闭时画布扩展到占用它的空间
- 打开/关闭有 150ms 的平滑动画

#### 5.2.2 触发方式

**打开面板**：
- 点击文件树中任意文件 → 打开对应文件或 diff
- 双击改动文件 → 强制打开 diff 模式
- 右键菜单中选择 "Open as file card" 或 "Open diff"
- 快捷键 `Cmd+P` 呼出快速打开搜索

**关闭面板**：
- 点击面板右上角的 × 按钮
- 按 `Esc` 键
- 再次点击文件树中当前已激活的文件（toggle 行为）
- 快捷键 `Cmd+\`

#### 5.2.3 Tab 栏

面板顶部是一条 36px 高的 tab 栏：

- 支持**无限 tab**，不做数量上限
- 超出可视宽度时横向滚动
- 右侧出现渐变 fade 效果 + `⋯` 省略号提示有更多 tab
- 最右侧始终固定显示面板关闭按钮 ×

**Tab 的视觉构成**（从左到右）：
1. Agent 颜色的文件图标（文件被谁改过）
2. 文件名
3. 模式徽章：`diff`（蓝色）或 `file`（灰色）
4. 关闭按钮 ×（悬停时高亮）

**Tab 的状态**：
- 未激活：暗色文字
- 悬停：略微提亮背景
- 激活：顶部 2px 蓝色边条 + 稍亮的背景 + 白色文字

#### 5.2.4 Tab 的管理

- 点击 tab → 激活该 tab
- 点击 tab 的 × → 关闭该 tab
- 中键点击 tab → 关闭该 tab
- 右键 tab → 弹出菜单：Close / Close Others / Close All / Pin
- 支持拖拽 reorder
- 关闭最后一个 tab 后面板自动关闭（可在设置中改为保留空面板）

#### 5.2.5 面板工具栏

Tab 栏下方是一条工具栏，显示当前激活 tab 的控制项：

**左侧**：面包屑路径
- 格式：`project-name / folder / subfolder / filename.ts`
- 项目名可点击，点击后切换 sidebar 选中状态
- 文件名高亮显示

**右侧**（从左到右）：
1. Diff 统计：`+24 -8`（仅 diff 模式显示）
2. 模式切换开关：`diff` / `file`（已改动文件可切换，未改动文件只能 file 模式）
3. Diff 布局切换：`split` / `unified`（仅 diff 模式显示）
4. 更多菜单 ⋯（包含：复制路径、在 Finder 中显示、复制 diff 为 patch）

#### 5.2.6 Diff 模式

默认情况下，点击一个**已改动**的文件会以 diff 模式打开。

**Split 视图（默认）**：
- 左右分栏，各占 50%
- 左侧标题 "Before"，显示改动前的代码
- 右侧标题 "After"，显示改动后的代码
- 两栏之间有 1px 分隔线
- 两栏各自显示行号
- 删除行：红色背景 + 红色文字 + 红色行号
- 新增行：绿色背景 + 绿色文字 + 绿色行号
- 上下文行：正常颜色
- Hunk 之间用 `@@ -25,6 +28,14 @@` 风格的分隔符，蓝色背景
- 两栏滚动同步

**Unified 视图**：
- 单栏显示，删除行和新增行交替
- 左侧双列行号（旧行号 + 新行号）
- 行前缀：`-`（删除）、`+`（新增）、空格（上下文）

**语法高亮**：
- 使用 tree-sitter 或 Shiki 提供多语言支持
- 至少覆盖：TypeScript / JavaScript / Python / Rust / Go / Swift / Java / C++ / Markdown / JSON / YAML / HTML / CSS
- 语法高亮和 diff 高亮叠加显示

#### 5.2.7 File 模式

点击**未改动**的文件，或手动切换到 file 模式时：

- 使用 CodeMirror 6 作为编辑器
- 支持完整的语法高亮
- 支持基础编辑操作：输入、撤销、重做、查找替换（`Cmd+F`）
- 支持保存（`Cmd+S`），保存后同步到磁盘
- 支持字体大小调整（`Cmd+` / `Cmd-`）
- 不支持 LSP 相关功能（补全、跳转、错误提示）

#### 5.2.8 Markdown 预览

打开 `.md` 文件时，file 模式下工具栏增加一个额外的切换：`edit` / `preview` / `split`

- **edit**：只显示源代码编辑器
- **preview**：只显示渲染后的预览
- **split**：左右分栏，左边编辑右边预览，滚动同步

预览使用 react-markdown + remark-gfm，支持 GitHub 风格的 markdown（表格、任务列表、代码块等）。

#### 5.2.9 分隔线拖拽

面板和画布之间有一条 4px 宽的分隔线：

- 默认状态：深灰色 `#1a1c23`
- 鼠标悬停：蓝色高亮 `#4a9eff`
- 中间有一个 2x24px 的握把指示
- 光标变为 `col-resize` 样式
- 拖动时实时调整面板宽度
- 双击分隔线：恢复到默认宽度 540px

---

### 5.3 画布（Canvas）

#### 5.3.1 基本属性

画布是 Star Gazer 的核心工作区域，本质上是一个**无限二维平面**，上面摆放各种卡片。

- 背景色：纯色深色 `#0f1116`
- 无网格、无参考线（保持视觉简洁）
- 支持缩放：50% - 200%
- 支持平移：按住空格 + 拖动，或按住 `Option` + 拖动
- 画布内容的滚动状态持久化

#### 5.3.2 画布工具栏

右上角一个半透明的工具栏，显示：

- 当前缩放比例（点击可重置到 100%）
- 当前 layout 预设名称（点击切换预设）
- 布局相关操作菜单 ⋯

工具栏使用 backdrop-filter 产生毛玻璃效果，不遮挡下方内容。

#### 5.3.3 卡片类型

**v1.0 只支持一种卡片类型：Agent 终端卡片**。

文件查看和 diff 都在侧滑面板里完成，不占用画布空间。这是 Star Gazer 与传统画布工具（tldraw、Heptabase 等）的关键区别——**画布只服务于 agent，不杂糅其他内容**。

v2.0 可能引入的额外卡片类型：Git Log 卡片、Notes 卡片等，留作未来扩展。

#### 5.3.4 新建 agent 卡片

两种触发路径：

**路径 A：左下角 FAB 按钮**
- 一个 44x44 的圆形悬浮按钮，渐变蓝色背景
- 点击后弹出 agent picker：
  - 列出所有可用的 agent 类型（Claude Code / OpenCode / Codex / Custom）
  - 列出所有已打开的项目，让用户选择该 agent 工作于哪个项目
  - 可选：是否在新的 git worktree 中启动
- 确认后在画布中心创建新卡片

**路径 B：右键项目**
- 在 sidebar 右键项目名 → "New Claude Code" 等菜单项
- 直接在该项目下创建 agent 卡片，跳过项目选择步骤

**快捷键 Cmd+N**：呼出路径 A 的 picker，但默认选中当前高亮的项目。

#### 5.3.5 卡片基础结构

每个卡片包含：

**头部（36px）**：
- Agent 颜色的圆点（带发光光晕）
- 卡片标题（默认 "agent-type · task-name"，可双击重命名）
- 右侧：所属项目名称（小字灰色）
- 运行状态指示：
  - 绿色圆点：正常运行
  - 黄色圆点：等待用户输入（approval 等）
  - 红色圆点：报错
  - 灰色：已退出
- 右侧操作按钮：最小化 / 关闭

**主体**：
- 集成 xterm.js 的终端视图
- 使用等宽字体（默认 SF Mono，可在设置中改）
- 支持复制、粘贴、全选
- 支持 ANSI 颜色和样式
- 支持鼠标点击和滚轮

#### 5.3.6 卡片操作

- **拖动**：按住卡片头部任意非按钮区域拖动
- **调整大小**：鼠标悬停卡片边缘和四角时显示调整手柄
- **最小化**：点击头部最小化按钮，卡片收缩为只显示头部的条状
- **最大化**：双击头部，卡片扩展为画布全屏（Esc 恢复）
- **关闭**：点击关闭按钮，弹出确认对话框（如果 agent 进程还在运行）

#### 5.3.7 卡片的拖动和对齐

- 拖动时实时更新位置，保证 60fps
- 不做自动吸附对齐（保持自由度）
- 画布无限延伸，卡片可以被拖到任意位置
- 如果卡片被拖出当前可视区域，画布可通过平移追上

#### 5.3.8 Layout 预设

用户可以保存当前画布上所有卡片的位置和大小为一个 layout 预设：

- 预设包含：卡片列表、每张卡片的位置和尺寸、每张卡片关联的 agent 配置（类型、项目、工作目录）
- 预设不包含：终端的实时内容
- 工具栏中可切换预设，切换时会询问是否关闭当前运行的 agent
- 用户可命名预设，例如 "auth-refactor"、"bug-triage"、"4-parallel-agents" 等
- 预设存储在本地配置文件中

---

### 5.4 Agent 终端卡片详细规格

#### 5.4.1 支持的 agent 类型

**Claude Code**
- 启动命令：`claude`（可在设置中自定义路径和参数）
- 颜色：蓝色 `#4a9eff`
- 图标：Claude Code 的 logo（如果有）或通用 terminal 图标
- 支持 `--worktree` 参数

**OpenCode**
- 启动命令：`opencode`（可在设置中自定义）
- 颜色：橙色 `#ff8c42`
- 图标：OpenCode 的 logo

**Codex**
- 启动命令：`codex`（可在设置中自定义）
- 颜色：紫色 `#a78bfa`
- 图标：Codex 的 logo

**Custom Command**
- 用户输入任意 shell 命令
- 颜色：用户选择或随机分配
- 图标：通用 terminal 图标
- 适用于：aider、cursor CLI、自定义脚本、或只是一个普通 shell

#### 5.4.2 PTY 工作目录

每个 agent 卡片绑定一个工作目录：

- 默认：所属项目的根目录
- 可选：该项目的某个 git worktree
- 在 agent picker 中可选择"在新 worktree 中启动"，自动创建 `project-worktree-<timestamp>` 的分支

#### 5.4.3 PTY 生命周期

- 创建卡片时启动 PTY 进程
- 关闭卡片时给进程发送 SIGTERM，等待 3 秒后发送 SIGKILL
- 应用退出时所有 PTY 进程被清理
- 进程意外退出时卡片变为"已退出"状态，保留终端输出供查看，提供"重启"按钮

#### 5.4.4 终端功能

- 支持 256 色和 true color
- 支持 xterm.js 的 WebGL 渲染器（性能更好）
- 支持链接识别和点击打开
- 支持搜索（`Cmd+F` 在激活卡片内）
- 支持复制/粘贴
- 滚动缓冲区默认 10000 行（可配置）
- 支持字体大小调整（`Cmd + +/-`）

---

### 5.5 状态栏（Status Bar）

窗口底部 24px 高的细条，显示全局信息：

**左侧**：
- 当前激活项目的名称
- 当前分支
- 总改动量（所有项目聚合）：`+168 -28 across 7 files`
- 面板宽度（如果面板打开）

**右侧**：
- Agent 数量统计：`3 agents · 2 running · 1 waiting`
- 应用版本号（悬停显示）

状态栏项目可点击：
- 点击项目名 → sidebar 滚动到该项目
- 点击分支名 → 弹出分支切换菜单
- 点击改动统计 → 打开"全部改动"的 diff 视图
- 点击 agent 统计 → 画布缩放到俯瞰所有 agent 卡片

---

### 5.6 命令面板（Command Palette）

通过 `Cmd+K` 呼出，基于 cmdk 库实现。

#### 5.6.1 支持的命令类别

- **Projects**：Add Project / Switch to Project / Close Project
- **Files**：Open File / Open Diff / Search File
- **Agents**：New Claude Code / New OpenCode / New Codex / Focus Agent
- **Canvas**：Reset Zoom / Fit All Agents / Save Layout / Switch Layout
- **Panel**：Toggle Panel / Close All Tabs
- **View**：Toggle Sidebar / Toggle Focus Mode / Toggle Theme
- **Settings**：Open Settings / Reload Window / Quit

#### 5.6.2 快速搜索

命令面板支持：
- 模糊搜索命令名称
- 直接输入文件名搜索所有项目中的文件
- 前缀过滤：`>` 只显示命令，`#` 只显示文件，`@` 只显示 agent

---

### 5.7 快捷键总表

| 快捷键 | 功能 |
|---|---|
| `Cmd+K` | 命令面板 |
| `Cmd+N` | 新建 agent |
| `Cmd+P` | 快速打开文件 |
| `Cmd+Shift+P` | 跨所有项目搜索文件 |
| `Cmd+B` | 折叠/展开 sidebar |
| `Cmd+\` | 打开/关闭文件面板 |
| `Esc` | 关闭面板 / 退出最大化 |
| `Cmd+F` | 在当前激活视图内搜索 |
| `Cmd+S` | 保存当前编辑的文件 |
| `Cmd+W` | 关闭当前 tab |
| `Cmd+1/2/3...` | 切换到第 N 个 tab |
| `Cmd+Shift+\` | 进入/退出 Focus Mode |
| `Cmd++/-/0` | 字体大小调整 |
| `Space+拖拽` | 平移画布 |
| `Option+拖拽` | 平移画布（替代） |
| `Cmd+滚轮` | 缩放画布 |

---

### 5.8 设置

通过 `Cmd+,` 打开设置窗口，包含以下分类：

**General**
- 主题：Dark / Light / Auto（跟随系统）
- 语言：English / 中文
- 启动时恢复上次的会话

**Appearance**
- UI 字体
- 编辑器字体和字号
- 终端字体和字号
- 画布背景色微调

**Agents**
- Claude Code 的可执行文件路径
- OpenCode 的可执行文件路径
- Codex 的可执行文件路径
- 默认 shell（用于 Custom Command）
- 默认是否在 worktree 中启动

**Git**
- 忽略的文件模式（额外的 gitignore 规则）
- 是否显示 untracked 文件

**Panel**
- 默认宽度
- 默认 diff 布局（split / unified）
- 关闭最后一个 tab 时是否自动关闭面板

**Canvas**
- 缩放灵敏度
- 平移键（Space / Option / 两者）
- 是否显示画布坐标

**Performance**
- 滚动缓冲区大小
- 文件监听去抖动间隔
- 是否启用 WebGL 终端渲染器

---

## 6. 技术架构

### 6.1 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 应用框架 | Tauri 2.x | 使用系统 WKWebView，不打包 Chromium |
| 前端语言 | TypeScript | 严格模式 |
| 前端框架 | React 19 + Vite | 快速构建 |
| 样式 | Tailwind CSS + shadcn/ui | 高质量组件 + 可定制 |
| 状态管理 | Zustand | 轻量、TypeScript 友好 |
| 终端渲染 | xterm.js + webgl addon + fit addon | VSCode 同款 |
| 代码编辑器 | CodeMirror 6 | 比 Monaco 轻一半 |
| 文件树 | react-arborist | 虚拟滚动 |
| Diff 显示 | react-diff-view | 成熟方案 |
| Markdown 预览 | react-markdown + remark-gfm | 标准 GFM |
| 图标 | lucide-react | 一致的视觉风格 |
| 命令面板 | cmdk | Linear / Raycast 同款 |
| 后端语言 | Rust | 系统级性能 |
| PTY | portable-pty | Rust 里最成熟的 PTY 库 |
| Git | **shell out 到系统 git 命令** | 参考 VSCode 的做法，不使用 libgit2 |
| 文件监听 | notify | 跨平台文件系统事件 |
| 最低系统要求 | macOS 14 (Sonoma) | 用上新版 API |

### 6.2 Git 方案说明

Star Gazer **不使用 libgit2**，而是直接调用系统的 `git` 命令行，原因：

1. 功能完整性：git CLI 永远是 git 功能的完整超集，libgit2 总是在追赶
2. 行为一致性：用户终端里的 git 行为和 Star Gazer 里的完全一致，不会出现边缘情况差异
3. 免编译：不需要编译 C 代码，跨版本打包无痛
4. 性能足够：git 进程启动 5-20ms，对人的感知可忽略
5. VSCode 的验证：VSCode 使用这种方案多年，证明可行

实现方式：Rust 端封装一个 `GitService`，内部通过 `tokio::process::Command` spawn `git` 子进程，解析 stdout 输出为结构化数据返回。

### 6.3 PTY 方案说明

前端的 xterm.js 和后端的 portable-pty 之间通过 Tauri 的 IPC 通信：

1. 前端创建新终端时，调用 Tauri command `create_terminal`
2. 后端 spawn PTY 子进程，返回 terminal id
3. 后端通过 Tauri event 把 PTY 的 stdout/stderr 流式推给前端
4. 前端通过 Tauri command `write_terminal` 把用户输入发回后端
5. 终端大小改变时前端调用 `resize_terminal`
6. 关闭时前端调用 `close_terminal`

### 6.4 进程隔离

所有 PTY 进程由一个独立的 Rust 线程池管理，崩溃或卡死不会影响主进程或渲染进程。参考 VSCode 的 PtyHostService 设计。

---

## 7. 数据持久化

Star Gazer 在本地存储以下数据：

**应用配置**（`~/Library/Application Support/StarGazer/config.json`）
- 所有设置项
- 字体、主题等偏好

**项目列表**（`~/Library/Application Support/StarGazer/projects.json`）
- 已添加的项目路径列表
- 每个项目的展开状态、滚动位置

**Layout 预设**（`~/Library/Application Support/StarGazer/layouts/`）
- 每个预设一个 JSON 文件
- 包含卡片布局和 agent 配置

**会话状态**（`~/Library/Application Support/StarGazer/session.json`）
- 上次关闭时的窗口大小、位置
- 打开的项目、面板状态、已打开的 tab

Star Gazer **不存储**：
- 终端的历史输出（运行时内存中，关闭即丢失）
- 文件内容（直接读写磁盘）
- 任何用户代码或 git 数据

---

## 8. 版本规划

### 8.1 v1.0（MVP）

**必须包含**：
- 左侧 Sidebar 完整功能
- 侧滑文件面板 + diff + 文件编辑
- 画布 + agent 终端卡片
- Claude Code / OpenCode / Codex / Custom Command 支持
- 状态栏
- 命令面板
- 基础快捷键
- 深色主题

**不包含**：
- 浅色主题
- Markdown 预览
- Layout 预设
- 多项目跨搜索

### 8.2 v1.1

- 浅色主题和 auto 主题
- Markdown 预览
- Layout 预设保存和切换
- 跨项目文件搜索
- Git worktree 的 UI 管理

### 8.3 v2.0（探索性）

- 新的卡片类型：Git Log 卡片、Notes 卡片
- Agent 之间的协作流水线（一个 agent 完成后触发下一个）
- 快照功能：保存某个时刻所有项目的状态，后续可回溯
- 和浏览器插件联动：在网页里选中代码片段直接发给某个 agent

---

## 9. 设计原则

贯穿整个产品的设计原则：

1. **Terminal-First**：终端和 agent 是主角，文件和 diff 是辅助
2. **Peek Don't Browse**：用户是"瞥一眼就知道状态"，而不是"打开面板慢慢浏览"
3. **One Thing Per Card**：画布上每张卡片只做一件事
4. **Invisible Until Needed**：辅助 UI（面板、菜单、HUD）默认隐藏，召唤时出现
5. **Respect the User's Layout**：用户摆放的卡片位置永远不被自动重排
6. **Fast is a Feature**：性能不是优化项，而是核心特性

---

## 10. 附件

### 视觉设计稿

完整的 UI 视觉设计参见 `StarGazer-Mockup.html`，用浏览器打开即可查看：

- 展示了左侧 Sidebar、侧滑文件面板、画布的完整布局
- 展示了面板打开状态下的 tab 栏、diff 视图
- 展示了 agent 卡片的头部和内容
- 展示了 agent 颜色标记、实时写入动画等细节

所有颜色、间距、字号、圆角在 mockup 中都已确定，开发时严格参照。

### 色板定义

**背景层次**
- 应用背景：`#06070a`（最深）
- 窗口背景：`#0a0b0f`
- Sidebar 背景：`#0d0e13`
- 画布背景：`#0f1116`
- 卡片背景：`#161820`
- 卡片头部：`#1a1d26`
- 代码区域：`#0d0f14`

**边框**
- 主边框：`#1a1c23`
- 次边框：`#1f2128`
- 分隔线：`#2a2f3b`

**文字**
- 主要文字：`#e4e6eb`
- 次要文字：`#b8bcc4`
- 辅助文字：`#8b92a3`
- 提示文字：`#6b7280`
- 占位符：`#4a5263`

**强调色**
- 主色（蓝）：`#4a9eff`
- Agent 蓝：`#4a9eff`
- Agent 橙：`#ff8c42`
- Agent 紫：`#a78bfa`
- Agent 绿：`#22c55e`
- Agent 粉：`#ec4899`
- Agent 黄：`#eab308`

**状态色**
- 成功 / 新增：`#22c55e`
- 错误 / 删除：`#ef4444`
- 警告 / 待定：`#febc2e`
- 信息 / 进行中：`#4a9eff`

### 字体定义

- **UI 字体**：`-apple-system, 'SF Pro Display', system-ui`
- **等宽字体**：`'SF Mono', Menlo, 'Cascadia Code', monospace`
- **基础字号**：13px（sidebar、按钮、tab）
- **小字号**：11px（徽章、统计）
- **微型字号**：10px（状态栏、标签）
- **代码字号**：11px（diff、文件内容、终端）
