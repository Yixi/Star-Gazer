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

    // IME（中/日/韩输入法）workaround —— 针对 xterm.js 的三条上游 bug，
    // #5374 / #1939 至今未修，VSCode 终端同样中招但标 upstream 不修。
    //
    // 【bug A：提交键泄露到 PTY，"你 好 " / "，,"】
    // xterm.js CompositionHelper.keydown 在 _isComposing=true 时，若 keyCode
    // 不是 229/CapsLock/修饰键，会走 _finalizeComposition(false) 同步提交组字，
    // 再 return true 让 _keyDown 继续把该按键当普通键 triggerDataEvent 一次。
    // 中文拼音空格选字 space.keyCode=32，连写变成 "你 好 "；中文 IME 标点
    // 触发的瞬时 composition 也会借此路径额外发一次 ","。WebKit/Chromium 皆有。
    //
    // 【bug B：shift+符号丢字】
    // 中文/日文 IME 下 shift+@#$ 等会触发瞬时 compositionstart，
    // _handleAnyTextareaChanges 的 setTimeout 跑时 _isComposing=true、整条
    // diff 分支被跳过、字符丢失。
    //
    // 【bug C：ABC 英文模式吞字 / 英文 IME shift+字符重复】
    // 中文 IME 切 ABC 模式 keyCode=229 但无 composition，快打踩 xterm
    // setTimeout+!_isComposing 竞态丢字；纯英文 IME 下无条件拦 shift+ASCII
    // 又会让 xterm _keyPress 再 triggerDataEvent 一次造成重复。
    //
    // 修复策略：
    // 1) 自挂 compositionstart/end 到 textarea，维护 imeComposing 标记。
    // 2) 组字期间（event.isComposing || imeComposing）**所有** keydown 返回 false，
    //    xterm _keyDown 直接短路，提交键不会被 triggerDataEvent。提交文本由
    //    compositionend → _finalizeComposition 从 textarea.value 读出来发 ——
    //    这条路 xterm 处理得对，覆盖 bug A。
    // 3) 非组字态 + keyCode===229 + 单字符 ASCII 可打印 + 无 ctrl/meta/alt：
    //    setTimeout(0) 排队发送；同 task 内若 compositionstart 触发则
    //    cancelAllPending 把 pending 交回 IME（拼音首字母走这条路），否则
    //    延迟到期送出（ABC 模式 / shift+@#$）。只在 keyCode===229 时拦，
    //    纯英文 IME 走 xterm 原路径避免 bug C 重复。
    let imeComposing = false;
    const pendingTimers = new Set<number>();
    const cancelAllPending = () => {
      for (const t of pendingTimers) window.clearTimeout(t);
      pendingTimers.clear();
    };
    const ta = terminal.textarea;
    const onCompositionStart = () => {
      imeComposing = true;
      // 组字启动：丢弃排队中的 ASCII 发送，让 IME 接管
      cancelAllPending();
    };
    const onCompositionEnd = () => {
      imeComposing = false;
    };
    if (ta) {
      ta.addEventListener("compositionstart", onCompositionStart);
      ta.addEventListener("compositionend", onCompositionEnd);
      unlistenersRef.current.push(() => {
        ta.removeEventListener("compositionstart", onCompositionStart);
        ta.removeEventListener("compositionend", onCompositionEnd);
        cancelAllPending();
      });
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      // bug A：组字中（含提交键本身）完全拒绝让 xterm 分发。
      // event.isComposing 覆盖 WebKit "keydown 仍处于组字中" 的常见路径；
      // imeComposing 覆盖 "compositionend 先于 keydown 触发" 的罕见路径。
      // 提交文本由 compositionend → _finalizeComposition 独立发出。
      if (event.isComposing || imeComposing) return false;

      // bug B + C：非组字态 + keyCode===229 + 单字符 ASCII 可打印 + 无修饰键。
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
          const timer = window.setTimeout(() => {
            pendingTimers.delete(timer);
            if (imeComposing) return; // 同 task compositionstart 已取消
            if (generationRef.current !== myGeneration) return;
            ptyService.writeTerminal(terminalId, key);
            // 清空隐藏 textarea，防止 default action 累积污染后续 composition
            if (ta) ta.value = "";
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
