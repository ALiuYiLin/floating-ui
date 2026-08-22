import {type Ref} from '@actview/core';

/**
 * actview 版（upstream 为 React hook：useRef/useCallback/useMemo 缓存 + ref cleanup）。
 *
 * 与 upstream 的差异：
 * - 对象 ref 为 actview 框架类型 `Ref<T>`（.value，非 React 的 .current）
 * - 无 useMemo/useCallback：每次调用返回新闭包，需要稳定引用的调用方自行缓存
 *   （如在 setup 中调用一次）
 * - React 18 的 ref cleanup 由合并函数自行管理：函数 ref 的返回值（cleanup）
 *   在下次调用同位置 ref 前执行（React 语义：先 cleanup 再 ref 新值）；
 *   卸载（value 为 null）且存在 cleanup 时只调 cleanup、不调 ref(null)
 *   （对齐 React 的 commitDetachRef：有 cleanup 的 ref 卸载时不再收到 null）
 */

type MergeableRef<Instance> =
  | ((instance: Instance | null) => void | (() => void))
  | Ref<Instance | null>;

/**
 * Merges an array of refs into a single callback ref or `null`.
 * @see https://floating-ui.com/docs/react-utils#usemergerefs
 */
export function useMergeRefs<Instance>(
  refs: Array<MergeableRef<Instance> | undefined>,
): null | ((instance: Instance | null) => void) {
  if (refs.every((ref) => ref == null)) {
    return null;
  }

  const cleanups: Array<(() => void) | undefined> = [];

  return (instance) => {
    refs.forEach((ref, i) => {
      if (ref == null) {
        return;
      }

      if (typeof ref === 'function') {
        if (instance === null && cleanups[i]) {
          // React 语义：有 cleanup 的 ref 卸载时只调 cleanup，不调 ref(null)
          cleanups[i]();
          cleanups[i] = undefined;
          return;
        }
        // React 语义：先执行上次返回的 cleanup，再调用 ref 新值
        cleanups[i]?.();
        const result = ref(instance);
        cleanups[i] = typeof result === 'function' ? result : undefined;
      } else {
        ref.value = instance;
      }
    });
  };
}
