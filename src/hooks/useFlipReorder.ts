/**
 * FLIP 排序过渡动画 Hook
 *
 * 用法：
 * ```tsx
 * const registerRef = useFlipReorder(items.map(i => i.id));
 * items.map(item => (
 *   <div key={item.id} ref={registerRef(item.id)}>...</div>
 * ))
 * ```
 *
 * 原理（First → Last → Invert → Play）：
 * 1. 上一轮 render 测量每个 key 的 bounding rect（First）
 * 2. 本轮 render 后在 useLayoutEffect 里再测一次（Last）
 * 3. 对每个 key 应用 `translate(dx, dy)` 把它"扳回"起点（Invert）
 * 4. 下一帧清掉 transform 触发 transition 走到 0,0（Play）
 *
 * 只响应 `ids` 数组的顺序变化；若 items 不变则没有动画开销。
 */
import { useLayoutEffect, useRef, useCallback } from "react";

export function useFlipReorder(ids: string[], durationMs = 240) {
  const refs = useRef<Map<string, HTMLElement>>(new Map());
  const lastRects = useRef<Map<string, DOMRect>>(new Map());

  // 以 ids.join 作为依赖，顺序变化才重跑
  const idsKey = ids.join("|");

  useLayoutEffect(() => {
    // 测量当前 DOM 位置
    const current = new Map<string, DOMRect>();
    refs.current.forEach((el, id) => {
      current.set(id, el.getBoundingClientRect());
    });

    // 对比 lastRects，对每个位置变化的元素做 FLIP
    lastRects.current.forEach((last, id) => {
      const el = refs.current.get(id);
      if (!el) return;
      const now = current.get(id);
      if (!now) return;
      const dx = last.left - now.left;
      const dy = last.top - now.top;
      if (dx === 0 && dy === 0) return;

      // 先把元素"扳回"上次位置，关闭 transition 瞬间完成
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;

      // 下一帧开启 transition，把 transform 清掉，就会平滑移动到真实位置
      requestAnimationFrame(() => {
        el.style.transition = `transform ${durationMs}ms cubic-bezier(0.2, 0, 0, 1)`;
        el.style.transform = "";
      });
    });

    lastRects.current = current;
    // 依赖 idsKey：顺序变化才重测
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // 返回一个工厂：registerRef(id) 得到一个 ref callback
  return useCallback((id: string) => {
    return (el: HTMLElement | null) => {
      if (el) {
        refs.current.set(id, el);
      } else {
        refs.current.delete(id);
      }
    };
  }, []);
}
