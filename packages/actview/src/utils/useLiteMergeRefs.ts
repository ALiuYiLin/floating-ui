import type {Ref} from '@actview/core';

/**
 * actview 版（upstream 为 React hook：React.useMemo 缓存回调）。
 *
 * 与 upstream 的差异：
 * - ref 为 actview 框架类型 `Ref<T>`（.value，非 React 的 .current）
 * - actview 无 useMemo 概念——每次调用返回新闭包，需要稳定引用的调用方自行缓存
 *   （如在 setup 中调用一次）。
 */
export function useLiteMergeRefs<T>(
  refs: Array<Ref<T | null> | undefined>,
): (value: T | null) => void {
  return (value) => {
    refs.forEach((ref) => {
      if (ref) {
        ref.value = value;
      }
    });
  };
}
