<div align="center">

# Star Gazer ✨

**一款 Mac 原生、极致轻量，为"同时指挥多个 AI agent"而生的开发工作台。**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)]()
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)]()
[![English](https://img.shields.io/badge/Language-English-blue)](./README.md)

把终端和 agent 放在舞台中央，把文件和 diff 变成"按需召唤"的辅助视图。

为那些已经让 AI 承担 70% 编码工作、经常同时跑三个 agent 的开发者而做。

[下载最新版本](https://github.com/Yixi/Star-Gazer/releases) · [Read the English README](./README.md)

<img src="./assets/screenshot.png" alt="Star Gazer 截图" width="100%" />

</div>

## 📖 Star Gazer 是什么？

Star Gazer 是一款专为 **vibe coding 时代** 重新设计的 Mac 原生开发工作台。

传统 IDE 的布局是围绕"单人手工编码"设计的——代码编辑器放在中心，终端被压缩成底部的小面板。Star Gazer 把这个关系反过来：**终端和 agent 站在舞台中央**，文件和 diff 变成从侧边滑入的辅助视图。

它特别适合这样的工作流：

- 同时跑三个 `Claude Code` / `OpenCode` / `Codex` 实例，分别在不同的 git worktree 里推进不同 feature
- 跨多个仓库（前端 + 后端 + 共享库）同时指挥 agent，无需 `cd` 来回切换
- 把一个**父目录**拖进 sidebar，Star Gazer 自动识别其下每一个 git 仓库，各自成为独立 project
- 让 agent 跑重构任务，同时人工审查它已经改完的文件

## ✨ 核心特性

- **🎭 Agent 优先的画布**：无限二维画布上每张卡片都是一个 agent 终端，不再是堆叠的文件 tab。
- **🗂️ 多仓库 / 父目录工作区**：既可以手动添加多个项目，也可以直接指向一个父目录，让 Star Gazer 自动发现其下所有 git 仓库。每个项目有独立的文件树、分支、agent 会话和颜色标识。
- **🌈 深度融合 Git 状态的文件树**：每个仓库各自显示 `+X -Y` 行数统计、新增 / 删除 / 未跟踪 / 冲突状态，以及每个 agent 对应颜色的标记。
- **👁️ Hover 即知"谁改了什么"**：鼠标移到任意 agent 卡片上，sidebar 里被该 agent 修改过的文件会高亮，其他文件自动变暗——无需点击。
- **💓 实时写入脉动**：agent 正在写入的文件旁会浮现 1.4 秒循环的蓝色脉动点，让你真正"看见"agent 在干活。
- **🪟 浮动审查面板**：右侧 800px 的浮层，承载 diff、文件查看、Markdown 预览。左缘可拖拽调宽，按 Esc 收起，不占用画布空间。
- **🍎 像 Mac 应用一样轻**：Tauri 2 + WKWebView，二进制 < 25MB，空闲内存 < 150MB，冷启动 < 1.2 秒。
- **⌨️ 键盘优先**：`Cmd+K` 命令面板、`Cmd+N` 新建 agent、`Cmd+B` 折叠 sidebar、`Cmd+\` 开关面板。
- **🎨 Linear 级别的视觉质感**：精调的深色主题，60fps 拖动，GPU 加速的过渡动画。

## 💡 为什么选择 Star Gazer？

Star Gazer 基于一个判断：**当 AI 写掉越来越多的代码，开发者的工作重心从"敲代码"转移到了"审阅和指挥"。UI 也该随之进化。**

| 传统 IDE 的问题 | Star Gazer 的做法 |
| :--- | :--- |
| **终端是二等公民**，被塞进底部小面板。 | **终端就是舞台**。每个 agent 在无限画布上都有一张独立卡片。 |
| **LSP、debugger、插件、Git GUI、合并工具**一股脑打包，基础内存 500MB 起步。 | **大胆做减法**。不做 LSP、不做 debugger、不做插件，这些交给 agent。 |
| **"哪个 agent 改了哪些文件？"** 要在多个 diff 面板之间来回切。 | **hover 一下就告诉你**。agent 颜色实时渲染到文件树上。 |
| **跨平台冗余**：Electron + Chromium，人人都要付的税。 | **只服务 Mac**，基于 WKWebView，体积和性能都回到原生水准。 |

## 🚀 快速上手

*Star Gazer 当前处于 Alpha 阶段，还会有粗糙的边角，但迭代速度会非常快。*

### 下载客户端

预编译的 `.dmg` 安装包将在 [GitHub Releases](https://github.com/Yixi/Star-Gazer/releases) 页面发布。

当前发布版本暂未进行 Apple Developer ID 签名。若首次打开被 Gatekeeper 拦截，请在终端执行：

```bash
xattr -dr com.apple.quarantine /Applications/Star\ Gazer.app
```

### 源码编译

#### 环境依赖

- macOS 14 (Sonoma) 或更新版本
- Node.js `>= 20`
- pnpm `>= 10`
- Rust 工具链（`rustup` + stable）
- Xcode Command Line Tools
- （推荐）全局安装 `claude`、`opencode` 或 `codex`，以便 agent 卡片能直接拉起它们。

#### 构建步骤

```bash
# 1. 克隆仓库
git clone git@github.com:Yixi/Star-Gazer.git
cd Star-Gazer

# 2. 安装依赖
pnpm install

# 3. 启动开发模式
pnpm tauri:dev

# 4. 构建发布版 .dmg
pnpm tauri:build
```

## 🏗️ 技术架构

Star Gazer 的技术栈刻意保持精简：

- **应用框架**：Tauri 2.x——使用系统 WKWebView，不打包 Chromium
- **前端**：React 19 + TypeScript（严格模式）+ Vite 7
- **样式**：Tailwind CSS 4（CSS-based config）+ shadcn/ui + Base UI
- **状态管理**：Zustand
- **终端**：`xterm.js` + WebGL 渲染器，后端使用 Rust `portable-pty`
- **代码编辑器**：CodeMirror 6（比 Monaco 轻一半）
- **Diff 展示**：`react-diff-view` + `unidiff`
- **文件树**：`react-arborist`（虚拟滚动）
- **命令面板**：`cmdk`
- **后端**：Rust（Tokio）——PTY 管理、基于 `notify` 的文件监听，以及直接 shell out 到系统 `git` 命令的 `GitService`（与 VSCode 同策略，不使用 libgit2）

## 🧭 设计原则

1. **Terminal-First**——终端和 agent 是主角，文件和 diff 是辅助。
2. **Peek, Don't Browse**——用户"瞥一眼就知道状态"，而不是"打开面板慢慢浏览"。
3. **One Thing Per Card**——画布上每张卡片只做一件事。
4. **Invisible Until Needed**——辅助 UI（面板、菜单、HUD）默认隐藏，召唤时出现。
5. **Respect the User's Layout**——用户摆放的卡片位置永远不被自动重排。
6. **Fast Is a Feature**——性能不是优化项，而是核心特性。

### 明确的反目标

以下方向 Star Gazer 不会做，这是设计选择而不是还没做：

- ❌ LSP、代码补全、跳转定义、重构工具——交给 agent
- ❌ debugger——用户在终端里用原生工具
- ❌ 插件系统、跨平台支持、协作功能
- ❌ commit / push / pull 的 GUI、合并冲突解决工具

**说"不"是保持精简的前提**。

## 🤝 参与贡献

Star Gazer 是一个开源项目，形态还在持续塑造。欢迎提 issue、发起讨论和提交 PR——尤其是那些围绕"多 agent 审阅工作流"的想法。

## 📄 许可证

[MIT](./LICENSE)

---

<div align="center">

<p>为 vibe coding 时代而做。<br>在 Mac 上，用 ❤️ 构建，只服务 Mac。</p>

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

</div>
