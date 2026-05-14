/**
 * 文件树删除确认对话框 — Portal 到 body 的轻量 confirm
 *
 * 视觉风格沿用 AgentCard 的 confirmClose 弹窗，避免引入新组件。
 * 用于删除前提示用户文件会被移到回收站。
 */
import { createPortal } from "react-dom";
import { useEffect } from "react";

interface FileTreeDeleteDialogProps {
  /** 待删除节点的显示名 */
  name: string;
  /** 是否目录（措辞略有不同）*/
  isDir: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FileTreeDeleteDialog({
  name,
  isDir,
  onConfirm,
  onCancel,
}: FileTreeDeleteDialogProps) {
  // Esc 取消，Enter 确认
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onConfirm, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-lg shadow-xl"
        style={{
          minWidth: 360,
          maxWidth: 480,
          background: "var(--sg-bg-card)",
          border: "1px solid var(--sg-border-divider)",
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#e4e6eb",
            marginBottom: 8,
          }}
        >
          确认删除
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#8b92a3",
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          {isDir ? "目录" : "文件"}{" "}
          <span style={{ color: "#e4e6eb", fontWeight: 500 }}>{name}</span>{" "}
          {isDir ? "及其所有内容" : ""}将被移到系统回收站，可在 Finder
          中恢复。
        </div>
        <div
          className="flex justify-end"
          style={{ gap: 8 }}
        >
          <button
            onClick={onCancel}
            className="transition-colors"
            style={{
              padding: "6px 14px",
              fontSize: 12,
              color: "#c8ccd3",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--sg-border-divider)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="transition-colors"
            style={{
              padding: "6px 14px",
              fontSize: 12,
              color: "#fff",
              background: "rgba(239, 68, 68, 0.85)",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: 4,
              cursor: "pointer",
            }}
            autoFocus
          >
            移到回收站
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
