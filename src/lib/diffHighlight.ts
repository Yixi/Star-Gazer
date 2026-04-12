/**
 * Diff 语法高亮 - 基于 refractor 为 react-diff-view 生成 tokens
 *
 * ⚠ 版本适配：react-diff-view 依赖 refractor ^2.x，而我们装的是 refractor 5.x
 *   refractor 2.x 的 highlight() 返回 hast 节点数组
 *   refractor 5.x 的 highlight() 返回 Root 对象 { type: "root", children: [...] }
 *   两者不兼容，所以需要包装 refractor 让 highlight() 返回数组
 *
 * 根据文件扩展名选择语言，降级到 plaintext 时不报错
 */
import { tokenize, type FileData, type HunkData, type TokenizeOptions } from "react-diff-view";
import { refractor } from "refractor";
// refractor 的 common 入口不含 tsx/jsx，手动注册
// refractor 5.x 的 exports: "./*" → "./lang/*.js"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - refractor lang 没有 .d.ts
import tsxLang from "refractor/tsx";
// @ts-ignore
import jsxLang from "refractor/jsx";
// @ts-ignore
import tomlLang from "refractor/toml";

let _registered = false;
function ensureLanguagesRegistered() {
  if (_registered) return;
  try {
    refractor.register(tsxLang);
    refractor.register(jsxLang);
    refractor.register(tomlLang);
  } catch (err) {
    console.warn("注册 refractor 额外语言失败:", err);
  }
  _registered = true;
}

/**
 * 包装 refractor 5.x 使其 highlight() 返回数组，兼容 react-diff-view 的 refractor 2.x API
 */
const refractorAdapter = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  highlight(value: string, language: string): any {
    const root = refractor.highlight(value, language);
    // refractor 5.x 返回 Root；取出其 children 数组
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (root as any).children ?? [];
  },
  registered(name: string): boolean {
    return refractor.registered(name);
  },
};

/** 从文件路径推断 refractor 语言名 */
export function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "js": return "javascript";
    case "jsx": return "jsx";
    case "ts": return "typescript";
    case "tsx": return "tsx";
    case "mjs":
    case "cjs": return "javascript";
    case "mts":
    case "cts": return "typescript";
    case "py": return "python";
    case "rs": return "rust";
    case "go": return "go";
    case "java": return "java";
    case "kt":
    case "kts": return "kotlin";
    case "swift": return "swift";
    case "c":
    case "h": return "c";
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "hxx": return "cpp";
    case "cs": return "csharp";
    case "rb": return "ruby";
    case "php": return "php";
    case "sh":
    case "bash":
    case "zsh": return "bash";
    case "json":
    case "jsonc": return "json";
    case "yml":
    case "yaml": return "yaml";
    case "toml": return "toml";
    case "xml":
    case "svg": return "markup";
    case "html":
    case "htm":
    case "vue": return "markup";
    case "css": return "css";
    case "scss":
    case "sass": return "scss";
    case "less": return "less";
    case "md":
    case "mdx": return "markdown";
    case "sql": return "sql";
    default:
      return "plaintext";
  }
}

/**
 * 根据 file.type + hunk 内容推断"有效 diff 类型"
 *
 * parseDiff 依赖 git header 的 `new file mode` / `deleted file mode` 识别 add/delete，
 * range diff / merge diff / 某些 parseDiff 未覆盖的场景可能把纯新增文件标成 "modify"。
 * 这里补一层内容检测：所有 change 全是 insert → 视为 add；全是 delete → 视为 delete。
 * 上层请用 useMemo 缓存结果，单个文件切换才会重算。
 */
export function detectEffectiveDiffType(
  file: FileData,
): "add" | "delete" | "modify" {
  if (file.type === "add") return "add";
  if (file.type === "delete") return "delete";
  if (file.hunks.length === 0) return "modify";

  let hasInsert = false;
  let hasDelete = false;
  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      if (change.type === "normal") return "modify";
      if (change.type === "insert") hasInsert = true;
      else if (change.type === "delete") hasDelete = true;
      if (hasInsert && hasDelete) return "modify";
    }
  }
  if (hasInsert && !hasDelete) return "add";
  if (hasDelete && !hasInsert) return "delete";
  return "modify";
}

/** 为 hunks 生成 refractor tokens；失败时返回 null，由 Hunk 自行 fallback */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function highlightHunks(hunks: HunkData[], filePath: string): any {
  ensureLanguagesRegistered();
  try {
    const language = languageFromPath(filePath);
    if (language === "plaintext" || !refractor.registered(language)) {
      return null;
    }
    const options: TokenizeOptions = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      refractor: refractorAdapter as any,
      highlight: true,
      language,
    };
    return tokenize(hunks, options);
  } catch (err) {
    console.warn("Syntax highlighting failed:", err);
    return null;
  }
}
