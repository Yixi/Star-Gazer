/**
 * 文件编辑器 - 使用 Monaco Editor
 *
 * 功能：
 * - 按文件扩展名/文件名自动识别语言（Monaco 内置 80+ 语言高亮）
 * - Cmd+S 保存
 * - 未保存 dirty 标记
 *
 * 仅使用 Monaco 的 Tokenizer 做语法高亮，LSP/诊断/补全等语言服务全部关闭。
 */
import { useEffect, useRef, useCallback } from "react";
import type * as MonacoNs from "monaco-editor";
import { usePanelStore } from "@/stores/panelStore";

interface FileEditorProps {
  filePath: string;
  tabId: string;
}

export function FileEditor({ filePath, tabId }: FileEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoNs.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<MonacoNs.editor.ITextModel | null>(null);
  const contentRef = useRef<string>("");
  const markDirty = usePanelStore((s) => s.markDirty);

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return;
    const content = editorRef.current.getValue();
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
    let contentDisposable: MonacoNs.IDisposable | null = null;

    const setup = async () => {
      const [{ setupMonaco, detectLanguage }, { invoke }] = await Promise.all([
        import("@/lib/monaco"),
        import("@tauri-apps/api/core"),
      ]);
      if (destroyed) return;

      const monaco = setupMonaco();

      let content = "";
      try {
        content = await invoke<string>("read_file", { path: filePath });
      } catch (err) {
        console.warn("Failed to read file, using placeholder:", err);
        content = `// 无法读取文件 ${filePath}\n// ${err}`;
      }
      if (destroyed || !containerRef.current) return;

      contentRef.current = content;
      const languageId = detectLanguage(filePath);
      const model = monaco.editor.createModel(content, languageId);

      const editor = monaco.editor.create(containerRef.current, {
        model,
        theme: "vs-dark",
        fontSize: 13,
        fontFamily:
          "'SF Mono', Menlo, 'Geist Mono', 'Fira Code', monospace",
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        renderLineHighlight: "line",
        tabSize: 2,
        wordWrap: "off",
        // 只要高亮 — 关掉所有提示/补全/hover
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        wordBasedSuggestions: "off",
        parameterHints: { enabled: false },
        hover: { enabled: false },
        snippetSuggestions: "none",
        occurrencesHighlight: "off",
        // 关掉右下角的 "Peek Problem" 等交互
        lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleSave();
      });

      contentDisposable = model.onDidChangeContent(() => {
        const isDirty = model.getValue() !== contentRef.current;
        markDirty(tabId, isDirty);
      });

      editorRef.current = editor;
      modelRef.current = model;
    };

    setup();

    return () => {
      destroyed = true;
      contentDisposable?.dispose();
      editorRef.current?.dispose();
      modelRef.current?.dispose();
      editorRef.current = null;
      modelRef.current = null;
    };
  }, [filePath, tabId, markDirty, handleSave]);

  return <div ref={containerRef} className="h-full overflow-hidden" />;
}
