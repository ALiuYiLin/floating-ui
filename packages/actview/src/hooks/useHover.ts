import {onUnmounted, ref, watch} from '@actview/core';
import {isElement} from '@floating-ui/utils/dom';
import {
  contains,
  getDocument,
  isMouseLikePointerType,
  useLatestRef,
  useEffectEvent,
} from '../utils';

import {
  useFloatingParentNodeId,
  useFloatingTree,
} from '../components/FloatingTree';
import type {
  Delay,
  ElementProps,
  FloatingContext,
  FloatingRootContext,
  FloatingTreeType,
  OpenChangeReason,
  SafePolygonOptions,
} from '../types';
import {createAttribute} from '../utils/createAttribute';
import {clearTimeoutIfSet} from '../utils/clearTimeoutIfSet';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - `React.useRef` → `ref()`；`useModernLayoutEffect` / `React.useEffect` →
 *   `watch`（依赖追踪 + immediate）+ 手动 cleanup + `onUnmounted`
 * - `openRef` 省略：open 本身为 `Ref<boolean>`，闭包直接读 `.value` 即最新
 * - `React.useCallback` → 普通函数（闭包读 Ref）
 * - 无 React 合成事件：`{nativeEvent}` → 直接使用事件
 * - `dataRef.current` → `dataRef.value`；`elements.*` → `.value`；
 *   `tree?.nodesRef.current` → `.value`；`parentFloating` 为 Ref → `.value`
 * - props 标量（enabled / mouseOnly / move）在 setup 解构固定
 */

const safePolygonIdentifier = createAttribute('safe-polygon');

export interface HandleCloseContext
  extends Omit<FloatingContext, 'x' | 'y'> {
  onClose: () => void;
  tree?: FloatingTreeType | null | undefined;
  leave?: boolean | undefined;
  x: number;
  y: number;
}

export interface HandleClose {
  (context: HandleCloseContext): (event: MouseEvent) => void;
  __options?: SafePolygonOptions | undefined;
}

export function getDelay(
  value: UseHoverProps['delay'],
  prop: 'open' | 'close',
  pointerType?: PointerEvent['pointerType'],
) {
  if (pointerType && !isMouseLikePointerType(pointerType)) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'function') {
    const result = value();
    if (typeof result === 'number') {
      return result;
    }
    return result?.[prop];
  }

  return value?.[prop];
}

function getRestMs(value: number | (() => number)) {
  if (typeof value === 'function') {
    return value();
  }
  return value;
}

export interface UseHoverProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: boolean | undefined;
  /**
   * Accepts an event handler that runs on `mousemove` to control when the
   * floating element closes once the cursor leaves the reference element.
   * @default null
   */
  handleClose?: HandleClose | null | undefined;
  /**
   * Waits until the user’s cursor is at “rest” over the reference element
   * before changing the `open` state.
   * @default 0
   */
  restMs?: number | (() => number) | undefined;
  /**
   * Waits for the specified time when the event listener runs before changing
   * the `open` state.
   * @default 0
   */
  delay?: Delay | (() => Delay) | undefined;
  /**
   * Whether the logic only runs for mouse input, ignoring touch input.
   * Note: due to a bug with Linux Chrome, "pen" inputs are considered "mouse".
   * @default false
   */
  mouseOnly?: boolean | undefined;
  /**
   * Whether moving the cursor over the floating element will open it, without a
   * regular hover event required.
   * @default true
   */
  move?: boolean | undefined;
}

/**
 * Opens the floating element while hovering over the reference element, like
 * CSS `:hover`.
 * @see https://floating-ui.com/docs/useHover
 */
