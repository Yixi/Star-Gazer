/**
 * 终端 Hook - 管理 xterm.js 实例与 PTY 后端的连接
 *
 * 功能：
 * - 初始化 @xterm/xterm 终端实例（DOM 渲染器，支持 CSS zoom 无模糊）
 * - 加载 FitAddon 自适应大小
 * - 深色主题：背景 = --sg-bg-code，SF Mono 字体
 * - 支持 256 色 和 true color
 * - 通过 Tauri IPC 创建后端 PTY 并双向通信
 *   - 监听 terminal-output event 写入 xterm
 *   - 用户键入时调用 write_terminal command 发送到后端
 *
 * 兼容 React 18 Strict Mode（dev 模式下双重挂载/卸载）：
 * 使用 generation counter 忽略已清理 PTY 的过时事件
 */
import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import * as ptyService from "@/services/pty";
import { useTerminalStore } from "@/stores/terminalStore";
import { useCanvasStore } from "@/stores/canvasStore";

interface UseTerminalOptions {
  terminalId: string;
  cwd: string;
  agentId?: string;
  command?: string | null;
  fontSize?: number;
  onReady?: () => void;
  onExit?: (code: number) => void;
}

/**
 * 深色终端主题 — 结构色对齐 design-tokens.css
 *
 * xterm.js 不接受 CSS var，必须传十六进制。为避免改 sg- token 时
 * 这里漏改，启动时从 `:root` 读 CSS 变量动态构造主题；读不到（如 SSR /
 * 测试环境）再回落到静态 fallback。
 *
 * 16 色 ANSI 中：
 * - background / cursorAccent → --sg-bg-code（终端底色）
 * - foreground / brightWhite → --sg-text-primary
 * - white → --sg-text-secondary
 * - black → --sg-border-primary（设计稿同样用边框色当 ANSI black）
 * - brightBlack → --sg-text-placeholder
 * 其他色（red/green/blue/yellow/magenta/cyan + bright 系）属 agent 色盘，
 * 保持硬编码 —— 它们本身就是设计意图，不应跟着结构色 token 一起换。
 */
const FALLBACK_THEME = {
  background: "#121b2f",
  foreground: "#e4e6eb",
  cursor: "#4a9eff",
  cursorAccent: "#121b2f",
  selectionBackground: "rgba(74, 158, 255, 0.3)",
  selectionForeground: undefined,
  black: "#232c46",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#4a9eff",
  magenta: "#a78bfa",
  cyan: "#06b6d4",
  white: "#b8bcc4",
  brightBlack: "#4a5263",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c4b5fd",
  brightCyan: "#22d3ee",
  brightWhite: "#e4e6eb",
};

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined" || !document?.documentElement) return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function buildTerminalTheme() {
  const bg = readCssVar("--sg-bg-code", FALLBACK_THEME.background);
  return {
    ...FALLBACK_THEME,
    background: bg,
    cursorAccent: bg,
    foreground: readCssVar("--sg-text-primary", FALLBACK_THEME.foreground),
    cursor: readCssVar("--sg-accent", FALLBACK_THEME.cursor),
    black: readCssVar("--sg-border-primary", FALLBACK_THEME.black),
    white: readCssVar("--sg-text-secondary", FALLBACK_THEME.white),
    brightBlack: readCssVar("--sg-text-placeholder", FALLBACK_THEME.brightBlack),
    brightWhite: readCssVar("--sg-text-primary", FALLBACK_THEME.brightWhite),
  };
}

/** zoom 判 1 的浮点容差（Cmd+滚轮会产生 1.0000001 之类的浮点值） */
const ZOOM_EPS = 0.01;
/** zoom 变化到实际切换 renderer 的防抖时间，避免连续缩放时频繁闪烁 */
const RENDERER_SWITCH_DEBOUNCE_MS = 250;

