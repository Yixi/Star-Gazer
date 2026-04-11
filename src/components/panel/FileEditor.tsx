/**
 * 文件编辑器 - 使用 CodeMirror 6
 *
 * 功能：
 * - 根据文件扩展名自动加载语言支持
 * - 文件保存 Cmd+S
 * - 未保存 dirty 标记
 */
import { useEffect, useRef, useCallback } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { usePanelStore } from "@/stores/panelStore";

interface FileEditorProps {
  filePath: string;
  tabId: string;
}

/** 文件扩展名到语言加载器的映射 */
async function getLanguageExtension(filePath: string): Promise<Extension | null> {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ jsx: ext === "jsx" })
      );
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ jsx: ext === "tsx", typescript: true })
      );
    case "py":
      return import("@codemirror/lang-python").then((m) => m.python());
    case "rs":
      return import("@codemirror/lang-rust").then((m) => m.rust());
    case "json":
      return import("@codemirror/lang-json").then((m) => m.json());
    case "md":
    case "mdx":
      return import("@codemirror/lang-markdown").then((m) => m.markdown());
    case "html":
    case "htm":
    case "vue":
    case "svelte":
      return import("@codemirror/lang-html").then((m) => m.html());
    case "css":
    case "scss":
    case "less":
      return import("@codemirror/lang-css").then((m) => m.css());
    default:
      return null;
  }
}

/** CodeMirror 自定义暗色主题 (Star Gazer 配色) */
const starGazerTheme = EditorView.theme({
  "&": {
    backgroundColor: "#0f1116",
    color: "#e4e6eb",
    fontSize: "13px",
    fontFamily: "'Geist Mono', 'SF Mono', 'Fira Code', monospace",
  },
  ".cm-gutters": {
    backgroundColor: "#0d0e13",
    color: "#6b7280",
    border: "none",
    borderRight: "1px solid #1a1c23",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(74, 158, 255, 0.05)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(74, 158, 255, 0.04)",
  },
  ".cm-cursor": {
    borderLeft: "2px solid #4a9eff",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(74, 158, 255, 0.2) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(74, 158, 255, 0.25) !important",
  },
  ".cm-line": {
    padding: "0 4px",
  },
});

export function FileEditor({ filePath, tabId }: FileEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef<string>("");
  const markDirty = usePanelStore((s) => s.markDirty);

  // 保存文件
  const handleSave = useCallback(async () => {
    if (!viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_file", { path: filePath, content });
      contentRef.current = content;
      markDirty(tabId, false);
    } catch (err) {
      console.warn("Failed to save file:", err);
    }
  }, [filePath, tabId, markDirty]);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    const setup = async () => {
      // 从后端读取文件内容
      let content = `// 正在加载 ${filePath}...`;
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        content = await invoke<string>("read_file", { path: filePath });
      } catch (err) {
        console.warn("Failed to read file, using placeholder:", err);
        content = `// 无法读取文件 ${filePath}\n// ${err}`;
      }

      if (destroyed) return;
      contentRef.current = content;

      // 加载语言支持
      const langExt = await getLanguageExtension(filePath);
      if (destroyed) return;

      const extensions: Extension[] = [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: "Mod-s",
            run: () => {
              handleSave();
              return true;
            },
          },
        ]),
        oneDark,
        starGazerTheme,
        EditorView.lineWrapping,
        // 监听文档变更标记 dirty
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const currentContent = update.state.doc.toString();
            const isDirty = currentContent !== contentRef.current;
            markDirty(tabId, isDirty);
          }
        }),
      ];

      if (langExt) {
        extensions.push(langExt);
      }

      const state = EditorState.create({
        doc: content,
        extensions,
      });

      // 清理旧 view
      if (viewRef.current) {
        viewRef.current.destroy();
      }

      if (!containerRef.current) return;

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;
    };

    setup();

    return () => {
      destroyed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [filePath, tabId, markDirty, handleSave]);

  return <div ref={containerRef} className="h-full overflow-hidden" />;
}