export function useHover(
  context: FloatingRootContext,
  props: UseHoverProps = {},
): ElementProps {
  const {open, onOpenChange, dataRef, events, elements} = context;
  const {
    enabled = true,
    delay = 0,
    handleClose = null,
    mouseOnly = false,
    restMs = 0,
    move = true,
  } = props;

  const tree = useFloatingTree();
  const parentId = useFloatingParentNodeId();
  const handleCloseRef = useLatestRef(handleClose);
  const delayRef = useLatestRef(delay);
  const restMsRef = useLatestRef(restMs);

  const pointerTypeRef = ref<string | undefined>(undefined);
  const timeoutRef = ref(-1);
  const handlerRef = ref<((event: MouseEvent) => void) | undefined>(undefined);
  const restTimeoutRef = ref(-1);
  const blockMouseMoveRef = ref(true);
  const performedPointerEventsMutationRef = ref(false);
  const unbindMouseMoveRef = ref(() => {});
  const restTimeoutPendingRef = ref(false);

  const isHoverOpen = useEffectEvent(() => {
    const type = dataRef.value.openEvent?.type;
    return type?.includes('mouse') && type !== 'mousedown';
  });

  // React 版 `useEffect`：[enabled, events] → openchange 监听（setup 注册一次）
  if (enabled) {
    function onOpenChange({open}: {open: boolean}) {
      if (!open) {
        clearTimeoutIfSet(timeoutRef);
        clearTimeoutIfSet(restTimeoutRef);
        blockMouseMoveRef.value = true;
        restTimeoutPendingRef.value = false;
      }
    }

    events.on('openchange', onOpenChange);
    onUnmounted(() => {
      events.off('openchange', onOpenChange);
    });
  }

  // React 版 `useEffect`：[elements.floating, open, ...] → html mouseleave
  let cleanupHtmlListener: (() => void) | undefined;
  watch(
    [open, elements.floating],
    () => {
      cleanupHtmlListener?.();
      cleanupHtmlListener = undefined;

      if (!enabled) return;
      if (!handleCloseRef.value) return;
      if (!open.value) return;

      function onLeave(event: MouseEvent) {
        if (isHoverOpen()) {
          onOpenChange(false, event, 'hover');
        }
      }

      const html = getDocument(elements.floating.value).documentElement;
      html.addEventListener('mouseleave', onLeave);
      cleanupHtmlListener = () => {
        html.removeEventListener('mouseleave', onLeave);
      };
    },
    {immediate: true},
  );

  const closeWithDelay = (
    event: Event,
    runElseBranch = true,
    reason: OpenChangeReason = 'hover',
  ) => {
    const closeDelay = getDelay(
      delayRef.value,
      'close',
      pointerTypeRef.value,
    );
    if (closeDelay && !handlerRef.value) {
      clearTimeoutIfSet(timeoutRef);
      timeoutRef.value = window.setTimeout(
        () => onOpenChange(false, event, reason),
        closeDelay,
      );
    } else if (runElseBranch) {
      clearTimeoutIfSet(timeoutRef);
      onOpenChange(false, event, reason);
    }
  };

  const cleanupMouseMoveHandler = useEffectEvent(() => {
    unbindMouseMoveRef.value();
    handlerRef.value = undefined;
  });

  const clearPointerEvents = useEffectEvent(() => {
    if (performedPointerEventsMutationRef.value) {
      const body = getDocument(elements.floating.value).body;
      body.style.pointerEvents = '';
      body.removeAttribute(safePolygonIdentifier);
      performedPointerEventsMutationRef.value = false;
    }
  });

  const isClickLikeOpenEvent = useEffectEvent(() => {
    return dataRef.value.openEvent
      ? ['click', 'mousedown'].includes(dataRef.value.openEvent.type)
      : false;
  });

  // React 版主 `useEffect`：直接在 reference/floating 上注册 mouse 监听
  // （绕过 React 的事件委托系统）
  let cleanupElementListeners: (() => void) | undefined;
  watch(
    [open, elements.domReference, elements.floating],
    () => {
      cleanupElementListeners?.();
      cleanupElementListeners = undefined;

      if (!enabled) return;

      function onReferenceMouseEnter(event: MouseEvent) {
        clearTimeoutIfSet(timeoutRef);
        blockMouseMoveRef.value = false;

        if (
          (mouseOnly && !isMouseLikePointerType(pointerTypeRef.value)) ||
          (getRestMs(restMsRef.value) > 0 &&
            !getDelay(delayRef.value, 'open'))
        ) {
          return;
        }

        const openDelay = getDelay(
          delayRef.value,
          'open',
          pointerTypeRef.value,
        );

        if (openDelay) {
          timeoutRef.value = window.setTimeout(() => {
            if (!open.value) {
              onOpenChange(true, event, 'hover');
            }
          }, openDelay);
        } else if (!open.value) {
          onOpenChange(true, event, 'hover');
        }
      }

      function onReferenceMouseLeave(event: MouseEvent) {
        if (isClickLikeOpenEvent()) {
          clearPointerEvents();
          return;
        }

        unbindMouseMoveRef.value();

        const doc = getDocument(elements.floating.value);
        clearTimeoutIfSet(restTimeoutRef);
        restTimeoutPendingRef.value = false;

        if (handleCloseRef.value && dataRef.value.floatingContext) {
          // Prevent clearing `onScrollMouseLeave` timeout.
          if (!open.value) {
            clearTimeoutIfSet(timeoutRef);
          }

          handlerRef.value = handleCloseRef.value({
            ...dataRef.value.floatingContext,
            tree,
            x: event.clientX,
            y: event.clientY,
            onClose() {
              clearPointerEvents();
              cleanupMouseMoveHandler();
              if (!isClickLikeOpenEvent()) {
                closeWithDelay(event, true, 'safe-polygon');
              }
            },
          });

          const handler = handlerRef.value;

          doc.addEventListener('mousemove', handler);
          unbindMouseMoveRef.value = () => {
            doc.removeEventListener('mousemove', handler);
          };

          return;
        }

        // Allow interactivity without `safePolygon` on touch devices. With a
        // pointer, a short close delay is an alternative, so it should work
        // consistently.
        const shouldClose =
          pointerTypeRef.value === 'touch'
            ? !contains(
                elements.floating.value,
                event.relatedTarget as Element | null,
              )
            : true;
        if (shouldClose) {
          closeWithDelay(event);
        }
      }

      // Ensure the floating element closes after scrolling even if the pointer
      // did not move.
      // https://github.com/floating-ui/floating-ui/discussions/1692
      function onScrollMouseLeave(event: MouseEvent) {
        if (isClickLikeOpenEvent()) return;
        if (!dataRef.value.floatingContext) return;

        handleCloseRef.value?.({
          ...dataRef.value.floatingContext,
          tree,
          x: event.clientX,
          y: event.clientY,
          onClose() {
            clearPointerEvents();
            cleanupMouseMoveHandler();
            if (!isClickLikeOpenEvent()) {
              closeWithDelay(event);
            }
          },
        })(event);
      }

      function onFloatingMouseEnter() {
        clearTimeoutIfSet(timeoutRef);
      }

      function onFloatingMouseLeave(event: MouseEvent) {
        if (!isClickLikeOpenEvent()) {
          closeWithDelay(event, false);
        }
      }

      if (isElement(elements.domReference.value)) {
        const reference = elements.domReference.value as unknown as HTMLElement;
        const floating = elements.floating.value;

        if (open.value) {
          reference.addEventListener('mouseleave', onScrollMouseLeave);
        }

        if (move) {
          reference.addEventListener('mousemove', onReferenceMouseEnter, {
            once: true,
          });
        }

        reference.addEventListener('mouseenter', onReferenceMouseEnter);
        reference.addEventListener('mouseleave', onReferenceMouseLeave);

        if (floating) {
          floating.addEventListener('mouseleave', onScrollMouseLeave);
          floating.addEventListener('mouseenter', onFloatingMouseEnter);
          floating.addEventListener('mouseleave', onFloatingMouseLeave);
        }

        cleanupElementListeners = () => {
          if (open.value) {
            reference.removeEventListener('mouseleave', onScrollMouseLeave);
          }

          if (move) {
            reference.removeEventListener('mousemove', onReferenceMouseEnter);
          }

          reference.removeEventListener('mouseenter', onReferenceMouseEnter);
          reference.removeEventListener('mouseleave', onReferenceMouseLeave);

          if (floating) {
            floating.removeEventListener('mouseleave', onScrollMouseLeave);
            floating.removeEventListener('mouseenter', onFloatingMouseEnter);
            floating.removeEventListener('mouseleave', onFloatingMouseLeave);
          }
        };
      }
    },
    {immediate: true},
  );

  // React 版 `useModernLayoutEffect`：safePolygon 的 blockPointerEvents——
  // 打开时屏蔽除 reference/floating 外的所有元素 pointer-events
  let cleanupPointerEvents: (() => void) | undefined;
  watch(
    [open, elements.domReference, elements.floating],
    () => {
      cleanupPointerEvents?.();
      cleanupPointerEvents = undefined;

      if (!enabled) return;

      if (
        open.value &&
        handleCloseRef.value?.__options?.blockPointerEvents &&
        isHoverOpen()
      ) {
        performedPointerEventsMutationRef.value = true;
        const floatingEl = elements.floating.value;

        if (isElement(elements.domReference.value) && floatingEl) {
          const body = getDocument(elements.floating.value).body;
          body.setAttribute(safePolygonIdentifier, '');

          const ref = elements.domReference.value as unknown as
            | HTMLElement
            | SVGSVGElement;

          const parentFloating = tree?.nodesRef.value.find(
            (node) => node.id === parentId,
          )?.context?.elements.floating;

          if (parentFloating?.value) {
            parentFloating.value.style.pointerEvents = '';
          }

          body.style.pointerEvents = 'none';
          ref.style.pointerEvents = 'auto';
          floatingEl.style.pointerEvents = 'auto';

          cleanupPointerEvents = () => {
            body.style.pointerEvents = '';
            ref.style.pointerEvents = '';
            floatingEl.style.pointerEvents = '';
          };
        }
      }
    },
    {immediate: true},
  );

  // React 版 `useModernLayoutEffect` [open]：关闭时重置
  watch(open, () => {
    if (!open.value) {
      pointerTypeRef.value = undefined;
      restTimeoutPendingRef.value = false;
      cleanupMouseMoveHandler();
      clearPointerEvents();
    }
  });

  // React 版卸载 `useEffect`：清理所有监听与 timeout
  onUnmounted(() => {
    cleanupHtmlListener?.();
    cleanupElementListeners?.();
    cleanupPointerEvents?.();
    cleanupMouseMoveHandler();
    clearTimeoutIfSet(timeoutRef);
    clearTimeoutIfSet(restTimeoutRef);
    clearPointerEvents();
  });

  function setPointerRef(event: PointerEvent) {
    pointerTypeRef.value = event.pointerType;
  }

  const reference: ElementProps['reference'] = {
    onPointerDown: setPointerRef,
    onPointerEnter: setPointerRef,
    onMouseMove(event: MouseEvent) {
      function handleMouseMove() {
        if (!blockMouseMoveRef.value && !open.value) {
          onOpenChange(true, event, 'hover');
        }
      }

      if (mouseOnly && !isMouseLikePointerType(pointerTypeRef.value)) {
        return;
      }

      if (open.value || getRestMs(restMsRef.value) === 0) {
        return;
      }

      // Ignore insignificant movements to account for tremors.
      if (
        restTimeoutPendingRef.value &&
        event.movementX ** 2 + event.movementY ** 2 < 2
      ) {
        return;
      }

      clearTimeoutIfSet(restTimeoutRef);

      if (pointerTypeRef.value === 'touch') {
        handleMouseMove();
      } else {
        restTimeoutPendingRef.value = true;
        restTimeoutRef.value = window.setTimeout(
          handleMouseMove,
          getRestMs(restMsRef.value),
        );
      }
    },
  };

  return enabled ? {reference} : {};
}
