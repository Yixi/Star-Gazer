/**
 * 终端 Hook - 管理 xterm.js 实例与 PTY 后端的连接
 *
 * 功能：
 * - 初始化 @xterm/xterm 终端实例（DOM 渲染器，支持 CSS zoom 无模糊）
 * - 加载 FitAddon 自适应大小
 * - 深色主题：背景 #0d0f14，SF Mono 字体
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
 * 深色终端主题 - 参考 Mockup 中的配色
 * 背景色 #0d0f14，支持 256 色和 true color
 */
const TERMINAL_THEME = {
  background: "#0d0f14",
  foreground: "#e4e6eb",
  cursor: "#4a9eff",
  cursorAccent: "#0d0f14",
  selectionBackground: "rgba(74, 158, 255, 0.3)",
  selectionForeground: undefined,
  // 基础 16 色（ANSI）
  black: "#1a1c23",
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
      lineHeight: 1.35,
      theme: TERMINAL_THEME,
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

    // 字符输入接管 —— 监听"输入内容"(beforeinput)，不监听"键盘事件"。
    //
    // 背景：xterm.js 有三条冗余的字符发送路径 —— _keyPress、keydown(229) 的
    // _handleAnyTextareaChanges setTimeout、compositionend 的 _finalizeComposition
    // setTimeout；每条都有自己的上游 bug（#5374 / #1939 等至今未修），时序又
    // 随浏览器/IME/键盘布局而变。在键盘事件层打补丁相当于追浏览器实现细节，
    // 每修一个场景就叠一个 flag，flag 之间互相踩 —— 历史迭代中出现的 bug A
    // 选字键泄露、bug B shift+符号丢字、bug C ABC 模式双发/丢字、bug D 数字重复
    // 都是这样来的。
    //
    // 新架构：把字符输入的入口收敛到浏览器为此设计的 **beforeinput**（Input
    // Events L2 规范）。它是统一的语义层 —— 无论字符来自物理键、IME 提交、
    // 粘贴、拖拽，都会派发一次，带 inputType + data，可 preventDefault。直接
    // 拿 data 发 PTY，不再关心按了什么键、keyCode 是不是 229、IME 如何派发。
    //
    // 分工：
    // - beforeinput capture（字符）：insertText / insertFromPaste / insertFromDrop
    //   → 写 ev.data 到 PTY 并 preventDefault（字符不进 textarea）；
    //   insertCompositionText → 放行（IME 需要改 textarea 显示候选）；
    //   其他（delete / history / format / insertLineBreak）→ preventDefault
    //   但不发，交给 xterm 的 keydown 层统一处理（Enter / Backspace / Tab 都
    //   是 xterm 特殊键，会自行发对应 ANSI 序列）。
    // - compositionend capture（IME commit）：ev.data 即提交文本；剥 macOS 拼音
    //   的选字键尾巴后写 PTY；清空 textarea 让 xterm _finalizeComposition
    //   setTimeout 回读到空字符串，不再泄露。
    // - keypress capture：stopPropagation —— xterm _keyPress 再也看不到事件，
    //   不会 triggerDataEvent 再发一次字符（一举消除所有双发根源）。
    // - input capture：非组字期清空 textarea —— 断掉 xterm 所有 textarea-diff
    //   路径（_handleAnyTextareaChanges / _finalizeComposition）的数据来源。
    // - customKeyEventHandler：只对 keyCode===229 return false；阻止 xterm
    //   _keyDown 对 IME 消费键 preventDefault（那会连带压制 beforeinput 派发，
    //   字符就丢了）。其他键全部放行，方向键 / Ctrl+* / Enter / Backspace /
    //   Tab 等仍由 xterm 处理。普通字符键 xterm 的 evaluateKeyboardEvent 返回
    //   NO_KEY，不在 keydown 发字符，落到 keypress（被我们 stopPropagation）
    //   再到 beforeinput，只发一次。
    //
    // macOS 拼音选字键尾巴：空格/数字选字后，除 compositionend.data，部分
    // 时序下还会再独立派发 beforeinput(insertText, " "/数字)。commitWindow
    // (100ms) + isIMETriggerChar 拦掉这个尾巴；同时 stripCommitTail 处理
    // "ev.data 本身就带尾巴"的情况（macOS 拼音把空格拼进 commit 文本）。
    let composing = false;
    let commitWindowOpen = false;
    let commitWindowTimer: number | null = null;
    const COMMIT_WINDOW_MS = 100;
    const openCommitWindow = () => {
      commitWindowOpen = true;
      if (commitWindowTimer !== null) window.clearTimeout(commitWindowTimer);
      commitWindowTimer = window.setTimeout(() => {
        commitWindowOpen = false;
        commitWindowTimer = null;
      }, COMMIT_WINDOW_MS);
    };
    const closeCommitWindow = () => {
      commitWindowOpen = false;
      if (commitWindowTimer !== null) {
        window.clearTimeout(commitWindowTimer);
        commitWindowTimer = null;
      }
    };
    const isCJK = (ch: string): boolean => {
      const c = ch.charCodeAt(0);
      return (
        (c >= 0x4e00 && c <= 0x9fff) ||   // CJK Unified Ideographs
        (c >= 0x3400 && c <= 0x4dbf) ||   // CJK Extension A
        (c >= 0x3040 && c <= 0x309f) ||   // Hiragana
        (c >= 0x30a0 && c <= 0x30ff) ||   // Katakana
        (c >= 0xac00 && c <= 0xd7af) ||   // Hangul Syllables
        (c >= 0xff00 && c <= 0xffef)      // Fullwidth forms
      );
    };
    // 剥 commit 尾巴：macOS 拼音选字时把空格/数字并进 compositionend.data，
    // 尾部出现"CJK + 空格/数字"；只在前一字符是 CJK 时剥，避免误伤
    // "hello "这类纯英文组字。
    const stripCommitTail = (text: string): string => {
      if (text.length < 2) return text;
      const last = text[text.length - 1];
      const prev = text[text.length - 2];
      const lastIsTrigger = last === " " || (last >= "0" && last <= "9");
      if (lastIsTrigger && isCJK(prev)) return text.slice(0, -1);
      return text;
    };
    const isIMETriggerChar = (s: string): boolean => {
      if (s === " " || s === "\n") return true;
      if (s.length === 1 && s >= "0" && s <= "9") return true;
      return false;
    };

    const ta = terminal.textarea;
    const onCompositionStartCapture = () => {
      composing = true;
      closeCommitWindow();
    };
    const onCompositionEndCapture = (ev: CompositionEvent) => {
      composing = false;
      // W3C：compositionend.data 即提交文本；textarea.value 兜底（旧 Chromium
      // 的 ev.data 不可靠，xterm 自己也保留 fallback）。
      const raw = ev.data || (ta ? ta.value : "");
      const committed = stripCommitTail(raw);
      // 必须在 xterm bubble 回调前清空 —— 其 _finalizeComposition setTimeout(0)
      // 回读 textarea，清空后读到 ""，不会再泄露。
      if (ta) ta.value = "";
      if (committed && generationRef.current === myGeneration) {
        ptyService.writeTerminal(terminalId, committed);
      }
      openCommitWindow();
    };
    // 字符输入唯一入口
    const onBeforeInputCapture = (ev: InputEvent) => {
      const inputType = ev.inputType;
      // 组字中间态：IME 需要向 textarea 写候选字，放行不处理
      if (inputType === "insertCompositionText") return;
      // 其余一律 preventDefault：字符不进 textarea，由我们决定是否写 PTY
      ev.preventDefault();
      ev.stopPropagation();
      if (generationRef.current !== myGeneration) return;
      if (inputType === "insertText" && ev.data) {
        // commit 窗口内选字键尾巴 —— 吞掉
        if (commitWindowOpen && isIMETriggerChar(ev.data)) return;
        ptyService.writeTerminal(terminalId, ev.data);
        return;
      }
      if (
        (inputType === "insertFromPaste" || inputType === "insertFromDrop") &&
        ev.data
      ) {
        ptyService.writeTerminal(terminalId, ev.data);
        return;
      }
      // insertLineBreak / delete* / history* / format*：不发，让 xterm 的 keydown
      // 路径统一处理（Enter / Backspace / Tab 都是 xterm 特殊键）。
    };
    // 阻断 xterm _keyPress 的字符派发路径 —— 字符输入全由 beforeinput 负责。
    // stopPropagation 拦到 xterm bubble 监听之前；不 preventDefault，让浏览器
    // 正常派发后续 beforeinput / input。
    const onKeyPressCapture = (ev: KeyboardEvent) => {
      ev.stopPropagation();
    };
    // 非组字期清空 textarea —— 断 xterm textarea-diff 读取路径（双保险：
    // 即使 beforeinput preventDefault 在某条 WKWebView 路径失效，这里兜底）。
    const onInputCapture = () => {
      if (composing) return;
      if (ta && ta.value) ta.value = "";
    };
    if (ta) {
      // capture: true 保证比 xterm 的 bubble 监听先跑
      ta.addEventListener("compositionstart", onCompositionStartCapture, true);
      ta.addEventListener("compositionend", onCompositionEndCapture, true);
      ta.addEventListener("beforeinput", onBeforeInputCapture, true);
      ta.addEventListener("keypress", onKeyPressCapture, true);
      ta.addEventListener("input", onInputCapture, true);
      unlistenersRef.current.push(() => {
        ta.removeEventListener("compositionstart", onCompositionStartCapture, true);
        ta.removeEventListener("compositionend", onCompositionEndCapture, true);
        ta.removeEventListener("beforeinput", onBeforeInputCapture, true);
        ta.removeEventListener("keypress", onKeyPressCapture, true);
        ta.removeEventListener("input", onInputCapture, true);
        closeCommitWindow();
      });
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      // keyCode===229（IME 消费键 —— 组字态 / ABC 英文模式 / 直接按字符都可能）：
      // return false 阻止 xterm _keyDown 进而阻止 _compositionHelper.keydown
      // 的两个副作用：① 对 IME keydown preventDefault 连带压制后续 beforeinput
      // 派发，字符丢失；② 排队 _handleAnyTextareaChanges setTimeout 读 textarea
      // diff 造成重复发送。让浏览器走默认路径：beforeinput 正常派发，由
      // onBeforeInputCapture 统一写 PTY。
      if (event.keyCode === 229) return false;
      // 其他键全部交给 xterm：方向键 / Home / End / PgUp / PgDn / 功能键 /
      // Enter / Backspace / Tab / Ctrl+* / Alt+* / Meta+* 组合键。普通字符键
      // xterm 的 evaluateKeyboardEvent 返回 NO_KEY，不在 keydown 发字符，落到
      // keypress（被我们 stopPropagation）再到 beforeinput，只发一次。
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
      const { cols, rows } = terminalRef.current;
      if (cols > 0 && rows > 0) {
        ptyService.resizeTerminal(terminalId, cols, rows);
      }
    } catch {
      // fit 可能在终端未完全初始化时失败，忽略
    }
  }, [terminalId]);

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
