/**
 * 通用右键菜单 — Portal 到 body 避免被父级 stacking context / overflow 裁剪
 *
 * 行为：
 * - 全局 mousedown：点到菜单外则关闭（mousedown 而非 click，避免 button onClick
 *   先于关闭触发导致菜单顺序错乱）
 * - Esc 关闭
 * - 自动夹紧：触发位置贴近右/下边缘时翻转，避免菜单溢出窗口
 *
 * 用法：
 * ```tsx
 * const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
 * const onContextMenu = (e: React.MouseEvent) => {
 *   e.preventDefault();
 *   setMenu({ x: e.clientX, y: e.clientY });
 * };
 * {menu && (
 *   <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
 *     <ContextMenuItem icon={<X />} label="..." onClick={...} />
 *     <MenuDivider />
 *     ...
 *   </ContextMenu>
 * )}
 * ```
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
  /** 最小宽度，默认 200 */
  minWidth?: number;
}

export function ContextMenu({
  x,
  y,
  onClose,
  children,
  minWidth = 200,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  // 渲染后测量自身尺寸，溢出窗口时翻转
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width > vw - 4) left = Math.max(4, vw - rect.width - 4);
    if (top + rect.height > vh - 4) top = Math.max(4, vh - rect.height - 4);
    setPos({ left, top });
  }, [x, y]);

  // 点外面关闭 + Esc 关闭
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed rounded-lg shadow-xl py-1"
      style={{
        left: pos.left,
        top: pos.top,
        minWidth,
        zIndex: 9999,
        backgroundColor: "#1a1c23",
        border: "1px solid #2a2d36",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

interface ContextMenuItemProps {
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function ContextMenuItem({
  icon,
  label,
  shortcut,
  onClick,
  danger,
  disabled,
}: ContextMenuItemProps) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
      style={{ color: danger ? "#ef4444" : "#e4e6eb" }}
      onClick={onClick}
      disabled={disabled}
    >
      {icon ? (
        <span className="flex-shrink-0 w-3.5 h-3.5 inline-flex items-center justify-center">
          {icon}
        </span>
      ) : (
        <span className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-[10px]" style={{ color: "#6b7280" }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t" style={{ borderColor: "#2a2d36" }} />;
}
