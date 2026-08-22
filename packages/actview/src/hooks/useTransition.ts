import {onUnmounted, ref, watch, type Ref} from '@actview/core';
import {useLatestRef} from '../utils';

import type {FloatingContext, Placement, ReferenceType, Side} from '../types';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - `React.useState` → `ref()`；状态机（status / isMounted / styles）返回 `Ref<T>`，
 *   调用方渲染期读 `.value`
 * - `React.useEffect` / `useModernLayoutEffect` → `watch`（依赖追踪 + immediate）
 * - 无 ReactDOM.flushSync：rAF 回调里直接赋值，actview 自行调度渲染
 * - `useLatestRef` 从 `../utils` 导入
 * - `React.CSSProperties` → `Record<string, string | number>`（actview 样式对象）
 */

type Duration =
  | number
  | {open?: number | undefined; close?: number | undefined};

// Converts a JS style key like `backgroundColor` to a CSS transition-property
// like `background-color`.
const camelCaseToKebabCase = (str: string): string =>
  str.replace(
    /[A-Z]+(?![a-z])|[A-Z]/g,
    ($, ofs) => (ofs ? '-' : '') + $.toLowerCase(),
  );

function execWithArgsOrReturn<Value extends object | undefined, SidePlacement>(
  valueOrFn: Value | ((args: SidePlacement) => Value),
  args: SidePlacement,
): Value {
  return typeof valueOrFn === 'function' ? valueOrFn(args) : valueOrFn;
}

function useDelayUnmount(open: Ref<boolean>, durationMs: number): Ref<boolean> {
  const isMounted = ref(open.value);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  watch(open, (value) => {
    if (value) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      isMounted.value = true;
    } else if (isMounted.value) {
      timeoutId = setTimeout(() => {
        isMounted.value = false;
      }, durationMs);
    }
  });

  onUnmounted(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });

  return isMounted;
}

export interface UseTransitionStatusProps {
  /**
   * The duration of the transition in milliseconds, or an object containing
   * `open` and `close` keys for different durations.
   */
  duration?: Duration | undefined;
}

type TransitionStatus = 'unmounted' | 'initial' | 'open' | 'close';

/**
 * Provides a status string to apply CSS transitions to a floating element,
 * correctly handling placement-aware transitions.
 * @see https://floating-ui.com/docs/useTransition#usetransitionstatus
 */
export function useTransitionStatus(
  context: FloatingContext,
  props: UseTransitionStatusProps = {},
): {
  isMounted: Ref<boolean>;
  status: Ref<TransitionStatus>;
} {
  const {
    open,
    elements: {floating},
  } = context;
  const {duration = 250} = props;

  const isNumberDuration = typeof duration === 'number';
  const closeDuration = (isNumberDuration ? duration : duration.close) || 0;

  const status = ref<TransitionStatus>('unmounted');
  const isMounted = useDelayUnmount(open, closeDuration);

  // React 版渲染期 `setStatus('unmounted')`：延迟卸载完成后推进状态
  watch([isMounted, status], () => {
    if (!isMounted.value && status.value === 'close') {
      status.value = 'unmounted';
    }
  });

  // React 版 `useModernLayoutEffect`：[open, floating] → 状态推进
  let frameId: number | undefined;
  watch(
    [open, floating],
    () => {
      if (frameId != null) {
        cancelAnimationFrame(frameId);
        frameId = undefined;
      }

      if (!floating.value) return;

      if (open.value) {
        status.value = 'initial';

        // Ensure it opens before paint. With `FloatingDelayGroup`,
        // this avoids a flicker when moving between floating elements
        // to ensure one is always open with no missing frames.
        frameId = requestAnimationFrame(() => {
          // actview 无 flushSync：直接赋值，actview 自行调度渲染
          status.value = 'open';
        });
      } else {
        status.value = 'close';
      }
    },
    {immediate: true},
  );

  onUnmounted(() => {
    if (frameId != null) {
      cancelAnimationFrame(frameId);
    }
  });

  return {
    isMounted,
    status,
  };
}

