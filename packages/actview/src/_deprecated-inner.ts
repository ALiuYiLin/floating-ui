import {
  offset,
  type Derivable,
  type DetectOverflowOptions,
  type MiddlewareState,
  type SideObject,
} from '@floating-ui/dom';
import {evaluate, max, min, round} from '@floating-ui/utils';
import {getUserAgent} from '@floating-ui/actview/utils';
import {ref, watch, type Ref} from '@actview/core';

import type {
  ElementProps,
  FloatingRootContext,
  Middleware,
} from './types';
import {warn} from './utils/log';

/**
 * actview 版（upstream 为 React 工具/hook，已废弃）。
 *
 * 与 upstream 的差异：
 * - `@floating-ui/react-dom` 的 `offset` → `@floating-ui/dom` 的 `offset`
 * - `React.MutableRefObject` → actview `Ref<T>`（.value）
 * - `ReactDOM.flushSync` 移除（actview 自行调度渲染）
 * - `useEffect` → `watch`；`useEffectEvent` → 普通函数（闭包读 `.value`）
 * - 无 React 合成事件：onScroll 等为原生事件
 */

function getArgsWithCustomFloatingHeight(
  state: MiddlewareState,
  height: number,
) {
  return {
    ...state,
    rects: {
      ...state.rects,
      floating: {
        ...state.rects.floating,
        height,
      },
    },
  };
}

export interface InnerProps extends DetectOverflowOptions {
  /**
   * A ref which contains an array of HTML elements.
   * @default empty list
   */
  listRef: Ref<Array<HTMLElement | null>>;
  /**
   * The index of the active (focused or highlighted) item in the list.
   * @default 0
   */
  index: number;
  /**
   * Callback invoked when the fallback state changes.
   */
  onFallbackChange?: null | ((fallback: boolean) => void) | undefined;
  /**
   * The offset to apply to the floating element.
   * @default 0
   */
  offset?: number | undefined;
  /**
   * A ref which contains the overflow of the floating element.
   */
  overflowRef?: Ref<SideObject | null> | undefined;
  /**
   * An optional ref containing an HTMLElement. This may be used as the
   * scrolling container instead of the floating element — for instance,
   * to position inner elements as direct children without being interfered by
   * scrolling layout.
   */
  scrollRef?: Ref<HTMLElement | null> | undefined;
  /**
   * The minimum number of items that should be visible in the list.
   * @default 4
   */
  minItemsVisible?: number | undefined;
  /**
   * The threshold for the reference element's overflow in pixels.
   * @default 0
   */
  referenceOverflowThreshold?: number | undefined;
}

/**
 * Positions the floating element such that an inner element inside of it is
 * anchored to the reference element.
 * @see https://floating-ui.com/docs/inner
 * @deprecated
 */
export const inner = (
  props: InnerProps | Derivable<InnerProps>,
): Middleware => ({
  name: 'inner',
  options: props,
  async fn(state) {
    const {
      listRef,
      overflowRef,
      onFallbackChange,
      offset: innerOffset = 0,
      index = 0,
      minItemsVisible = 4,
      referenceOverflowThreshold = 0,
      scrollRef,
      ...detectOverflowOptions
    } = evaluate(props, state);

    const {
      rects,
      platform,
      elements: {floating},
    } = state;

    const item = listRef.value[index];
    const scrollEl = scrollRef?.value || floating;

    // Valid combinations:
    // 1. Floating element is the scrollRef and has a border (default)
    // 2. Floating element is not the scrollRef, floating element has a border
    // 3. Floating element is not the scrollRef, scrollRef has a border
    // Floating > {...getFloatingProps()} wrapper > scrollRef > items is not
    // allowed as VoiceOver doesn't work.
    const clientTop = floating.clientTop || scrollEl.clientTop;
    const floatingIsBordered = floating.clientTop !== 0;
    const scrollElIsBordered = scrollEl.clientTop !== 0;
    const floatingIsScrollEl = floating === scrollEl;

    if (__DEV__) {
      if (!state.placement.startsWith('bottom')) {
        warn(
          '`placement` side must be "bottom" when using the `inner`',
          'middleware.',
        );
      }
    }

    if (!item) {
      return {};
    }

    const nextArgs = {
      ...state,
      ...(await offset(
        -item.offsetTop -
          floating.clientTop -
          rects.reference.height / 2 -
          item.offsetHeight / 2 -
          innerOffset,
      ).fn(state)),
    };

    const overflow = await platform.detectOverflow(
      getArgsWithCustomFloatingHeight(
        nextArgs,
        scrollEl.scrollHeight + clientTop + floating.clientTop,
      ),
      detectOverflowOptions,
    );
    const refOverflow = await platform.detectOverflow(nextArgs, {
      ...detectOverflowOptions,
      elementContext: 'reference',
    });

    const diffY = max(0, overflow.top);
    const nextY = nextArgs.y + diffY;
    const isScrollable = scrollEl.scrollHeight > scrollEl.clientHeight;
    const rounder = isScrollable ? (v: number) => v : round;

    const maxHeight = rounder(
      max(
        0,
        scrollEl.scrollHeight +
          ((floatingIsBordered && floatingIsScrollEl) || scrollElIsBordered
            ? clientTop * 2
            : 0) -
          diffY -
          max(0, overflow.bottom),
      ),
    );

    scrollEl.style.maxHeight = `${maxHeight}px`;
    scrollEl.scrollTop = diffY;

    // There is not enough space, fallback to standard anchored positioning
    if (onFallbackChange) {
      const shouldFallback =
        scrollEl.offsetHeight <
          item.offsetHeight * min(minItemsVisible, listRef.value.length) - 1 ||
        refOverflow.top >= -referenceOverflowThreshold ||
        refOverflow.bottom >= -referenceOverflowThreshold;

      // actview 无 flushSync：直接调用
      onFallbackChange(shouldFallback);
    }

    if (overflowRef) {
      overflowRef.value = await platform.detectOverflow(
        getArgsWithCustomFloatingHeight(
          {...nextArgs, y: nextY},
          scrollEl.offsetHeight + clientTop + floating.clientTop,
        ),
        detectOverflowOptions,
      );
    }

    return {
      y: nextY,
    };
  },
});

