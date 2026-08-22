import {computed, createContext, defineComponent, onUnmounted, onWatcherCleanup, ref, watch, type Ref} from '@actview/core';

import {getDelay} from '../hooks/useHover';
import type {Delay, FloatingRootContext} from '../types';
import {clearTimeoutIfSet} from '../utils/clearTimeoutIfSet';

/**
 * actview 版（upstream 为 React 组件，实验性）。
 *
 * 与 upstream 的差异：
 * - `React.createContext` → actview 官方 `createContext`（`.use()` 返回 `Ref<T>`）
 * - `React.useRef` → `ref()`；`React.useState` → `ref()`；
 *   `useModernLayoutEffect` → `watch`；effect cleanup → `onWatcherCleanup`
 * - `useNextDelayGroup` 的 `isInstantPhase` 返回 `Ref<boolean>`（渲染期读 .value）
 * - `floatingId` 为 `Ref` → `.value`
 */

interface CurrentContext {
  onOpenChange: (open: boolean) => void;
  setIsInstantPhase: (value: boolean) => void;
}

interface ContextValue {
  hasProvider: boolean;
  timeoutMs: number;
  delayRef: Ref<Delay>;
  initialDelayRef: Ref<Delay>;
  timeoutIdRef: Ref<number>;
  currentIdRef: Ref<any>;
  currentContextRef: Ref<CurrentContext | null>;
}

const NextFloatingDelayGroupContext = createContext<ContextValue>({
  hasProvider: false,
  timeoutMs: 0,
  delayRef: ref<Delay>(0),
  initialDelayRef: ref<Delay>(0),
  timeoutIdRef: ref(-1),
  currentIdRef: ref<any>(null),
  currentContextRef: ref<CurrentContext | null>(null),
});

export interface NextFloatingDelayGroupProps {
  children?: any;
  /**
   * The delay to use for the group when it's not in the instant phase.
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
 * Experimental next version of `FloatingDelayGroup` to become the default
 * in the future. This component is not yet stable.
 * Provides context for a group of floating elements that should share a
 * `delay`. Unlike `FloatingDelayGroup`, `useNextDelayGroup` with this
 * component does not cause a re-render of unrelated consumers of the
 * context when the delay changes.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export const NextFloatingDelayGroup = defineComponent(function (
  props: NextFloatingDelayGroupProps,
) {
  const {children, delay, timeoutMs = 0} = props;

  const delayRef = ref<Delay>(delay);
  const initialDelayRef = ref<Delay>(delay);
  const currentIdRef = ref<string | null>(null);
  const currentContextRef = ref<CurrentContext | null>(null);
  const timeoutIdRef = ref(-1);

  const contextValue = computed<ContextValue>(() => ({
    hasProvider: true,
    delayRef,
    initialDelayRef,
    currentIdRef,
    timeoutMs,
    currentContextRef,
    timeoutIdRef,
  }));

  return () => (
    <NextFloatingDelayGroupContext.Provider value={contextValue.value}>
      {children}
    </NextFloatingDelayGroupContext.Provider>
  );
});

interface UseNextDelayGroupOptions {
  /**
   * Whether delay grouping should be enabled.
   * @default true
   */
  enabled?: boolean | undefined;
}

interface UseNextDelayGroupReturn {
  /**
   * The delay reference object.
   */
  delayRef: Ref<Delay>;
  /**
   * Whether animations should be removed.
   */
  isInstantPhase: Ref<boolean>;
  /**
   * Whether a `<NextFloatingDelayGroup>` provider is present.
   */
  hasProvider: boolean;
}

/**
 * Enables grouping when called inside a component that's a child of a
 * `NextFloatingDelayGroup`.
 * @see https://floating-ui.com/docs/FloatingDelayGroup
 */
export function useNextDelayGroup(
  context: FloatingRootContext,
  options: UseNextDelayGroupOptions = {},
): UseNextDelayGroupReturn {
  const {open, onOpenChange, floatingId} = context;
  const {enabled = true} = options;

  const groupContext = NextFloatingDelayGroupContext.use();
  const {
    currentIdRef,
    delayRef,
    timeoutMs,
    initialDelayRef,
    currentContextRef,
    hasProvider,
    timeoutIdRef,
  } = groupContext.value;

  const isInstantPhase = ref(false);

  // React 版 effect [enabled, open, floatingId, ...]：unset / timeout
  watch(
    () => [enabled, open.value, currentIdRef.value, timeoutMs],
    () => {
      function unset() {
        isInstantPhase.value = false;
        currentContextRef.value?.setIsInstantPhase(false);
        currentIdRef.value = null;
        currentContextRef.value = null;
        delayRef.value = initialDelayRef.value;
      }

      if (!enabled) return;
      if (!currentIdRef.value) return;

      if (!open.value && currentIdRef.value === floatingId.value) {
        isInstantPhase.value = false;

        if (timeoutMs) {
          timeoutIdRef.value = window.setTimeout(unset, timeoutMs);
          onWatcherCleanup(() => {
            clearTimeout(timeoutIdRef.value);
          });
          return;
        }

        unset();
      }
    },
  );

  // React 版 effect [enabled, open, floatingId, ...]：切换当前 context
  watch(
    () => [enabled, open.value, floatingId.value],
    () => {
      if (!enabled) return;
      if (!open.value) return;

      const prevContext = currentContextRef.value;
      const prevId = currentIdRef.value;

      currentContextRef.value = {onOpenChange, setIsInstantPhase};
      currentIdRef.value = floatingId.value;
      delayRef.value = {
        open: 0,
        close: getDelay(initialDelayRef.value, 'close'),
      };

      if (prevId !== null && prevId !== floatingId.value) {
        clearTimeoutIfSet(timeoutIdRef);
        isInstantPhase.value = true;
        prevContext?.setIsInstantPhase(true);
        prevContext?.onOpenChange(false);
      } else {
        isInstantPhase.value = false;
        prevContext?.setIsInstantPhase(false);
      }
    },
  );

  // React 版卸载 cleanup
  onUnmounted(() => {
    currentContextRef.value = null;
  });

  function setIsInstantPhase(value: boolean) {
    isInstantPhase.value = value;
  }

  return {
    hasProvider,
    delayRef,
    isInstantPhase,
  };
}
