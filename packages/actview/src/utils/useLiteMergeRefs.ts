import type {Ref} from '@actview/core';

/**
 * actview 版（upstream 为 React hook：React.useMemo 缓存回调）。
 *
 * 与 upstream 的差异：
 * - ref 为 actview 框架类型 `Ref<T>`（.value，非 React 的 .current）
 * - 支持惰性 ref（`() => Ref<T | null> | fn | undefined`）：调用时求值，
 *   用于 portalContext 等挂载后才可用的 ref（如 FloatingFocusManager 的
 *   merged guard refs）
 * - actview 无 useMemo 概念——每次调用返回新闭包，需要稳定引用的调用方自行缓存
 *   （如在 setup 中调用一次）。
 */

export type LiteMergeableRef<T> =
  | Ref<T | null>
  | ((value: T | null) => void)
  | (() => Ref<T | null> | ((value: T | null) => void) | undefined);

export function useLiteMergeRefs<T>(
  refs: Array<LiteMergeableRef<T> | undefined>,
): (value: T | null) => void {
  return (value) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === 'function') {
        // 函数 ref 直接执行；惰性 ref 返回目标 Ref 后赋值
        const resolved = (ref as (value: T | null) => unknown)(value);
        if (resolved && typeof resolved === 'object' && 'value' in resolved) {
          (resolved as Ref<T | null>).value = value;
        }
      } else {
        ref.value = value;
      }
    });
  };
}
