import {computed, onUnmounted, ref, toValue, watch, type Ref} from '@actview/core';
import {isHTMLElement} from '@floating-ui/utils/dom';
import {
  activeElement,
  contains,
  createGridCellMap,
  findNonDisabledListIndex,
  getDeepestNode,
  getDocument,
  getFloatingFocusElement,
  getGridCellIndices,
  getGridCellIndexOfCorner,
  getGridNavigatedIndex,
  getMaxListIndex,
  getMinListIndex,
  isIndexOutOfListBounds,
  isListIndexDisabled,
  isTypeableCombobox,
  isVirtualClick,
  isVirtualPointerEvent,
  stopEvent,
  useEffectEvent,
  useLatestRef,
} from '@floating-ui/actview/utils';

import {
  useFloatingParentNodeId,
  useFloatingTree,
} from '../components/FloatingTree';
import type {Dimensions, ElementProps, FloatingRootContext} from '../types';
import {enqueueFocus} from '../utils/enqueueFocus';
import {warn} from '../utils/log';
import {
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
} from '../utils/constants';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - `React.useRef` → `ref()`；`React.useState` → `ref()`（activeId / virtualId）
 * - `useModernLayoutEffect` → `watch`（依赖追踪；previous* 状态同步放在
 *   最后注册的 watch，保持"读上次值"语义）
 * - `activeIndex` / `selectedIndex` 接受 `Ref<number | null> | number | null`，
 *   内部用 `toValue` 统一读取（传 Ref 时 watch 响应式同步）
 * - reference / floating 为 `computed`（响应式 aria 派生），mergeProps 用
 *   `unref` 解包；`floatingFocusElement` / `typeableComboboxReference` 也用
 *   computed（floating / domReference 挂载后才非空）
 * - `virtualItemRef` 为 `Ref<HTMLElement | null>`（.value）
 * - 无 React 合成事件：`event.nativeEvent` → 直接传 `event`；
 *   `event.currentTarget` 为 `EventTarget | null`（断言为 HTMLElement）
 * - `tree.nodesRef.current` → `.value`；`deepestNode.context.elements.*` → `.value`
 * - props 标量在 setup 解构固定
 */

export const ESCAPE = 'Escape';

function doSwitch(
  orientation: UseListNavigationProps['orientation'],
  vertical: boolean,
  horizontal: boolean,
) {
  switch (orientation) {
    case 'vertical':
      return vertical;
    case 'horizontal':
      return horizontal;
    default:
      return vertical || horizontal;
  }
}

function isMainOrientationKey(
  key: string,
  orientation: UseListNavigationProps['orientation'],
) {
  const vertical = key === ARROW_UP || key === ARROW_DOWN;
  const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal);
}

function isMainOrientationToEndKey(
  key: string,
  orientation: UseListNavigationProps['orientation'],
  rtl: boolean,
) {
  const vertical = key === ARROW_DOWN;
  const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  return (
    doSwitch(orientation, vertical, horizontal) ||
    key === 'Enter' ||
    key === ' ' ||
    key === ''
  );
}

function isCrossOrientationOpenKey(
  key: string,
  orientation: UseListNavigationProps['orientation'],
  rtl: boolean,
) {
  const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  const horizontal = key === ARROW_DOWN;
  return doSwitch(orientation, vertical, horizontal);
}

function isCrossOrientationCloseKey(
  key: string,
  orientation: UseListNavigationProps['orientation'],
  rtl: boolean,
  cols?: number,
) {
  const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
  const horizontal = key === ARROW_UP;
  if (
    orientation === 'both' ||
    (orientation === 'horizontal' && cols && cols > 1)
  ) {
    return key === ESCAPE;
  }
  return doSwitch(orientation, vertical, horizontal);
}

