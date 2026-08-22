import {computed, createContext, defineComponent, onWatcherCleanup, ref, watch, type Ref} from '@actview/core';

import {getDelay} from '../hooks/useHover';
import type {FloatingRootContext} from '../types';

/**
 * actview 版（upstream 为 React 组件）。
 *
 * 与 upstream 的差异：
 * - `React.createContext` → actview 官方 `createContext`（`.use()` 返回 `Ref<T>`）
 * - `React.useReducer` → `ref()` + `setState`（Partial merge，.value 替换触发渲染）
 * - `useModernLayoutEffect` → `watch`；effect cleanup → `onWatcherCleanup`
 * - `useDelayGroupContext` / `useDelayGroup` 返回 `Ref`（渲染期读 .value）；
 *   `id` 为 `computed`（floatingId 挂载后才有值）
 */

type Delay =
  | number
  | Partial<{open: number | undefined; close: number | undefined}>;

interface GroupState {
  delay: Delay;
  initialDelay: Delay;
  currentId: any;
  timeoutMs: number;
  isInstantPhase: boolean;
}

interface GroupContext extends GroupState {
  setCurrentId: (currentId: any) => void;
  setState: (next: Partial<GroupState>) => void;
}

const NOOP = () => {};

const FloatingDelayGroupContext = createContext<GroupContext>({
  delay: 0,
  initialDelay: 0,
  timeoutMs: 0,
  currentId: null,
  setCurrentId: NOOP,
  setState: NOOP,
  isInstantPhase: false,
});

/**
 * @deprecated
 * Use the return value of `useDelayGroup()` instead.
 */
export const useDelayGroupContext = (): Ref<GroupContext> =>
  FloatingDelayGroupContext.use();

export interface FloatingDelayGroupProps {
  children?: any;
  /**
   * The delay to use for the group.
   */
  delay: Delay;
  /**
   * An optional explicit timeout to use for the group, which represents when
   * grouping logic will no longer be active after the close delay completes.
   * This is useful if you want grouping to “last” longer than the close delay,
   * for example if there is no close delay at all.
   */
  timeoutMs?: number | undefined;
}

/**
 * Provides context for a group of floating elements that should share a
 * `delay`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export const FloatingDelayGroup = defineComponent(function (
  props: FloatingDelayGroupProps,
) {
  const {children, delay, timeoutMs = 0} = props;

  const state = ref<GroupState>({
    delay,
    timeoutMs,
    initialDelay: delay,
    currentId: null,
    isInstantPhase: false,
  });

  const setState = (next: Partial<GroupState>) => {
    state.value = {...state.value, ...next};
  };

  const setCurrentId = (currentId: any) => {
    setState({currentId});
  };

  const initialCurrentIdRef = ref<any>(null);

  // React 版 `useModernLayoutEffect`：[state.currentId, state.isInstantPhase]
  watch(
    () => [state.value.currentId, state.value.isInstantPhase],
    () => {
      if (state.value.currentId) {
        if (initialCurrentIdRef.value === null) {
          initialCurrentIdRef.value = state.value.currentId;
        } else if (!state.value.isInstantPhase) {
          setState({isInstantPhase: true});
        }
      } else {
        if (state.value.isInstantPhase) {
          setState({isInstantPhase: false});
        }
        initialCurrentIdRef.value = null;
      }
    },
  );

  const contextValue = computed<GroupContext>(() => ({
    ...state.value,
    setState,
    setCurrentId,
  }));

  return () => (
    <FloatingDelayGroupContext.Provider value={contextValue.value}>
      {children}
    </FloatingDelayGroupContext.Provider>
  );
});

interface UseGroupOptions {
  /**
   * Whether delay grouping should be enabled.
   * @default true
   */
  enabled?: boolean | undefined;
  id?: any;
}

/**
 * Enables grouping when called inside a component that's a child of a
 * `FloatingDelayGroup`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export function useDelayGroup(
  context: FloatingRootContext,
  options: UseGroupOptions = {},
): Ref<GroupContext> {
  const {open, onOpenChange, floatingId} = context;
  const {id: optionId, enabled = true} = options;
  const id = computed(() => optionId ?? floatingId.value);

  const groupContext = useDelayGroupContext();

  // React 版 effect [enabled, id, onOpenChange, setState, currentId, initialDelay]
  watch(
    () => [
      enabled,
      id.value,
      groupContext.value.currentId,
      groupContext.value.initialDelay,
    ],
    () => {
      const {currentId, initialDelay, setState} = groupContext.value;
      if (!enabled) return;
      if (!currentId) return;

      setState({
        delay: {
          open: 1,
          close: getDelay(initialDelay, 'close'),
        },
      });

      if (currentId !== id.value) {
        onOpenChange(false);
      }
    },
  );

  // React 版 effect [enabled, open, setState, currentId, id, onOpenChange,
  // initialDelay, timeoutMs]
  watch(
    () => [
      enabled,
      open.value,
      groupContext.value.currentId,
      groupContext.value.initialDelay,
      groupContext.value.timeoutMs,
    ],
    () => {
      function unset() {
        onOpenChange(false);
        groupContext.value.setState({
          delay: groupContext.value.initialDelay,
          currentId: null,
        });
      }

      const {currentId, timeoutMs, setState, initialDelay} = groupContext.value;
      if (!enabled) return;
      if (!currentId) return;

      if (!open.value && currentId === id.value) {
        if (timeoutMs) {
          const timeout = window.setTimeout(unset, timeoutMs);
          onWatcherCleanup(() => {
            clearTimeout(timeout);
          });
          return;
        }

        unset();
      }
    },
  );

  // React 版 effect [enabled, open, setCurrentId, id]
  watch(
    () => [enabled, open.value, id.value],
    () => {
      if (!enabled) return;
      if (groupContext.value.setCurrentId === NOOP || !open.value) return;
      groupContext.value.setCurrentId(id.value);
    },
  );

  return groupContext;
}
