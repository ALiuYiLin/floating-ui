import {computed, createContext, defineComponent, ref, type Ref} from '@actview/core';
import {
  createGridCellMap,
  findNonDisabledListIndex,
  getGridCellIndices,
  getGridCellIndexOfCorner,
  getGridNavigatedIndex,
  getMaxListIndex,
  getMinListIndex,
  isIndexOutOfListBounds,
  isListIndexDisabled,
} from '../utils';

import {useMergeRefs} from '../hooks/useMergeRefs';
import type {Dimensions} from '../types';
import {FloatingList, useListItem} from './FloatingList';
import {
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
} from '../utils/constants';

/**
 * actview 版（upstream 为 React 组件）。
 *
 * 与 upstream 的差异：
 * - `React.forwardRef` → `defineComponent`（`ref` 作为 prop 透传）
 * - `React.useState` → `ref()`；`activeIndex` 为 `computed`
 *   （`props.activeIndex` 响应式读取，未受控时用内部 ref）
 * - `onNavigate` 为普通函数（闭包读 `props.onNavigate`）
 * - `render` prop 的元素形态用 VNode props 合并实现 `cloneElement` 语义
 *   （actview VNode 的 `ref` 为独立字段，需单独合并）
 * - `useEffectEvent` 不再需要（props 响应式读取即最新）
 * - 无 React 合成事件：`event: KeyboardEvent`；`elementsRef.value`（.value）
 */

// Method syntax keeps callback parameters bivariant, but expressing the
// explicit `| undefined` required by `exactOptionalPropertyTypes` needs
// property syntax, which is contravariant under `strictFunctionTypes`.
// Extracting the function from a method position restores that bivariance so
// consumers can still assign callbacks with narrower parameter types.
type BivariantCallback<T extends (...args: any[]) => any> = {
  bivariance(...args: Parameters<T>): ReturnType<T>;
}['bivariance'];

function renderJsx(
  render: RenderProp | undefined,
  computedProps: Record<string, unknown>,
) {
  if (typeof render === 'function') {
    return render(computedProps);
  }
  if (render) {
    // cloneElement 语义：props 合并（computedProps 覆盖），ref 单独处理
    const {ref: computedRef, ...restProps} = computedProps;
    return {
      ...render,
      ref: computedRef ?? render.ref,
      props: {...render.props, ...restProps},
    };
  }
  return <div {...computedProps} />;
}

interface CompositeContextValue {
  activeIndex: number;
  onNavigate(index: number): void;
}

const CompositeContext = createContext<CompositeContextValue>({
  activeIndex: 0,
  onNavigate: () => {},
});

type RenderProp =
  | any // VNode（actview 元素）
  | ((props: Record<string, unknown>) => any);

export interface CompositeProps {
  /**
   * Determines the element to render.
   * @example
   * ```jsx
   * <Composite render={<ul />} />
   * <Composite render={(htmlProps) => <ul {...htmlProps} />} />
   * ```
   */
  render?: RenderProp | undefined;
  /**
   * Determines the orientation of the composite.
   */
  orientation?: 'horizontal' | 'vertical' | 'both' | undefined;
  /**
   * Determines whether focus should loop around when navigating past the first
   * or last item.
   */
  loop?: boolean | undefined;
  /**
   * Whether the direction of the composite’s navigation is in RTL layout.
   */
  rtl?: boolean | undefined;
  /**
   * Determines the number of columns there are in the composite
   * (i.e. it’s a grid).
   */
  cols?: number | undefined;
  /**
   * Determines which items are disabled. The `disabled` or `aria-disabled`
   * attributes are used by default.
   */
  disabledIndices?: number[] | ((index: number) => boolean) | undefined;
  /**
   * Determines which item is active. Used to externally control the active
   * item.
   */
  activeIndex?: number | undefined;
  /**
   * Called when the user navigates to a new item. Used to externally control
   * the active item.
   */
  onNavigate?: BivariantCallback<(index: number) => void> | undefined;
  /**
   * Only for `cols > 1`, specify sizes for grid items.
   * `{ width: 2, height: 2 }` means an item is 2 columns wide and 2 rows tall.
   */
  itemSizes?: Dimensions[] | undefined;
  /**
   * Only relevant for `cols > 1` and items with different sizes, specify if
   * the grid is dense (as defined in the CSS spec for grid-auto-flow).
   */
  dense?: boolean | undefined;
  ref?:
    | Ref<HTMLElement | null>
    | ((el: HTMLElement | null) => void)
    | undefined;
  [key: string]: unknown;
}

