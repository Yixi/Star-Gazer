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

    // IME（中/日/韩输入法）接管 —— 绕开 xterm.js CompositionHelper 的三条上游 bug。
    // upstream: #5374 / #1939 至今未修，VSCode 终端同样中招但标 upstream。
    //
    // 【bug A：拼音提交键泄露到 PTY，"你 好 " / "，,"】
    // xterm.js CompositionHelper.keydown 在 _isComposing=true 时，若按下 space/
    // enter/标点（keyCode≠229/CapsLock/修饰键），会走 _finalizeComposition(false)
    // 同步把组字文本 triggerDataEvent 出去，然后 return true 让 _keyDown 继续把
    // 该按键当普通键再 triggerDataEvent 一次 —— 于是空格本身也被写进 PTY。
    //
    // 【bug A'：_finalizeComposition(true) 把 textarea 尾部残留也送出去】
    // compositionend 走的是 _finalizeComposition(true)：setTimeout(0) 之后读
    // textarea.value.substring(start) **不限 end**，设计上是为了兼容"组字后紧
    // 跟非组字字符"的场景。实际后果是：如果提交键（空格）作为 default action
    // 落进了隐藏 textarea，就会被一起回读成 "你 " 发给 PTY。
    //
    // 【bug B：shift+@#$ 丢字】
    // 中/日 IME 下 shift+符号触发瞬时 compositionstart，_handleAnyTextareaChanges
    // 的 setTimeout 跑时 _isComposing=true，整条 diff 分支被跳过，字符丢失。
    //
    // 【bug C：ABC 英文模式吞字 / 快打重复】
    // 中文 IME 的 ABC 模式 keyCode=229 但不组字，快打踩 xterm 的 setTimeout+
    // !_isComposing 竞态丢字；若拦 keydown 只 return false 不 preventDefault，
    // default action 还会把字母注入 textarea，keypress 再触发 xterm.
    // _keyPress.triggerDataEvent 造成重复。
    //
    // 修复策略：
    // 1) compositionstart/end 用 **capture phase** 挂在 textarea 上 —— 比 xterm
    //    bubble 阶段先跑，先把 textarea 清空 + 自行把 ev.data 写 PTY。xterm 的
    //    bubble 回调后续 setTimeout 读到空 textarea，sends nothing → 免 bug A'。
    // 2) 组字期间的 keydown 一律 return false 阻止 xterm 分发；非 229/非修饰键
    //    额外 preventDefault，防止提交键作为 default action 落进 textarea（否则
    //    我们 capture 阶段读到的 ev.data 正确，但 xterm 的 setTimeout 还会读到
    //    "你 " 的残留 —— 虽然我们清空了，这条双保险防竞态）→ 免 bug A。
    // 3) 非组字 + keyCode===229 + 单字符 ASCII + 无 ctrl/meta/alt：preventDefault
    //    阻止 default action 注入 textarea（避免 keypress 重复 + 避免污染后续
    //    composition 基线），setTimeout(0) 排队发 PTY；同 task 内若 IME 瞬时
    //    触发 compositionstart 则 cancelAllPending 让 IME 接管 → 免 bug B/C。
    // 4) 非 229 的 keydown（英文模式的真实 keyCode）走 xterm 原路径，_keyPress
    //    正常触发一次，不重复。
    let imeComposing = false;
    const pendingTimers = new Set<number>();
    const cancelAllPending = () => {
      for (const t of pendingTimers) window.clearTimeout(t);
      pendingTimers.clear();
    };
    const ta = terminal.textarea;
    const onCompositionStartCapture = () => {
      imeComposing = true;
      // IME 接管：丢弃排队中的 ASCII 发送
      cancelAllPending();
    };
    const onCompositionEndCapture = (ev: CompositionEvent) => {
      imeComposing = false;
      // 优先 ev.data（W3C 规定 compositionend.data 为提交文本），textarea.value
      // 兜底（上游 xterm 注释旧 Chromium ev.data 不可靠，保留 fallback）。
      const committed = ev.data || (ta ? ta.value : "");
      // 必须在 xterm bubble 回调前清空 —— 其 setTimeout(0) 回读 textarea，否则
      // 空格等提交键的 default action 残留会被当成"组字后缀"二次发出。
      if (ta) ta.value = "";
      if (committed && generationRef.current === myGeneration) {
        ptyService.writeTerminal(terminalId, committed);
      }
    };
    if (ta) {
      // capture: true 保证比 xterm 自己的 bubble 监听先跑
      ta.addEventListener("compositionstart", onCompositionStartCapture, true);
      ta.addEventListener("compositionend", onCompositionEndCapture, true);
      unlistenersRef.current.push(() => {
        ta.removeEventListener("compositionstart", onCompositionStartCapture, true);
        ta.removeEventListener("compositionend", onCompositionEndCapture, true);
        cancelAllPending();
      });
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      // 组字期间完全接管。xterm 的 _keyDown 不再分发；提交键不会被 triggerDataEvent。
      // 非 229/非 IME-passthrough 修饰键额外 preventDefault：阻止空格/enter/标点
      // 作为 default action 落进 textarea，保证 compositionend 我们读到的是纯组字文本。
      if (event.isComposing || imeComposing) {
        const kc = event.keyCode;
        // 20 CapsLock / 229 composition / 16 Shift / 17 Ctrl / 18 Alt —— IME 内部
        // 依赖这些键的 default action 维持组字状态，不能 preventDefault
        if (kc !== 229 && kc !== 20 && kc !== 16 && kc !== 17 && kc !== 18) {
          event.preventDefault();
        }
        return false;
      }

      // 非组字态下的 keyCode===229：ABC 英文模式、中/日 IME 瞬时 composition 前导。
      // 窗口极短：同 task 内若 compositionstart 触发，cancelAllPending 让 IME 接管；
      // 否则 setTimeout 到期时直接写 PTY，纯英文 IME 走 xterm 原路径避免重复。
      if (
        event.keyCode === 229 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.length === 1
      ) {
        const code = event.key.charCodeAt(0);
        if (code >= 0x20 && code <= 0x7e) {
          const key = event.key;
          // preventDefault 防止：① keypress 再送一次（_keyPress.triggerDataEvent 重复）
          // ② 字符注入隐藏 textarea 污染后续 composition 的基线偏移
          event.preventDefault();
          const timer = window.setTimeout(() => {
            pendingTimers.delete(timer);
            if (imeComposing) return; // 同 task compositionstart 已取消
            if (generationRef.current !== myGeneration) return;
            ptyService.writeTerminal(terminalId, key);
          }, 0);
          pendingTimers.add(timer);
          return false;
        }
      }
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