export interface UseInnerOffsetProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: boolean | undefined;
  /**
   * A ref which contains the overflow of the floating element.
   */
  overflowRef: Ref<SideObject | null>;
  /**
   * An optional ref containing an HTMLElement. This may be used as the
   * scrolling container instead of the floating element — for instance,
   * to position inner elements as direct children without being interfered by
   * scrolling layout.
   */
  scrollRef?: Ref<HTMLElement | null> | undefined;
  /**
   * Callback invoked when the offset changes.
   */
  onChange: (offset: number | ((offset: number) => number)) => void;
}

/**
 * Changes the `inner` middleware's `offset` upon a `wheel` event to
 * expand the floating element's height, revealing more list items.
 * @see https://floating-ui.com/docs/inner
 * @deprecated
 */
export function useInnerOffset(
  context: FloatingRootContext,
  props: UseInnerOffsetProps,
): ElementProps {
  const {open, elements} = context;
  const {
    enabled = true,
    overflowRef,
    scrollRef,
    onChange: unstable_onChange,
  } = props;

  const onChange = unstable_onChange;
  const controlledScrollingRef = ref(false);
  const prevScrollTopRef = ref<number | null>(null);
  const initialOverflowRef = ref<SideObject | null>(null);

  // React 版 `useEffect`：[enabled, open, elements.floating, ...] → wheel 监听
  let cleanupWheel: (() => void) | undefined;
  watch(
    [open, elements.floating],
    () => {
      cleanupWheel?.();
      cleanupWheel = undefined;

      if (!enabled) return;

      const el = scrollRef?.value || elements.floating.value;

      if (!open.value || !el) {
        return;
      }

      function onWheel(e: WheelEvent) {
        if (e.ctrlKey || !el || overflowRef.value == null) {
          return;
        }

        const dY = e.deltaY;
        const isAtTop = overflowRef.value.top >= -0.5;
        const isAtBottom = overflowRef.value.bottom >= -0.5;
        const remainingScroll = el.scrollHeight - el.clientHeight;
        const sign = dY < 0 ? -1 : 1;
        const method = dY < 0 ? 'max' : 'min';

        if (el.scrollHeight <= el.clientHeight) {
          return;
        }

        if ((!isAtTop && dY > 0) || (!isAtBottom && dY < 0)) {
          e.preventDefault();
          // actview 无 flushSync：直接调用
          onChange((d) => d + Math[method](dY, remainingScroll * sign));
        } else if (/firefox/i.test(getUserAgent())) {
          // Needed to propagate scrolling during momentum scrolling phase once
          // it gets limited by the boundary. UX improvement, not critical.
          el.scrollTop += dY;
        }
      }

      el.addEventListener('wheel', onWheel);

      // Wait for the position to be ready.
      requestAnimationFrame(() => {
        prevScrollTopRef.value = el.scrollTop;

        if (overflowRef.value != null) {
          initialOverflowRef.value = {...overflowRef.value};
        }
      });

      cleanupWheel = () => {
        prevScrollTopRef.value = null;
        initialOverflowRef.value = null;
        el.removeEventListener('wheel', onWheel);
      };
    },
  );

  const floating: ElementProps['floating'] = {
    onKeyDown() {
      controlledScrollingRef.value = true;
    },
    onWheel() {
      controlledScrollingRef.value = false;
    },
    onPointerMove() {
      controlledScrollingRef.value = false;
    },
    onScroll() {
      const el = scrollRef?.value || elements.floating.value;

      if (!overflowRef.value || !el || !controlledScrollingRef.value) {
        return;
      }

      if (prevScrollTopRef.value !== null) {
        const scrollDiff = el.scrollTop - prevScrollTopRef.value;

        if (
          (overflowRef.value.bottom < -0.5 && scrollDiff < -1) ||
          (overflowRef.value.top < -0.5 && scrollDiff > 1)
        ) {
          // actview 无 flushSync：直接调用
          onChange((d) => d + scrollDiff);
        }
      }

      // [Firefox] Wait for the height change to have been applied.
      requestAnimationFrame(() => {
        prevScrollTopRef.value = el.scrollTop;
      });
    },
  };

  return enabled ? {floating} : {};
}