export interface UseListNavigationProps {
  /**
   * A ref that holds an array of list items.
   * @default empty list
   */
  listRef: Ref<Array<HTMLElement | null>>;
  /**
   * The index of the currently active (focused or highlighted) item, which may
   * or may not be selected.
   * @default null
   */
  activeIndex: Ref<number | null> | number | null;
  /**
   * A callback that is called when the user navigates to a new active item,
   * passed in a new `activeIndex`.
   */
  onNavigate?: ((activeIndex: number | null) => void) | undefined;
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: boolean | undefined;
  /**
   * The currently selected item index, which may or may not be active.
   * @default null
   */
  selectedIndex?: Ref<number | null> | number | null | undefined;
  /**
   * Whether to focus the item upon opening the floating element. 'auto' infers
   * what to do based on the input type (keyboard vs. pointer), while a boolean
   * value will force the value.
   * @default 'auto'
   */
  focusItemOnOpen?: boolean | 'auto' | undefined;
  /**
   * Whether hovering an item synchronizes the focus.
   * @default true
   */
  focusItemOnHover?: boolean | undefined;
  /**
   * Whether pressing an arrow key on the navigation’s main axis opens the
   * floating element.
   * @default true
   */
  openOnArrowKeyDown?: boolean | undefined;
  /**
   * By default elements with either a `disabled` or `aria-disabled` attribute
   * are skipped in the list navigation — however, this requires the items to
   * be rendered.
   * This prop allows you to manually specify indices which should be disabled,
   * overriding the default logic.
   * For Windows-style select menus, where the menu does not open when
   * navigating via arrow keys, specify an empty array.
   * @default undefined
   */
  disabledIndices?: Array<number> | ((index: number) => boolean) | undefined;
  /**
   * Determines whether focus can escape the list, such that nothing is selected
   * after navigating beyond the boundary of the list. In some
   * autocomplete/combobox components, this may be desired, as screen
   * readers will return to the input.
   * `loop` must be `true`.
   * @default false
   */
  allowEscape?: boolean | undefined;
  /**
   * Determines whether focus should loop around when navigating past the first
   * or last item.
   * @default false
   */
  loop?: boolean | undefined;
  /**
   * If the list is nested within another one (e.g. a nested submenu), the
   * navigation semantics change.
   * @default false
   */
  nested?: boolean | undefined;
  /**
   * Allows to specify the orientation of the parent list, which is used to
   * determine the direction of the navigation.
   * This is useful when list navigation is used within a Composite,
   * as the hook can't determine the orientation of the parent list automatically.
   */
  parentOrientation?: UseListNavigationProps['orientation'] | undefined;
  /**
   * Whether the direction of the floating element’s navigation is in RTL
   * layout.
   * @default false
   */
  rtl?: boolean | undefined;
  /**
   * Whether the focus is virtual (using `aria-activedescendant`).
   * Use this if you need focus to remain on the reference element
   * (such as an input), but allow arrow keys to navigate list items.
   * This is common in autocomplete listbox components.
   * Your virtually-focused list items must have a unique `id` set on them.
   * If you’re using a component role with the `useRole()` Hook, then an `id` is
   * generated automatically.
   * @default false
   */
  virtual?: boolean | undefined;
  /**
   * The orientation in which navigation occurs.
   * @default 'vertical'
   */
  orientation?: 'vertical' | 'horizontal' | 'both' | undefined;
  /**
   * Specifies how many columns the list has (i.e., it’s a grid). Use an
   * orientation of 'horizontal' (e.g. for an emoji picker/date picker, where
   * pressing ArrowRight or ArrowLeft can change rows), or 'both' (where the
   * current row cannot be escaped with ArrowRight or ArrowLeft, only ArrowUp
   * and ArrowDown).
   * @default 1
   */
  cols?: number | undefined;
  /**
   * Whether to scroll the active item into view when navigating. The default
   * value uses nearest options.
   */
  scrollItemIntoView?: boolean | ScrollIntoViewOptions | undefined;
  /**
   * When using virtual focus management, this holds a ref to the
   * virtually-focused item. This allows nested virtual navigation to be
   * enabled, and lets you know when a nested element is virtually focused from
   * the root reference handling the events. Requires `FloatingTree` to be
   * setup.
   */
  virtualItemRef?: Ref<HTMLElement | null> | undefined;
  /**
   * Only for `cols > 1`, specify sizes for grid items.
   * `{ width: 2, height: 2 }` means an item is 2 columns wide and 2 rows tall.
   */
  itemSizes?: Dimensions[] | undefined;
  /**
   * Only relevant for `cols > 1` and items with different sizes, specify if
   * the grid is dense (as defined in the CSS spec for `grid-auto-flow`).
   * @default false
   */
  dense?: boolean | undefined;
}

/**
 * Adds arrow key-based navigation of a list of items, either using real DOM
 * focus or virtual focus.
 * @see https://floating-ui.com/docs/useListNavigation
 */
