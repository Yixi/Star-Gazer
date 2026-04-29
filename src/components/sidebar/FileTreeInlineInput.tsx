/**
 * 文件树内联输入框 — rename / create 共用
 *
 * 行为：
 * - autoFocus + 进入时自动选中（rename 时仅选中 basename，避开扩展名）
 * - Enter 提交（trim 后非空才回调）
 * - Esc 取消
 * - blur 默认按提交处理（vscode 风格），caller 可改成取消
 *
 * 视觉对齐：和 FileTreeNode 文件名 span 同位置同字号，看起来"原地变成 input"
 */
import { useEffect, useRef } from "react";

interface FileTreeInlineInputProps {
  initialValue: string;
  /** 是否是文件（用于 rename 时只选中 basename，不选扩展名）*/
  isFile?: boolean;
  /** 提交：返回非空 trim 后的名字 */
  onSubmit: (name: string) => void;
  /** 取消（用户按 Esc 或 blur 时如果指定 onBlur="cancel"）*/
  onCancel: () => void;
  /** blur 时是 commit 还是 cancel — 默认 commit（VSCode 行为）*/
  blurBehavior?: "commit" | "cancel";
}

export function FileTreeInlineInput({
  initialValue,
  isFile,
  onSubmit,
  onCancel,
  blurBehavior = "commit",
}: FileTreeInlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // 文件 rename：只选中 basename，避开扩展名（VSCode 行为）
    if (isFile) {
      const lastDot = initialValue.lastIndexOf(".");
      if (lastDot > 0) {
        el.setSelectionRange(0, lastDot);
        return;
      }
    }
    el.select();
  }, [initialValue, isFile]);

  const submit = () => {
    const v = inputRef.current?.value.trim() ?? "";
    if (v.length === 0) {
      onCancel();
      return;
    }
    if (v === initialValue) {
      onCancel();
      return;
    }
    onSubmit(v);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={initialValue}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        // 其它键不冒泡到树容器，避免触发 F2 / 删除等树级快捷键
        e.stopPropagation();
      }}
      onBlur={() => {
        if (blurBehavior === "cancel") onCancel();
        else submit();
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        flex: 1,
        minWidth: 0,
        height: 18,
        padding: "0 4px",
        fontSize: 13,
        lineHeight: "18px",
        color: "#e4e6eb",
        background: "#0e1017",
        border: "1px solid #4a9eff",
        borderRadius: 3,
        outline: "none",
      }}
    />
  );
}