export function useTerminal({ terminalId, cwd, agentId, command, fontSize = 12, onReady, onExit }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  /** WebGL 初始化/运行时失败后永久回落 DOM，不再尝试 */
  const webglFailedRef = useRef(false);
  const switchTimerRef = useRef<number | null>(null);
  const initPendingRef = useRef(false);
  // 存储事件取消监听函数，清理时调用避免内存泄漏
  const unlistenersRef = useRef<Array<() => void>>([]);
  // Generation counter：每次 init 递增，cleanup 也递增
  // 事件回调只在 generation 匹配时处理，防止 Strict Mode 下旧 PTY 的事件污染新实例
  const generationRef = useRef(0);
  // 用 ref 持有回调，避免回调变化导致 init 重建
  const onReadyRef = useRef(onReady);
  const onExitRef = useRef(onExit);
  onReadyRef.current = onReady;
  onExitRef.current = onExit;

  /**
   * 强制 WebGL 渲染器丢弃 glyph atlas + 重画所有可见行。
   *
   * 仅清 atlas 是不够的 —— 它只丢 GPU 上的字符纹理缓存，已经画到 framebuffer
   * 上的污染像素仍在屏幕上，要等到大量新输出冲过去才会被覆盖。必须再调
   * `refresh(0, rows-1)` 强制 WebGL renderer 重画所有可见行，把脏区位图
   * 重新生成并提交，污染才会被立刻清掉。
   *
   * DOM 渲染器没有 atlas 概念，只 refresh 即可（也基本不会出现这类残影）。
   */
  const redraw = useCallback(() => {
    const t = terminalRef.current;
    if (!t) return;
    try {
      if (webglAddonRef.current) {
        t.clearTextureAtlas();
      }
      t.refresh(0, t.rows - 1);
    } catch {
      // terminal 已 dispose 时静默吞掉
    }
  }, []);

  /**
   * 根据 Canvas zoom 切换 xterm renderer：zoom === 1 时 WebGL，否则 DOM。
   *
   * 动机：画布用 CSS `zoom` 整体位图化缩放，WebGL canvas 的 backing store
   * 固定分辨率会被拉伸模糊。VSCode 终端不存在这个问题是因为它的终端外层
   * 永远不会被 CSS transform/zoom，架构上就没这张画布。我们保留画布缩放用
   * 于"多卡全景"，代价是缩放状态下必须回退 DOM —— 和 VSCode 的 WebGL→DOM
   * 帧率降级是同一思路的离散版。
   *
   * WebGL 开回来的价值：脏区增量渲染 + GPU 合成，输出密集时主线程空闲，
   * input 事件派发不被 DOM reflow 挤压，间接缓解"打字快吞字"的主观感。
   */
  const applyRenderer = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const zoom = useCanvasStore.getState().zoom;
    const shouldUseWebgl = Math.abs(zoom - 1) < ZOOM_EPS && !webglFailedRef.current;
    const hasWebgl = webglAddonRef.current !== null;
    if (shouldUseWebgl === hasWebgl) return;

    if (shouldUseWebgl) {
      try {
        const addon = new WebglAddon();
        // GPU 驱动崩溃 / tab 长期后台被回收 → 永久回落 DOM。
        // guard `webglAddonRef.current === addon` 防止"用户缩放时我们已主动
        // dispose、之后异步 context-loss 回调再次 dispose"的双 dispose 竞态
        addon.onContextLoss(() => {
          if (webglAddonRef.current !== addon) return;
          addon.dispose();
          webglAddonRef.current = null;
          webglFailedRef.current = true;
        });
        terminal.loadAddon(addon);
        webglAddonRef.current = addon;
      } catch (err) {
        webglFailedRef.current = true;
        console.warn("[terminal] WebGL 启动失败，回落 DOM 渲染", err);
      }
    } else {
      webglAddonRef.current?.dispose();
      webglAddonRef.current = null;
    }

    // 切 renderer 后 cell 尺寸计算链重建，fit 一次确保 cols/rows 正确
    try {
      fitAddonRef.current?.fit();
    } catch {
      /* fit 偶发失败忽略 */
    }
  }, []);

  /** 初始化终端 */
  const init = useCallback(async () => {
    if (!containerRef.current) return;
    if (terminalRef.current) return; // 防止重复初始化
    if (initPendingRef.current) return; // 防止并发初始化（async 竞态）
    initPendingRef.current = true;

    // 记录当前 generation，后续所有异步回调都验证此值
    const myGeneration = ++generationRef.current;

    const terminal = new Terminal({
      fontSize,
      fontFamily: "'MesloLGS NF', 'Hack Nerd Font', 'FiraCode Nerd Font', 'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      fontWeight: "400",
      fontWeightBold: "600",
      letterSpacing: 0,
      // 必须是整数倍数（1 / 1.5 / 2 …），否则 fontSize × lineHeight 不是整数像素，
      // WebGL 渲染器做亚像素 GPU 合成时会在滚动后留下散落的字符残影。
      lineHeight: 1.5,
      theme: buildTerminalTheme(),
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowProposedApi: true,
      scrollback: 5000,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);

    // 延迟 fit 以确保容器尺寸已确定
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // 根据当前 Canvas zoom 决定初始 renderer（WebGL or DOM）
    applyRenderer();

    // ─────────────────── 字符输入：单一所有权架构 ───────────────────
    //
    // 历史教训（fbd904d → 88b2b7e → 1231cd5 → 6452708 → e6d04aa → b6c6b8a →
    // 95f818a，共 7 次修复）：PTY 曾有两个写入者 —— xterm 内部管线（onData）
    // 和我们的直接 ptyService 写入 —— 靠事件时序/timing 窗口协调"谁闭嘴"。
    // 时序假设一破就双发或吞字：
    //
    // ① xterm 6 把 keydown/keypress/keyup/input 全部注册成 **capture**
    //    （CoreBrowserTerminal#_bindKeys），且在 terminal.open() 时注册（比我
    //    们早）。同一节点同一阶段按注册顺序执行 —— 旧方案在 keypress 上
    //    stopPropagation 拦 _keyPress 是空操作：xterm 的监听先跑完了。
    // ② 普通字符实际由 xterm 的 keydown 路径发送（evaluateKeyboardEvent 对
    //    keyCode>=48 的单字符键直接 result.key = ev.key），发完 cancel 原生
    //    事件。于是字符所有权被隐式劈成两半：IME 键（229）归 beforeinput，
    //    真实 keyCode 键归 xterm。WKWebView 恰恰在这条分界上摇摆 —— 输入法
    //    在环但报真实 keyCode 时，xterm 在 keydown 发一次、IME 插入的文本又
    //    触发 beforeinput 再发一次 → "每输入一次，下个键写进两个字符"。
    //
    // 新规则 —— 双发在结构上不可能，不依赖事件顺序与 timing：
    //
    // 【唯一写入点】PTY 写入只发生在 onData 回调。我们的层不再直接写 PTY，
    // 需要发送时调 terminal.input() / terminal.paste()（二者最终都走
    // coreService.triggerDataEvent → onData）。任何一个用户动作只会有一个
    // 发送者触发 onData：
    //
    // 【所有权裁决】attachCustomKeyEventHandler（xterm 保证在自身处理 key
    // 事件前调用，与监听注册顺序无关）：
    //   keypress             → false：_keyPress 在 cancel 事件前退出，既不
    //                          发字符也不抢走 beforeinput 的派发
    //   keydown 229          → false：IME 消费键 xterm 一概不碰，阻断
    //                          CompositionHelper 的 _handleAnyTextareaChanges
    //                          textarea-diff 发送路径
    //   keydown isComposing  → false：WKWebView 给组字期间的提交键（Enter 等）
    //                          真实 keyCode（Chrome 全标 229）。放进 xterm 会
    //                          命中 CompositionHelper.keydown 的 _isComposing
    //                          分支 → _finalizeComposition(false) 把组字预览
    //                          原文 + \r 一起漏进 PTY（6452708 修过的泄露，
    //                          b6c6b8a 重构时回归，在此根治）
    //   keydown 可打印字符    → false：单字符 key 且无 ctrl/meta（shift/alt
    //                          组合的可打印字符同样算）。字符**永远**归
    //                          beforeinput，不再依据 keyCode 区分 IME/非 IME
    //                          —— 那条分界在 WKWebView 上不可靠，正是双发根源
    //   其余 keydown         → true：Enter/Backspace/Tab/方向/翻页/Esc/
    //                          Ctrl+*/Cmd+* 归 xterm —— evaluateKeyboardEvent
    //                          发对应序列后 cancel 原生事件，beforeinput 不会
    //                          再派发 → 天然单发
    //
    // 【字符唯一入口】beforeinput capture：
    //   insertText            → terminal.input(data)（选字尾巴判定见下）
    //   insertFromDrop        → terminal.paste(data)：CRLF 归一 + bracketed
    //                           paste 包裹，多行拖放不会被 shell 立即执行
    //   insertFromPaste       → 只 preventDefault；粘贴由 xterm 'paste' 监听
    //                           （Clipboard.ts）独家处理 —— 再发一次就是
    //                           Cmd+V 双发（95f818a）
    //   insertCompositionText → 放行（IME 需要往 textarea 写候选）
    //   其余 delete*/history*/insertLineBreak → preventDefault 不发，对应键
    //                           已由 keydown 层处理
    //
    // 【IME commit】compositionend capture：发提交文本，并同步清空 textarea
    // —— xterm 的 _finalizeComposition(true) 在 setTimeout(0) 回读 textarea
    // 作提交文本，读到 "" 即不补发。
    //
    // 【选字尾巴去重】macOS 拼音空格/数字选字后，部分时序会在 compositionend
    // 之外再独立派发一个 beforeinput(insertText, " "/数字) 尾巴。旧方案用
    // 100ms 时间窗吞 trigger 字符，会误吃快速跟打的真空格/数字（韩文"空格=
    // 提交+正文"必中招）。尾巴与真实输入的**可判别差异**是：尾巴前面没有新的
    // keydown。故 compositionend 时若提交文本以选字文种结尾则挂起尾巴标记，
    // 任何 keydown 立即清除，250ms 兜底过期；命中 trigger 字符吞一次即复位。
    let composing = false;
    let tailPending = false;
    let tailPendingAt = 0;
    const TAIL_MAX_AGE_MS = 250;

    // 用"空格/数字选字"的文种：CJK 表意 / 扩展 A / 假名 / 全角形。
    // 注意**不含韩文谚文** —— 韩文空格键是"提交音节 + 输入真空格"二合一，
    // 空格是正文，吞掉就是丢字。
    const endsWithSelectorScript = (text: string): boolean => {
      if (!text) return false;
      const c = text.charCodeAt(text.length - 1);
      return (
        (c >= 0x4e00 && c <= 0x9fff) ||  // CJK Unified Ideographs
        (c >= 0x3400 && c <= 0x4dbf) ||  // CJK Extension A
        (c >= 0x3040 && c <= 0x309f) ||  // Hiragana
        (c >= 0x30a0 && c <= 0x30ff) ||  // Katakana
        (c >= 0xff00 && c <= 0xffef)     // Fullwidth forms
      );
    };
    const isSelectorTriggerChar = (s: string): boolean =>
      s === " " || s === "\n" || (s.length === 1 && s >= "0" && s <= "9");
    // 剥内嵌尾巴：macOS 拼音部分时序把选字空格/数字直接拼进
    // compositionend.data（"你好 "）；只在前一字符是选字文种时剥，
    // 不误伤 "hello " 这类英文组字的真空格。
    const stripCommitTail = (text: string): string => {
      if (text.length < 2) return text;
      const last = text[text.length - 1];
      const lastIsTrigger = last === " " || (last >= "0" && last <= "9");
      if (lastIsTrigger && endsWithSelectorScript(text.slice(0, -1))) {
        return text.slice(0, -1);
      }
      return text;
    };

    const ta = terminal.textarea;
    const onCompositionStartCapture = () => {
      composing = true;
      tailPending = false;
    };
    const onCompositionEndCapture = (ev: CompositionEvent) => {
      composing = false;
      // W3C：compositionend.data 即提交文本；textarea.value 兜底（旧 Chromium
      // 的 ev.data 不可靠，xterm 自己也保留 fallback）。
      const raw = ev.data || (ta ? ta.value : "");
      const committed = stripCommitTail(raw);
      // 同步清空，xterm _finalizeComposition 的 setTimeout 回读到 "" 不补发
      if (ta) ta.value = "";
      if (committed) {
        terminal.input(committed);
        if (endsWithSelectorScript(committed)) {
          tailPending = true;
          tailPendingAt = performance.now();
        }
      }
    };
    // 字符唯一入口
    const onBeforeInputCapture = (ev: InputEvent) => {
      const inputType = ev.inputType;
      // 组字中间态：IME 需要向 textarea 写候选字，放行不处理
      if (inputType === "insertCompositionText") return;
      // 其余一律 preventDefault：字符不进 textarea，input 事件不派发，
      // xterm 所有 textarea-diff 路径失去数据源
      ev.preventDefault();
      if (generationRef.current !== myGeneration) return;
      if (inputType === "insertText" && ev.data) {
        if (
          tailPending &&
          performance.now() - tailPendingAt <= TAIL_MAX_AGE_MS &&
          isSelectorTriggerChar(ev.data)
        ) {
          // 选字键尾巴（commit 后无新 keydown 的 trigger 字符）：吞一次
          tailPending = false;
          return;
        }
        tailPending = false;
        terminal.input(ev.data);
        return;
      }
      if (inputType === "insertFromDrop" && ev.data) {
        terminal.paste(ev.data);
        return;
      }
      // insertFromPaste / insertLineBreak / delete* / history*：不发（见架构注释）
    };
    // 兜底屏障：万一某条 WKWebView 路径绕过 beforeinput 的 preventDefault 把
    // 字符写进 textarea，立即清掉，确保它不会成为 xterm diff 路径的数据源。
    // 宁可丢这个假设性场景的字符，不冒双发风险。
    const onInputCapture = () => {
      if (composing) return;
      if (ta && ta.value) ta.value = "";
    };
    if (ta) {
      // capture 仅为先于 xterm 的 bubble composition 监听；对 xterm 自己的
      // capture 监听（key*/input）顺序无意义，那些路径已由上面的规则阻断
      ta.addEventListener("compositionstart", onCompositionStartCapture, true);
      ta.addEventListener("compositionend", onCompositionEndCapture, true);
      ta.addEventListener("beforeinput", onBeforeInputCapture, true);
      ta.addEventListener("input", onInputCapture, true);
      unlistenersRef.current.push(() => {
        ta.removeEventListener("compositionstart", onCompositionStartCapture, true);
        ta.removeEventListener("compositionend", onCompositionEndCapture, true);
        ta.removeEventListener("beforeinput", onBeforeInputCapture, true);
        ta.removeEventListener("input", onInputCapture, true);
      });
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === "keypress") {
        // 掐死 xterm._keyPress：它对可打印键会 cancel 事件并 triggerDataEvent，
        // 既构成第二个发送者又压制 beforeinput 派发。返回 false 让它在 cancel
        // 之前退出，浏览器默认流程继续 → beforeinput 正常派发
        return false;
      }
      if (event.type !== "keydown") return true;
      // 任何 keydown 都使挂起的选字尾巴失效：有新 keydown 说明后续的
      // insertText 是真实输入
      tailPending = false;
      // IME 消费键：xterm 一概不碰（阻断 textarea-diff 发送路径）
      if (event.keyCode === 229) return false;
      // WKWebView 组字期间的提交键带真实 keyCode：交给 xterm 会泄露组字预览
      // 原文 + \r（详见架构注释）。IME 自己会完成提交，compositionend 兜住
      if (event.isComposing) return false;
      // Dead key（option+e 重音符等）：让 xterm 看到会置 _unprocessedDeadKey，
      // 而后续组字键都被我们拦截、该标记无人消费，会吞掉下一个特殊键
      // （Enter/Backspace/方向键）。组字交给浏览器原生流程 + compositionend
      if (event.key === "Dead" || event.key === "AltGraph") return false;
      // 可打印字符键一律归 beforeinput（含 shift/alt 组合；ctrl/meta 是控制
      // 语义不算），与 keyCode 是否 229 无关
      if (event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        return false;
      }
      // 其余特殊键归 xterm：发完对应序列即 cancel 原生事件，天然单发
      return true;
    });

    // 先注册事件监听，再创建 PTY，避免丢失 shell 初始输出（prompt 等）
    // 所有回调都检查 generation 防止 Strict Mode 下旧 PTY 事件污染

    // 终端输入 -> PTY
    terminal.onData((data) => {
      if (generationRef.current !== myGeneration) return;
      ptyService.writeTerminal(terminalId, data);
    });

    // PTY 输出 -> 终端
    const unlistenOutput = await ptyService.onTerminalOutput(terminalId, (data) => {
      if (generationRef.current !== myGeneration) return;
      terminal.write(data);
    });
    unlistenersRef.current.push(unlistenOutput);

    // Strict Mode 可能已在 await 期间触发 cleanup，检查 generation
    if (generationRef.current !== myGeneration) return;

    // PTY 退出
    const unlistenExit = await ptyService.onTerminalExit(terminalId, (code) => {
      if (generationRef.current !== myGeneration) return;
      terminal.writeln(`\r\n\x1b[90m[进程已退出，退出码: ${code}]\x1b[0m`);
      useTerminalStore.getState().setTerminalStatus(terminalId, "closed");
      onExitRef.current?.(code);
    });
    unlistenersRef.current.push(unlistenExit);

    if (generationRef.current !== myGeneration) return;

    // 创建后端 PTY
    const { cols, rows } = terminal;
    try {
      const pid = await ptyService.createTerminal(
        terminalId, cwd, cols, rows,
        command ?? undefined
      );

      if (generationRef.current !== myGeneration) return;

      // 更新 terminalStore
      useTerminalStore.getState().addTerminal({
        id: terminalId,
        agentId: agentId ?? terminalId,
        pid,
        cols,
        rows,
        status: "active",
      });
      // 通知外部 PTY 已就绪
      onReadyRef.current?.();

      // 如果指定了 agent 命令，等待 shell 初始化后自动输入
      if (command) {
        setTimeout(() => {
          if (generationRef.current !== myGeneration) return;
          ptyService.writeTerminal(terminalId, command + "\n");
        }, 500);
      }
    } catch (err) {
      if (generationRef.current !== myGeneration) return;
      terminal.writeln('\x1b[33m⚠ 终端功能需要在 Tauri 桌面环境中运行\x1b[0m');
      terminal.writeln('\x1b[90m当前为浏览器预览模式\x1b[0m');
      terminal.writeln('');
      terminal.writeln(`\x1b[90m错误详情: ${err}\x1b[0m`);
      return;
    }
  }, [terminalId, cwd, agentId, command, fontSize, applyRenderer]);

  /** 订阅 Canvas zoom 变化，防抖切换 renderer */
  useEffect(() => {
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (state.zoom === prev.zoom) return;
      if (switchTimerRef.current !== null) {
        window.clearTimeout(switchTimerRef.current);
      }
      switchTimerRef.current = window.setTimeout(() => {
        switchTimerRef.current = null;
        applyRenderer();
      }, RENDERER_SWITCH_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (switchTimerRef.current !== null) {
        window.clearTimeout(switchTimerRef.current);
        switchTimerRef.current = null;
      }
    };
  }, [applyRenderer]);

  /** 调整尺寸 */
  const fit = useCallback(() => {
    if (!fitAddonRef.current || !terminalRef.current) return;
    // 容器不可见（父级 display:none，如 AgentCard 最小化）时 client 尺寸为 0，
    // fitAddon.fit() 会把 cols/rows 算成 0 进而把 PTY resize 成 0x0，部分 TUI
    // 程序（vim、top）在 0x0 下会直接退出。跳过即可，恢复可见后 ResizeObserver
    // 会再次回调，拿到真实尺寸。
    const el = containerRef.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    try {
      fitAddonRef.current.fit();
      // resize 后清纹理图集并重绘 —— WKWebView + WebGL 在 viewport 变化后旧
      // glyph 容易残留在右侧 cell 上（xterm 官方文档对纹理损坏推荐的修复）。
      // 仅清 atlas 不够，已绘制的污染像素留在 framebuffer 里，必须再 refresh
      // 强制重画所有可见行才能立刻消除。
      redraw();
      const { cols, rows } = terminalRef.current;
      if (cols > 0 && rows > 0) {
        ptyService.resizeTerminal(terminalId, cols, rows);
      }
    } catch {
      // fit 可能在终端未完全初始化时失败，忽略
    }
  }, [terminalId, redraw]);

  /**
   * 被动触发 atlas 清理 + 重绘的场景。这些都不会经过 fit 路径，但同样会
   * 让 WebGL atlas 失效或被错位采样：
   * - **visibilitychange**：WKWebView 被切到后台时 GPU 资源可能被回收，
   *   切回前台后 atlas 已损坏；
   * - **window focus**：macOS 跨 Space / 跨窗切换后 GL context 状态可能异常；
   * - **document.fonts.ready**：首屏 atlas 用 fallback 字体烘焙了，等 Nerd
   *   Font 加载完成后必须重建，否则字符 metrics 错位；
   * - **DPR 变化**：跨屏拖窗 / 外接显示器拔插，drawing buffer 尺寸变化。
   */
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) redraw();
    };
    const onFocus = () => redraw();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    document.fonts?.ready.then(() => redraw()).catch(() => {});

    // matchMedia 的 query 在条件被打破后就过期了，每次 change 必须重新创建
    // 一个新 query 来监听下一次 DPR 变化
    let currentMq: MediaQueryList | null = null;
    const onDprChange = () => {
      redraw();
      currentMq?.removeEventListener("change", onDprChange);
      currentMq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      currentMq.addEventListener("change", onDprChange);
    };
    currentMq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    currentMq.addEventListener("change", onDprChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      currentMq?.removeEventListener("change", onDprChange);
    };
  }, [redraw]);

  /** 清理 */
  useEffect(() => {
    return () => {
      // 递增 generation 使当前 init 的所有异步回调失效
      generationRef.current++;
      // 移除 Tauri 事件监听器
      for (const unlisten of unlistenersRef.current) {
        unlisten();
      }
      unlistenersRef.current = [];
      // 显式 dispose WebGL addon —— terminal.dispose() 也会清，但主动做一次
      // 确保 GL context 立即释放，避免 WKWebView 在快速切卡片时把 context
      // 堆到上限（Safari 系默认 WebGL context 数量有限）
      webglAddonRef.current?.dispose();
      webglAddonRef.current = null;
      // 销毁 xterm 实例
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      initPendingRef.current = false;
      // 关闭后端 PTY 进程
      ptyService.closeTerminal(terminalId).catch(console.error);
      useTerminalStore.getState().removeTerminal(terminalId);
    };
  }, [terminalId]);

  return { containerRef, init, fit, terminal: terminalRef };
}
