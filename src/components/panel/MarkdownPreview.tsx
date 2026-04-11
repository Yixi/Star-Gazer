/**
 * 文件预览组件
 * - Markdown：使用 react-markdown + remark-gfm 渲染
 * - 图片：使用 Tauri asset 协议预览
 */
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { convertFileSrc } from "@tauri-apps/api/core";

interface MarkdownPreviewProps {
  filePath: string;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);

export function MarkdownPreview({ filePath }: MarkdownPreviewProps) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const isImage = IMAGE_EXTS.has(ext);

  if (isImage) {
    return <ImagePreview filePath={filePath} />;
  }
  return <MarkdownContent filePath={filePath} />;
}

/** 图片预览 */
function ImagePreview({ filePath }: { filePath: string }) {
  const src = convertFileSrc(filePath);
  const name = filePath.split("/").pop() ?? filePath;

  return (
    <div
      className="h-full overflow-auto flex flex-col items-center justify-center gap-4 p-8"
      style={{ backgroundColor: "#0f1116" }}
    >
      <img
        src={src}
        alt={name}
        className="max-w-full max-h-[80%] object-contain rounded-lg"
        style={{ border: "1px solid #1f2128" }}
      />
      <span className="text-xs" style={{ color: "#6b7280" }}>{name}</span>
    </div>
  );
}

/** Markdown 渲染 */
function MarkdownContent({ filePath }: { filePath: string }) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const text = await invoke<string>("read_file", { path: filePath });
        if (!cancelled) setContent(text);
      } catch (err) {
        if (!cancelled) setContent(`> 无法读取文件: ${err}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [filePath]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: "#6b7280" }}>
        加载中...
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-auto px-6 py-4"
      style={{ backgroundColor: "#0f1116" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        children={content}
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-3 pb-2" style={{ color: "#e4e6eb", borderBottom: "1px solid #1f2128" }}>{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-semibold mt-5 mb-2 pb-1.5" style={{ color: "#e4e6eb", borderBottom: "1px solid #1f2128" }}>{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2" style={{ color: "#e4e6eb" }}>{children}</h3>,
          h4: ({ children }) => <h4 className="text-base font-semibold mt-3 mb-1" style={{ color: "#e4e6eb" }}>{children}</h4>,
          p: ({ children }) => <p className="my-2 leading-relaxed text-sm" style={{ color: "#b8bcc4" }}>{children}</p>,
          a: ({ href, children }) => <a href={href} className="underline" style={{ color: "#4a9eff" }}>{children}</a>,
          ul: ({ children }) => <ul className="my-2 pl-6 list-disc text-sm" style={{ color: "#b8bcc4" }}>{children}</ul>,
          ol: ({ children }) => <ol className="my-2 pl-6 list-decimal text-sm" style={{ color: "#b8bcc4" }}>{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 pl-4 text-sm" style={{ borderLeft: "3px solid #4a9eff", color: "#8b92a3" }}>
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            const isBlock = className?.startsWith("language-");
            if (isBlock) {
              return (
                <pre className="my-3 p-4 rounded-lg overflow-x-auto text-xs" style={{ backgroundColor: "#0d0e13", border: "1px solid #1f2128" }}>
                  <code className="font-mono" style={{ color: "#e4e6eb" }}>{children}</code>
                </pre>
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: "#1a1c23", color: "#e4e6eb" }}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "#e4e6eb", borderBottom: "2px solid #1f2128", backgroundColor: "#1a1c23" }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-sm" style={{ color: "#b8bcc4", borderBottom: "1px solid #1f2128" }}>
              {children}
            </td>
          ),
          hr: () => <hr className="my-4" style={{ borderColor: "#1f2128" }} />,
          img: ({ src, alt }) => <img src={src} alt={alt} className="max-w-full rounded my-2" />,
          input: ({ type, checked, ...props }) => {
            if (type === "checkbox") {
              return <input type="checkbox" checked={checked} readOnly className="mr-2" {...props} />;
            }
            return <input type={type} {...props} />;
          },
        }}
      />
    </div>
  );
}
