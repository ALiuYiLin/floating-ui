import {ref, type Ref} from '@actview/core';

/**
 * actview 版（upstream 为 React hooks：useLatestRef / useEffectEvent）。
 *
 * 与 upstream 的差异：
 * - ref 为 actview 框架类型 `Ref<T>`（.value，非 React 的 .current），创建用 `ref()`
 * - actview 无渲染循环与 effect 概念（setup 只执行一次、render 闭包每次渲染执行）——
 *   `useLatestRef` 每次调用返回新的 `ref()`（引用稳定性由调用方负责）
 * - `useEffectEvent` 无 useInsertionEffect 概念：回调在调用时同步写入 ref，
 *   返回的稳定闭包始终调用最新回调。
 * - `useModernLayoutEffect` 不再导出（React 专属，actview 无 layout effect）。
 */
export function useLatestRef<T>(value: T): Ref<T> {
  const r = ref(value);
  return r;
}

type AnyFunction = (...args: any[]) => any;

export function useEffectEvent<T extends AnyFunction>(callback?: T) {
  const r = ref<AnyFunction | undefined>(callback);
  return ((...args: any[]) => r.value?.(...args)) as T;
}