export function useListNavigation(
  context: FloatingRootContext,
  props: UseListNavigationProps,
): ElementProps {
  const {open, onOpenChange, elements, floatingId} = context;
  const {
    listRef,
    activeIndex,
    onNavigate: unstable_onNavigate = () => {},
    enabled = true,
    selectedIndex = null,
    allowEscape = false,
    loop = false,
    nested = false,
    rtl = false,
    virtual = false,
    focusItemOnOpen = 'auto',
    focusItemOnHover = true,
    openOnArrowKeyDown = true,
    disabledIndices = undefined,
    orientation = 'vertical',
    parentOrientation,
    cols = 1,
    scrollItemIntoView = true,
    virtualItemRef,
    itemSizes,
    dense = false,
  } = props;

  if (__DEV__) {
    if (allowEscape) {
      if (!loop) {
        warn('`useListNavigation` looping must be enabled to allow escaping.');
      }

      if (!virtual) {
        warn('`useListNavigation` must be virtual to allow escaping.');
      }
    }

    if (orientation === 'vertical' && cols > 1) {
      warn(
        'In grid list navigation mode (`cols` > 1), the `orientation` should',
        'be either "horizontal" or "both".',
      );
    }
  }

  const floatingFocusElement = computed(() =>
    getFloatingFocusElement(elements.floating.value),
  );
  const floatingFocusElementRef = floatingFocusElement;

  const parentId = useFloatingParentNodeId();
  const tree = useFloatingTree();

  // React 版 `useModernLayoutEffect`：[context, orientation] → 记录 orientation
  context.dataRef.value.orientation = orientation;

  const onNavigate = useEffectEvent(() => {
    unstable_onNavigate(indexRef.value === -1 ? null : indexRef.value);
  });

  const typeableComboboxReference = computed(() =>
    isTypeableCombobox(elements.domReference.value),
  );

  const focusItemOnOpenRef = ref(focusItemOnOpen);
  const indexRef = ref(toValue(selectedIndex) ?? -1);
  const keyRef = ref<null | string>(null);
  const isPointerModalityRef = ref(true);
  const previousOnNavigateRef = ref(onNavigate);
  const previousMountedRef = ref(!!elements.floating.value);
  const previousOpenRef = ref(open.value);
  const forceSyncFocusRef = ref(false);
  const forceScrollIntoViewRef = ref(false);

  const disabledIndicesRef = useLatestRef(disabledIndices);
  const scrollItemIntoViewRef = useLatestRef(scrollItemIntoView);
  const selectedIndexRef = computed(() => toValue(selectedIndex));

  const activeId = ref<string | undefined>(undefined);
  const virtualId = ref<string | undefined>(undefined);

  const focusItem = useEffectEvent(() => {
    function runFocus(item: HTMLElement) {
      if (virtual) {
        if (item.id?.endsWith('-fui-option')) {
          item.id = `${floatingId.value}-${Math.random().toString(16).slice(2, 10)}`;
        }
        activeId.value = item.id;
        tree?.events.emit('virtualfocus', item);
        if (virtualItemRef) {
          virtualItemRef.value = item;
        }
      } else {
        enqueueFocus(item, {
          sync: forceSyncFocusRef.value,
          preventScroll: true,
        });
      }
    }

    const initialItem = listRef.value[indexRef.value];
    const forceScrollIntoView = forceScrollIntoViewRef.value;

    if (initialItem) {
      runFocus(initialItem);
    }

    const scheduler = forceSyncFocusRef.value
      ? (v: () => void) => v()
      : requestAnimationFrame;

    scheduler(() => {
      const waitedItem = listRef.value[indexRef.value] || initialItem;

      if (!waitedItem) return;

      if (!initialItem) {
        runFocus(waitedItem);
      }

      const scrollIntoViewOptions = scrollItemIntoViewRef.value;
      const shouldScrollIntoView =
        scrollIntoViewOptions &&
        item &&
        (forceScrollIntoView || !isPointerModalityRef.value);

      if (shouldScrollIntoView) {
        // JSDOM doesn't support `.scrollIntoView()` but it's widely supported
        // by all browsers.
        waitedItem.scrollIntoView?.(
          typeof scrollIntoViewOptions === 'boolean'
            ? {block: 'nearest', inline: 'nearest'}
            : scrollIntoViewOptions,
        );
      }
    });
  });

  // React 版 `useModernLayoutEffect`：打开时同步 selectedIndex，关闭时重置
  watch(
    () => [open.value, elements.floating.value, toValue(selectedIndex)],
    () => {
      if (!enabled) return;

      if (open.value && elements.floating.value) {
        if (focusItemOnOpenRef.value && toValue(selectedIndex) != null) {
          // Regardless of the pointer modality, we want to ensure the selected
          // item comes into view when the floating element is opened.
          forceScrollIntoViewRef.value = true;
          indexRef.value = toValue(selectedIndex) as number;
          onNavigate();
        }
      } else if (previousMountedRef.value) {
        // Since the user can specify `onNavigate` conditionally
        // (onNavigate: open ? setActiveIndex : setSelectedIndex),
        // we store and call the previous function.
        indexRef.value = -1;
        previousOnNavigateRef.value();
      }
    },
  );

  // React 版 `useModernLayoutEffect`：打开时同步 activeIndex 到焦点项
  watch(
    () => [open.value, elements.floating.value, toValue(activeIndex)],
    () => {
      if (!enabled) return;
      if (!open.value) return;
      if (!elements.floating.value) return;

      const activeIndexValue = toValue(activeIndex);

      if (activeIndexValue == null) {
        forceSyncFocusRef.value = false;

        if (selectedIndexRef.value != null) {
          return;
        }

        // Reset while the floating element was open (e.g. the list changed).
        if (previousMountedRef.value) {
          indexRef.value = -1;
          focusItem();
        }

        // Initial sync.
        if (
          (!previousOpenRef.value || !previousMountedRef.value) &&
          focusItemOnOpenRef.value &&
          (keyRef.value != null ||
            (focusItemOnOpenRef.value === true && keyRef.value == null))
        ) {
          let runs = 0;
          const waitForListPopulated = () => {
            if (listRef.value[0] == null) {
              // Avoid letting the browser paint if possible on the first try,
              // otherwise use rAF. Don't try more than twice, since something
              // is wrong otherwise.
              if (runs < 2) {
                const scheduler = runs
                  ? requestAnimationFrame
                  : queueMicrotask;
                scheduler(waitForListPopulated);
              }
              runs++;
            } else {
              indexRef.value =
                keyRef.value == null ||
                isMainOrientationToEndKey(keyRef.value, orientation, rtl) ||
                nested
                  ? getMinListIndex(listRef, disabledIndicesRef.value)
                  : getMaxListIndex(listRef, disabledIndicesRef.value);
              keyRef.value = null;
              onNavigate();
            }
          };

          waitForListPopulated();
        }
      } else if (!isIndexOutOfListBounds(listRef, activeIndexValue)) {
        indexRef.value = activeIndexValue;
        focusItem();
        forceScrollIntoViewRef.value = false;
      }
    },
  );

  // Ensure the parent floating element has focus when a nested child closes
  // to allow arrow key navigation to work after the pointer leaves the child.
  watch([elements.floating, open], () => {
    if (
      !enabled ||
      elements.floating.value ||
      !tree ||
      virtual ||
      !previousMountedRef.value
    ) {
      return;
    }

    const nodes = tree.nodesRef.value;
    const parent = nodes
      .find((node) => node.id === parentId)
      ?.context?.elements.floating;
    const activeEl = activeElement(getDocument(elements.floating.value));
    const treeContainsActiveEl = nodes.some(
      (node) =>
        node.context &&
        contains(node.context.elements.floating.value, activeEl),
    );

    if (parent?.value && !treeContainsActiveEl && isPointerModalityRef.value) {
      parent.value.focus({preventScroll: true});
    }
  });

  // React 版 `useModernLayoutEffect`：根虚拟导航监听 virtualfocus 事件
  if (enabled && tree && virtual && !parentId) {
    function handleVirtualFocus(item: HTMLElement) {
      virtualId.value = item.id;

      if (virtualItemRef) {
        virtualItemRef.value = item;
      }
    }

    tree.events.on('virtualfocus', handleVirtualFocus);
    onUnmounted(() => {
      tree.events.off('virtualfocus', handleVirtualFocus);
    });
  }

  // React 版（无依赖 layout effect，最后执行）：previous* 状态同步——
  // 保持"读上次渲染值"语义（此 watch 注册在依赖它的 watch 之后）
  watch(
    [open, elements.floating],
    () => {
      previousOnNavigateRef.value = onNavigate;
      previousOpenRef.value = open.value;
      previousMountedRef.value = !!elements.floating.value;
    },
    {immediate: true},
  );

  // React 版 `useModernLayoutEffect`：[open, focusItemOnOpen] → 关闭时重置
  watch(open, () => {
    if (!open.value) {
      keyRef.value = null;
      focusItemOnOpenRef.value = focusItemOnOpen;
    }
  });

  const hasActiveIndex = computed(() => toValue(activeIndex) != null);

  const item: ElementProps['item'] = {
    onFocus(event: FocusEvent) {
      forceSyncFocusRef.value = true;
      syncCurrentTarget(event.currentTarget as HTMLElement | null);
    },
    onClick(event: MouseEvent) {
      // Safari
      (event.currentTarget as HTMLElement | null)?.focus({
        preventScroll: true,
      });
    },
    onMouseMove(event: MouseEvent) {
      forceSyncFocusRef.value = true;
      forceScrollIntoViewRef.value = false;
      if (focusItemOnHover) {
        syncCurrentTarget(event.currentTarget as HTMLElement | null);
      }
    },
    onPointerLeave(event: PointerEvent) {
      if (!isPointerModalityRef.value || event.pointerType === 'touch') {
        return;
      }

      forceSyncFocusRef.value = true;

      if (!focusItemOnHover) {
        return;
      }

      indexRef.value = -1;
      onNavigate();

      if (!virtual) {
        floatingFocusElementRef.value?.focus({preventScroll: true});
      }
    },
  };

  function syncCurrentTarget(currentTarget: HTMLElement | null) {
    if (!open.value) return;
    const index = listRef.value.indexOf(currentTarget);
    if (index !== -1 && indexRef.value !== index) {
      indexRef.value = index;
      onNavigate();
    }
  }

  const getParentOrientation = () => {
    return (
      parentOrientation ??
      (tree?.nodesRef.value.find((node) => node.id === parentId)?.context
        ?.dataRef?.value.orientation as UseListNavigationProps['orientation'])
    );
  };

  const commonOnKeyDown = useEffectEvent((event: KeyboardEvent) => {
    isPointerModalityRef.value = false;
    forceSyncFocusRef.value = true;

    // When composing a character, Chrome fires ArrowDown twice. Firefox/Safari
    // don't appear to suffer from this. `event.isComposing` is avoided due to
    // Safari not supporting it properly (although it's not needed in the first
    // place for Safari, just avoiding any possible issues).
    if (event.which === 229) {
      return;
    }

    // If the floating element is animating out, ignore navigation. Otherwise,
    // the `activeIndex` gets set to 0 despite not being open so the next time
    // the user ArrowDowns, the first item won't be focused.
    if (
      !open.value &&
      event.currentTarget === floatingFocusElementRef.value
    ) {
      return;
    }

    if (
      nested &&
      isCrossOrientationCloseKey(event.key, orientation, rtl, cols)
    ) {
      // If the nested list's close key is also the parent navigation key,
      // let the parent navigate. Otherwise, stop propagating the event.
      if (!isMainOrientationKey(event.key, getParentOrientation())) {
        stopEvent(event);
      }

      // actview 无合成事件：event 即原生事件
      onOpenChange(false, event, 'list-navigation');

      if (isHTMLElement(elements.domReference.value)) {
        if (virtual) {
          tree?.events.emit('virtualfocus', elements.domReference.value);
        } else {
          elements.domReference.value.focus();
        }
      }

      return;
    }

    const currentIndex = indexRef.value;
    const minIndex = getMinListIndex(listRef, disabledIndices);
    const maxIndex = getMaxListIndex(listRef, disabledIndices);

    if (!typeableComboboxReference.value) {
      if (event.key === 'Home') {
        stopEvent(event);
        indexRef.value = minIndex;
        onNavigate();
      }

      if (event.key === 'End') {
        stopEvent(event);
        indexRef.value = maxIndex;
        onNavigate();
      }
    }

    // Grid navigation.
    if (cols > 1) {
      const sizes =
        itemSizes ||
        Array.from({length: listRef.value.length}, () => ({
          width: 1,
          height: 1,
        }));
      // To calculate movements on the grid, we use hypothetical cell indices
      // as if every item was 1x1, then convert back to real indices.
      const cellMap = createGridCellMap(sizes, cols, dense);
      const minGridIndex = cellMap.findIndex(
        (index) =>
          index != null &&
          !isListIndexDisabled(listRef, index, disabledIndices),
      );
      // last enabled index
      const maxGridIndex = cellMap.reduce(
        (foundIndex: number, index, cellIndex) =>
          index != null && !isListIndexDisabled(listRef, index, disabledIndices)
            ? cellIndex
            : foundIndex,
        -1,
      );

      const index =
        cellMap[
          getGridNavigatedIndex(
            ref(
              cellMap.map((itemIndex) =>
                itemIndex != null ? listRef.value[itemIndex] : null,
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
                    listRef.value.map((_, index) =>
                      isListIndexDisabled(listRef, index, disabledIndices)
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
                indexRef.value > maxIndex ? minIndex : indexRef.value,
                sizes,
                cellMap,
                cols,
                // use a corner matching the edge closest to the direction
                // we're moving in so we don't end up in the same item. Prefer
                // top/left over bottom/right.
                event.key === ARROW_DOWN
                  ? 'bl'
                  : event.key === (rtl ? ARROW_LEFT : ARROW_RIGHT)
                    ? 'tr'
                    : 'tl',
              ),
              stopEvent: true,
            },
          )
        ];

      if (index != null) {
        indexRef.value = index;
        onNavigate();
      }

      if (orientation === 'both') {
        return;
      }
    }

    if (isMainOrientationKey(event.key, orientation)) {
      stopEvent(event);

      // Reset the index if no item is focused.
      if (
        open.value &&
        !virtual &&
        activeElement(
          (event.currentTarget as HTMLElement | null)?.ownerDocument ??
            document,
        ) === event.currentTarget
      ) {
        indexRef.value = isMainOrientationToEndKey(
          event.key,
          orientation,
          rtl,
        )
          ? minIndex
          : maxIndex;
        onNavigate();
        return;
      }

      if (isMainOrientationToEndKey(event.key, orientation, rtl)) {
        if (loop) {
          indexRef.value =
            currentIndex >= maxIndex
              ? allowEscape && currentIndex !== listRef.value.length
                ? -1
                : minIndex
              : findNonDisabledListIndex(listRef, {
                  startingIndex: currentIndex,
                  disabledIndices,
                });
        } else {
          indexRef.value = Math.min(
            maxIndex,
            findNonDisabledListIndex(listRef, {
              startingIndex: currentIndex,
              disabledIndices,
            }),
          );
        }
      } else {
        if (loop) {
          indexRef.value =
            currentIndex <= minIndex
              ? allowEscape && currentIndex !== -1
                ? listRef.value.length
                : maxIndex
              : findNonDisabledListIndex(listRef, {
                  startingIndex: currentIndex,
                  decrement: true,
                  disabledIndices,
                });
        } else {
          indexRef.value = Math.max(
            minIndex,
            findNonDisabledListIndex(listRef, {
              startingIndex: currentIndex,
              decrement: true,
              disabledIndices,
            }),
          );
        }
      }

      if (isIndexOutOfListBounds(listRef, indexRef.value)) {
        indexRef.value = -1;
      }

      onNavigate();
    }
  });

  const ariaActiveDescendantProp = computed(() => {
    return (
      virtual &&
      open.value &&
      hasActiveIndex.value && {
        'aria-activedescendant': virtualId.value || activeId.value,
      }
    );
  });

  const floating: ElementProps['floating'] = computed(() => {
    return {
      'aria-orientation': orientation === 'both' ? undefined : orientation,
      ...(!typeableComboboxReference.value
        ? ariaActiveDescendantProp.value
        : {}),
      onKeyDown: commonOnKeyDown,
      onPointerMove() {
        isPointerModalityRef.value = true;
      },
    };
  });

  const reference: ElementProps['reference'] = computed(() => {
    function checkVirtualMouse(event: MouseEvent) {
      if (focusItemOnOpen === 'auto' && isVirtualClick(event)) {
        focusItemOnOpenRef.value = true;
      }
    }

    function checkVirtualPointer(event: PointerEvent) {
      // `pointerdown` fires first, reset the state then perform the checks.
      focusItemOnOpenRef.value = focusItemOnOpen;
      if (focusItemOnOpen === 'auto' && isVirtualPointerEvent(event)) {
        focusItemOnOpenRef.value = true;
      }
    }

    return {
      ...(ariaActiveDescendantProp.value as Record<string, unknown>),
      onKeyDown(event: KeyboardEvent) {
        isPointerModalityRef.value = false;

        const isArrowKey = event.key.startsWith('Arrow');
        const isHomeOrEndKey = ['Home', 'End'].includes(event.key);
        const isMoveKey = isArrowKey || isHomeOrEndKey;
        const isCrossOpenKey = isCrossOrientationOpenKey(
          event.key,
          orientation,
          rtl,
        );
        const isCrossCloseKey = isCrossOrientationCloseKey(
          event.key,
          orientation,
          rtl,
          cols,
        );
        const isParentCrossOpenKey = isCrossOrientationOpenKey(
          event.key,
          getParentOrientation(),
          rtl,
        );
        const isMainKey = isMainOrientationKey(event.key, orientation);
        const isNavigationKey =
          (nested ? isParentCrossOpenKey : isMainKey) ||
          event.key === 'Enter' ||
          event.key.trim() === '';

        if (virtual && open.value) {
          const rootNode = tree?.nodesRef.value.find(
            (node) => node.parentId == null,
          );
          const deepestNode =
            tree && rootNode
              ? getDeepestNode(tree.nodesRef.value, rootNode.id)
              : null;

          if (isMoveKey && deepestNode && virtualItemRef) {
            const eventObject = new KeyboardEvent('keydown', {
              key: event.key,
              bubbles: true,
            });

            if (isCrossOpenKey || isCrossCloseKey) {
              const isCurrentTarget =
                deepestNode.context?.elements.domReference.value ===
                event.currentTarget;
              const dispatchItem =
                isCrossCloseKey && !isCurrentTarget
                  ? deepestNode.context?.elements.domReference.value
                  : isCrossOpenKey
                    ? listRef.value.find((item) => item?.id === activeId.value)
                    : null;

              if (dispatchItem) {
                stopEvent(event);
                dispatchItem.dispatchEvent(eventObject);
                virtualId.value = undefined;
              }
            }

            if ((isMainKey || isHomeOrEndKey) && deepestNode.context) {
              if (
                deepestNode.context.open.value &&
                deepestNode.parentId &&
                event.currentTarget !==
                  deepestNode.context.elements.domReference.value
              ) {
                stopEvent(event);
                deepestNode.context.elements.domReference.value?.dispatchEvent(
                  eventObject,
                );
                return;
              }
            }
          }

          return commonOnKeyDown(event);
        }
        // If a floating element should not open on arrow key down, avoid
        // setting `activeIndex` while it's closed.
        if (!open.value && !openOnArrowKeyDown && isArrowKey) {
          return;
        }

        if (isNavigationKey) {
          const isParentMainKey = isMainOrientationKey(
            event.key,
            getParentOrientation(),
          );
          keyRef.value = nested && isParentMainKey ? null : event.key;
        }

        if (nested) {
          if (isParentCrossOpenKey) {
            stopEvent(event);

            if (open.value) {
              indexRef.value = getMinListIndex(
                listRef,
                disabledIndicesRef.value,
              );
              onNavigate();
            } else {
              // actview 无合成事件：event 即原生事件
              onOpenChange(true, event, 'list-navigation');
            }
          }

          return;
        }

        if (isMainKey) {
          if (toValue(selectedIndex) != null) {
            indexRef.value = toValue(selectedIndex) as number;
          }

          stopEvent(event);

          if (!open.value && openOnArrowKeyDown) {
            onOpenChange(true, event, 'list-navigation');
          } else {
            commonOnKeyDown(event);
          }

          if (open.value) {
            onNavigate();
          }
        }
      },
      onFocus() {
        if (open.value && !virtual) {
          indexRef.value = -1;
          onNavigate();
        }
      },
      onPointerDown: checkVirtualPointer,
      onPointerEnter: checkVirtualPointer,
      onMouseDown: checkVirtualMouse,
      onClick: checkVirtualMouse,
    };
  });

  return enabled ? {reference, floating, item} : {};
}