const horizontalKeys = [ARROW_LEFT, ARROW_RIGHT];
const verticalKeys = [ARROW_UP, ARROW_DOWN];
const allKeys = [...horizontalKeys, ...verticalKeys];

/**
 * Creates a single tab stop whose items are navigated by arrow keys, which
 * provides list navigation outside of floating element contexts.
 *
 * This is useful to enable navigation of a list of items that aren’t part of a
 * floating element. A menubar is an example of a composite, with each reference
 * element being an item.
 * @see https://floating-ui.com/docs/Composite
 */
export const Composite = defineComponent(function (props: CompositeProps) {
  const internalActiveIndex = ref(0);
  const activeIndex = computed(() =>
    props.activeIndex ?? internalActiveIndex.value,
  );

  const onNavigate = (index: number) => {
    if (props.onNavigate) {
      props.onNavigate(index);
    } else {
      internalActiveIndex.value = index;
    }
  };

  const elementsRef = ref<Array<HTMLDivElement | null>>([]);

  const contextValue = computed<CompositeContextValue>(() => ({
    activeIndex: activeIndex.value,
    onNavigate,
  }));

  return () => {
    const {
      render,
      orientation = 'both',
      loop = true,
      rtl = false,
      cols = 1,
      disabledIndices,
      itemSizes,
      dense = false,
      ref: refProp,
      ...domProps
    } = props;

    const renderElementProps =
      render && typeof render !== 'function' ? render.props : {};
    const isGrid = cols > 1;

    function handleKeyDown(event: KeyboardEvent) {
      if (!allKeys.includes(event.key)) return;

      let nextIndex = activeIndex.value;
      const minIndex = getMinListIndex(elementsRef, disabledIndices);
      const maxIndex = getMaxListIndex(elementsRef, disabledIndices);

      const horizontalEndKey = rtl ? ARROW_LEFT : ARROW_RIGHT;
      const horizontalStartKey = rtl ? ARROW_RIGHT : ARROW_LEFT;

      if (isGrid) {
        const sizes =
          itemSizes ||
          Array.from({length: elementsRef.value.length}, () => ({
            width: 1,
            height: 1,
          }));
        // To calculate movements on the grid, we use hypothetical cell indices
        // as if every item was 1x1, then convert back to real indices.
        const cellMap = createGridCellMap(sizes, cols, dense);
        const minGridIndex = cellMap.findIndex(
          (index) =>
            index != null &&
            !isListIndexDisabled(elementsRef, index, disabledIndices),
        );
        // last enabled index
        const maxGridIndex = cellMap.reduce(
          (foundIndex: number, index, cellIndex) =>
            index != null &&
            !isListIndexDisabled(elementsRef, index, disabledIndices)
              ? cellIndex
              : foundIndex,
          -1,
        );

        const maybeNextIndex =
          cellMap[
            getGridNavigatedIndex(
              ref(
                cellMap.map((itemIndex) =>
                  itemIndex ? elementsRef.value[itemIndex] : null,
                ),
              ),
              {
                event,
                orientation,
                loop,
                rtl,
                cols,
                // treat undefined (empty grid spaces) as disabled indices so we
                // don't end up in them
                disabledIndices: getGridCellIndices(
                  [
                    ...((typeof disabledIndices !== 'function'
                      ? disabledIndices
                      : null) ||
                      elementsRef.value.map((_, index) =>
                        isListIndexDisabled(
                          elementsRef,
                          index,
                          disabledIndices,
                        )
                          ? index
                          : undefined,
                      )),
                    undefined,
                  ],
                  cellMap,
                ),
                minIndex: minGridIndex,
                maxIndex: maxGridIndex,
                prevIndex: getGridCellIndexOfCorner(
                  activeIndex.value > maxIndex
                    ? minIndex
                    : activeIndex.value,
                  sizes,
                  cellMap,
                  cols,
                  // use a corner matching the edge closest to the direction
                  // we're moving in so we don't end up in the same item.
                  // Prefer top/left over bottom/right.
                  event.key === ARROW_DOWN
                    ? 'bl'
                    : event.key === horizontalEndKey
                      ? 'tr'
                      : 'tl',
                ),
              },
            )
          ];

        if (maybeNextIndex != null) {
          nextIndex = maybeNextIndex;
        }
      }

      const toEndKeys = {
        horizontal: [horizontalEndKey],
        vertical: [ARROW_DOWN],
        both: [horizontalEndKey, ARROW_DOWN],
      }[orientation];

      const toStartKeys = {
        horizontal: [horizontalStartKey],
        vertical: [ARROW_UP],
        both: [horizontalStartKey, ARROW_UP],
      }[orientation];

      const preventedKeys = isGrid
        ? allKeys
        : {
            horizontal: horizontalKeys,
            vertical: verticalKeys,
            both: allKeys,
          }[orientation];

      if (
        nextIndex === activeIndex.value &&
        [...toEndKeys, ...toStartKeys].includes(event.key)
      ) {
        if (loop && nextIndex === maxIndex && toEndKeys.includes(event.key)) {
          nextIndex = minIndex;
        } else if (
          loop &&
          nextIndex === minIndex &&
          toStartKeys.includes(event.key)
        ) {
          nextIndex = maxIndex;
        } else {
          nextIndex = findNonDisabledListIndex(elementsRef, {
            startingIndex: nextIndex,
            decrement: toStartKeys.includes(event.key),
            disabledIndices,
          });
        }
      }

      if (
        nextIndex !== activeIndex.value &&
        !isIndexOutOfListBounds(elementsRef, nextIndex)
      ) {
        event.stopPropagation();

        if (preventedKeys.includes(event.key)) {
          event.preventDefault();
        }

        onNavigate(nextIndex);
        elementsRef.value[nextIndex]?.focus();
      }
    }

    const computedProps: Record<string, unknown> = {
      ...domProps,
      ...renderElementProps,
      ref: refProp,
      'aria-orientation': orientation === 'both' ? undefined : orientation,
      onKeyDown(e: KeyboardEvent) {
        (domProps.onKeyDown as ((e: KeyboardEvent) => void) | undefined)?.(e);
        (renderElementProps.onKeyDown as
          | ((e: KeyboardEvent) => void)
          | undefined)?.(e);
        handleKeyDown(e);
      },
    };

    return (
      <CompositeContext.Provider value={contextValue.value}>
        <FloatingList elementsRef={elementsRef}>
          {renderJsx(render, computedProps)}
        </FloatingList>
      </CompositeContext.Provider>
    );
  };
});

