/**
 * 文件编辑器 - 使用 CodeMirror 6
 */
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";

interface FileEditorProps {
  filePath: string;
}

export function FileEditor({ filePath }: FileEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // TODO: 从后端读取文件内容，根据文件扩展名加载对应语言支持
    const state = EditorState.create({
      doc: `// 正在加载 ${filePath}...`,
      extensions: [
        keymap.of(defaultKeymap),
        oneDark,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [filePath]);

  return <div ref={containerRef} className="h-full" />;
}
