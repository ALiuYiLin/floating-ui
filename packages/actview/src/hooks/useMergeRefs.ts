import {type Ref} from '@actview/core';

/**
 * actview 版（upstream 为 React hook：useRef/useCallback/useMemo 缓存 + ref cleanup）。
 *
 * 与 upstream 的差异：
 * - 对象 ref 为 actview 框架类型 `Ref<T>`（.value，非 React 的 .current）
 * - 无 useMemo/useCallback：每次调用返回新闭包，需要稳定引用的调用方自行缓存
 *   （如在 setup 中调用一次）
 * - 无 React 18 的 ref cleanup 机制（函数 ref 的返回值忽略）
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

  return (instance) => {
    refs.forEach((ref) => {
      if (ref == null) {
        return;
      }

      if (typeof ref === 'function') {
        ref(instance);
      } else {
        ref.value = instance;
      }
    });
  };
}