export interface CompositeItemProps {
  /**
   * Determines the element to render.
   * @example
   * ```jsx
   * <CompositeItem render={<li />} />
   * <CompositeItem render={(htmlProps) => <li {...htmlProps} />} />
   * ```
   */
  render?: RenderProp | undefined;
  ref?:
    | Ref<HTMLElement | null>
    | ((el: HTMLElement | null) => void)
    | undefined;
  [key: string]: unknown;
}

/**
 * @see https://floating-ui.com/docs/Composite
 */
export const CompositeItem = defineComponent(function (
  props: CompositeItemProps,
) {
  const compositeContext = CompositeContext.use();

  const {ref: itemRef, index} = useListItem();
  const mergedRef = useMergeRefs([itemRef, props.ref, renderElementRef()]);
  const isActive = computed(
    () => compositeContext.value.activeIndex === index.value,
  );

  function renderElementRef() {
    const r = props.render;
    return r && typeof r !== 'function' ? r.props.ref : undefined;
  }

  return () => {
    const {render, ...domProps} = props;
    const renderElementProps =
      render && typeof render !== 'function' ? render.props : {};

    const computedProps: Record<string, unknown> = {
      ...domProps,
      ...renderElementProps,
      ref: mergedRef,
      tabIndex: isActive.value ? 0 : -1,
      'data-active': isActive.value ? '' : undefined,
      onFocus(e: FocusEvent) {
        (domProps.onFocus as ((e: FocusEvent) => void) | undefined)?.(e);
        (renderElementProps.onFocus as
          | ((e: FocusEvent) => void)
          | undefined)?.(e);
        compositeContext.value.onNavigate(index.value);
      },
    };

    return renderJsx(render, computedProps);
  };
});
