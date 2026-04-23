/**
 * Monaco Editor 初始化与语言识别
 *
 * 设计取舍：
 * - 只加载 editor.worker，不引入 ts/json/css/html 的 LSP worker（CLAUDE.md 明确不加 LSP）
 * - 把所有内置语言服务的诊断/补全/格式化关掉，只保留 Tokenizer 负责的语法高亮
 * - 本模块被 FileEditor 动态 import，确保 ~3MB 的 monaco 包不阻塞冷启动
 */
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

let initialized = false;

export function setupMonaco(): typeof monaco {
  if (initialized) return monaco;

  self.MonacoEnvironment = {
    getWorker() {
      return new EditorWorker();
    },
  };

  // 关闭 TS/JS 的语义/语法诊断和建议（只保留 tokenization → 语法高亮）
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  });
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  });

  // 关闭 JSON/CSS 的 validate（monaco 内置校验器会弹红波浪线）
  monaco.json.jsonDefaults.setDiagnosticsOptions({
    validate: false,
    allowComments: true,
  });
  monaco.css.cssDefaults.setOptions({ validate: false });
  monaco.css.scssDefaults.setOptions({ validate: false });
  monaco.css.lessDefaults.setOptions({ validate: false });

  initialized = true;
  return monaco;
}

/** 根据文件路径推断 Monaco language id；找不到返回 "plaintext" */
export function detectLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  const languages = monaco.languages.getLanguages();

  for (const lang of languages) {
    if (lang.filenames?.some((n) => n.toLowerCase() === base)) {
      return lang.id;
    }
  }
  for (const lang of languages) {
    if (lang.extensions?.some((ext) => lower.endsWith(ext.toLowerCase()))) {
      return lang.id;
    }
  }
  return "plaintext";
}