type CSSStylesProperty =
  | Record<string, string | number>
  | ((params: {
      side: Side;
      placement: Placement;
    }) => Record<string, string | number>);

export interface UseTransitionStylesProps extends UseTransitionStatusProps {
  /**
   * The styles to apply when the floating element is initially mounted.
   */
  initial?: CSSStylesProperty | undefined;
  /**
   * The styles to apply when the floating element is transitioning to the
   * `open` state.
   */
  open?: CSSStylesProperty | undefined;
  /**
   * The styles to apply when the floating element is transitioning to the
   * `close` state.
   */
  close?: CSSStylesProperty | undefined;
  /**
   * The styles to apply to all states.
   */
  common?: CSSStylesProperty | undefined;
}

/**
 * Provides styles to apply CSS transitions to a floating element, correctly
 * handling placement-aware transitions. Wrapper around `useTransitionStatus`.
 * @see https://floating-ui.com/docs/useTransition#usetransitionstyles
 */
export function useTransitionStyles<RT extends ReferenceType = ReferenceType>(
  context: FloatingContext<RT>,
  props: UseTransitionStylesProps = {},
): {
  isMounted: Ref<boolean>;
  styles: Ref<Record<string, string | number>>;
} {
  const {
    initial: unstable_initial = {opacity: 0},
    open: unstable_open,
    close: unstable_close,
    common: unstable_common,
    duration = 250,
  } = props;

  const isNumberDuration = typeof duration === 'number';
  const openDuration = (isNumberDuration ? duration : duration.open) || 0;
  const closeDuration = (isNumberDuration ? duration : duration.close) || 0;

  const placement = context.placement.value;
  const side = placement.split('-')[0] as Side;
  const fnArgs = {side, placement};

  const styles = ref<Record<string, string | number>>({
    ...execWithArgsOrReturn(unstable_common, fnArgs),
    ...execWithArgsOrReturn(unstable_initial, fnArgs),
  });

  const {isMounted, status} = useTransitionStatus(context, {duration});
  const initialRef = useLatestRef(unstable_initial);
  const openRef = useLatestRef(unstable_open);
  const closeRef = useLatestRef(unstable_close);
  const commonRef = useLatestRef(unstable_common);

  // React 版 `useModernLayoutEffect`：[status 等] → 计算 styles
  watch(
    [status, placement],
    () => {
      const currentPlacement = context.placement.value;
      const currentSide = currentPlacement.split('-')[0] as Side;
      const currentFnArgs = {side: currentSide, placement: currentPlacement};

      const initialStyles = execWithArgsOrReturn(
        initialRef.value,
        currentFnArgs,
      );
      const closeStyles = execWithArgsOrReturn(closeRef.value, currentFnArgs);
      const commonStyles = execWithArgsOrReturn(commonRef.value, currentFnArgs);
      const openStyles =
        execWithArgsOrReturn(openRef.value, currentFnArgs) ||
        Object.keys(initialStyles).reduce(
          (acc: Record<string, ''>, key) => {
            acc[key] = '';
            return acc;
          },
          {},
        );

      if (status.value === 'initial') {
        styles.value = {
          transitionProperty: styles.value.transitionProperty as string,
          ...commonStyles,
          ...initialStyles,
        };
      }

      if (status.value === 'open') {
        styles.value = {
          transitionProperty: Object.keys(openStyles)
            .map(camelCaseToKebabCase)
            .join(','),
          transitionDuration: `${openDuration}ms`,
          ...commonStyles,
          ...openStyles,
        };
      }

      if (status.value === 'close') {
        const closeStyle = closeStyles || initialStyles;
        styles.value = {
          transitionProperty: Object.keys(closeStyle)
            .map(camelCaseToKebabCase)
            .join(','),
          transitionDuration: `${closeDuration}ms`,
          ...commonStyles,
          ...closeStyle,
        };
      }
    },
    {immediate: true},
  );

  return {
    isMounted,
    styles,
  };
}
