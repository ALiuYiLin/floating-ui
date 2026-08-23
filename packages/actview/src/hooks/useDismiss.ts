import {onUnmounted, ref, watch} from '@actview/core';
import {getOverflowAncestors} from '@floating-ui/dom';
import {
  getComputedStyle,
  getParentNode,
  isElement,
  isHTMLElement,
  isLastTraversableNode,
  isWebKit,
} from '@floating-ui/utils/dom';
import {
  contains,
  getDocument,
  getNodeChildren,
  getTarget,
  isEventTargetWithin,
  isRootElement,
  useEffectEvent,
} from '../utils';

import {useFloatingTree} from '../components/FloatingTree';
import type {ElementProps, FloatingRootContext} from '../types';
import {createAttribute} from '../utils/createAttribute';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - `React.useRef` → `ref()`；主 `React.useEffect` → `watch`
 *   （open / floating / domReference 变化时重建 document/scroll 监听）
 *   + 手动 cleanup + `onUnmounted`
 * - 无 React 合成事件：`event.nativeEvent` → 直接传 `event`（事件即原生）
 * - `dataRef.current` → `dataRef.value`；`tree.nodesRef.current` → `.value`；
 *   `child.context?.open` → `.open.value`；`elements.*` → `.value`
 * - `outsidePress` 函数形态仍用 `useEffectEvent` 包装（保持最新回调语义）
 * - 已移除 React 版 floating 元素上的 onPointerDownCapture 等「合成事件树
 *   捕获标记」（insideReactTree）：React 合成捕获沿组件树触发、可穿透 portal；
 *   actview 是原生 DOM 捕获（沿 DOM 树、不穿透 portal），该标记在嵌套浮层
 *   （FloatingPortal 渲到 body 下）场景不触发。改为纯 DOM 判断
 *   （isEventTargetWithin + FloatingTree 子节点 contains，对齐 @floating-ui/vue）——
 *   目标在浮层/参考元素/子浮层 DOM 内均不关闭，语义等价且不依赖合成捕获路径。
 * - props 标量在 setup 解构固定
 */

const bubbleHandlerKeys = {
  pointerdown: 'onPointerDown',
  mousedown: 'onMouseDown',
  click: 'onClick',
};

export const normalizeProp = (
  normalizable?:
    | boolean
    | {escapeKey?: boolean | undefined; outsidePress?: boolean | undefined},
) => {
  return {
    escapeKey:
      typeof normalizable === 'boolean'
        ? normalizable
        : normalizable?.escapeKey ?? false,
    outsidePress:
      typeof normalizable === 'boolean'
        ? normalizable
        : normalizable?.outsidePress ?? true,
  };
};

export interface UseDismissProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: boolean | undefined;
  /**
   * Whether to dismiss the floating element upon pressing the `esc` key.
   * @default true
   */
  escapeKey?: boolean | undefined;
  /**
   * Whether to dismiss the floating element upon pressing the reference
   * element. You likely want to ensure the `move` option in the `useHover()`
   * Hook has been disabled when this is in use.
   * @default false
   */
  referencePress?: boolean | undefined;
  /**
   * The type of event to use to determine a “press”.
   * - `pointerdown` is eager on both mouse + touch input.
   * - `mousedown` is eager on mouse input, but lazy on touch input.
   * - `click` is lazy on both mouse + touch input.
   * @default 'pointerdown'
   */
  referencePressEvent?: 'pointerdown' | 'mousedown' | 'click' | undefined;
  /**
   * Whether to dismiss the floating element upon pressing outside of the
   * floating element.
   * If you have another element, like a toast, that is rendered outside the
   * floating element’s React tree and don’t want the floating element to close
   * when pressing it, you can guard the check like so:
   * ```jsx
   * useDismiss(context, {
   *   outsidePress: (event) => !event.target.closest('.toast'),
   * });
   * ```
   * @default true
   */
  outsidePress?: boolean | ((event: MouseEvent) => boolean) | undefined;
  /**
   * The type of event to use to determine an outside “press”.
   * - `pointerdown` is eager on both mouse + touch input.
   * - `mousedown` is eager on mouse input, but lazy on touch input.
   * - `click` is lazy on both mouse + touch input.
   * @default 'pointerdown'
   */
  outsidePressEvent?: 'pointerdown' | 'mousedown' | 'click' | undefined;
  /**
   * Whether to dismiss the floating element upon scrolling an overflow
   * ancestor.
   * @default false
   */
  ancestorScroll?: boolean | undefined;
  /**
   * Determines whether event listeners bubble upwards through a tree of
   * floating elements.
   */
  bubbles?:
    | boolean
    | {escapeKey?: boolean | undefined; outsidePress?: boolean | undefined}
    | undefined;
  /**
   * Determines whether to use capture phase event listeners.
   */
  capture?:
    | boolean
    | {escapeKey?: boolean | undefined; outsidePress?: boolean | undefined}
    | undefined;
}

/**
 * Closes the floating element when a dismissal is requested — by default, when
 * the user presses the `escape` key or outside of the floating element.
 * @see https://floating-ui.com/docs/useDismiss
 */
export function useDismiss(
  context: FloatingRootContext,
  props: UseDismissProps = {},
): ElementProps {
  const {open, onOpenChange, elements, dataRef} = context;
  const {
    enabled = true,
    escapeKey = true,
    outsidePress: unstable_outsidePress = true,
    outsidePressEvent = 'pointerdown',
    referencePress = false,
    referencePressEvent = 'pointerdown',
    ancestorScroll = false,
    bubbles,
    capture,
  } = props;

  const tree = useFloatingTree();
  const outsidePressFn = useEffectEvent(
    typeof unstable_outsidePress === 'function'
      ? unstable_outsidePress
      : () => false,
  );
  const outsidePress =
    typeof unstable_outsidePress === 'function'
      ? outsidePressFn
      : unstable_outsidePress;

  const endedOrStartedInsideRef = ref(false);
  const {escapeKey: escapeKeyBubbles, outsidePress: outsidePressBubbles} =
    normalizeProp(bubbles);
  const {escapeKey: escapeKeyCapture, outsidePress: outsidePressCapture} =
    normalizeProp(capture);

  const isComposingRef = ref(false);

  const closeOnEscapeKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!open.value || !enabled || !escapeKey || event.key !== 'Escape') {
      return;
    }

    // Wait until IME is settled. Pressing `Escape` while composing should
    // close the compose menu, but not the floating element.
    if (isComposingRef.value) {
      return;
    }

    const nodeId = dataRef.value.floatingContext?.nodeId.value;

    const children = tree
      ? getNodeChildren(tree.nodesRef.value, nodeId)
      : [];

    if (!escapeKeyBubbles) {
      event.stopPropagation();

      if (children.length > 0) {
        let shouldDismiss = true;

        children.forEach((child) => {
          if (
            child.context?.open.value &&
            !child.context.dataRef.value.__escapeKeyBubbles
          ) {
            shouldDismiss = false;
            return;
          }
        });

        if (!shouldDismiss) {
          return;
        }
      }
    }

    // actview 无合成事件：event 即原生事件
    onOpenChange(false, event, 'escape-key');
  });

  const closeOnEscapeKeyDownCapture = useEffectEvent((event: KeyboardEvent) => {
    const callback = () => {
      closeOnEscapeKeyDown(event);
      getTarget(event)?.removeEventListener('keydown', callback);
    };
    getTarget(event)?.addEventListener('keydown', callback);
  });

  const closeOnPressOutside = useEffectEvent((event: MouseEvent) => {
    // When click outside is lazy (`click` event), handle dragging.
    // Don't close if:
    // - The click started inside the floating element.
    // - The click ended inside the floating element.
    const endedOrStartedInside = endedOrStartedInsideRef.value;
    endedOrStartedInsideRef.value = false;

    if (outsidePressEvent === 'click' && endedOrStartedInside) {
      return;
    }

    if (typeof outsidePress === 'function' && !outsidePress(event)) {
      return;
    }

    const target = getTarget(event);
    const inertSelector = `[${createAttribute('inert')}]`;
    const markers = getDocument(elements.floating.value).querySelectorAll(
      inertSelector,
    );

    let targetRootAncestor = isElement(target) ? target : null;
    while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
      const nextParent = getParentNode(targetRootAncestor);
      if (isLastTraversableNode(nextParent) || !isElement(nextParent)) {
        break;
      }

      targetRootAncestor = nextParent;
    }

    // Check if the click occurred on a third-party element injected after the
    // floating element rendered.
    if (
      markers.length &&
      isElement(target) &&
      !isRootElement(target) &&
      // Clicked on a direct ancestor (e.g. FloatingOverlay).
      !contains(target, elements.floating.value) &&
      // If the target root element contains none of the markers, then the
      // element was injected after the floating element rendered.
      Array.from(markers).every(
        (marker) => !contains(targetRootAncestor, marker),
      )
    ) {
      return;
    }

    // Check if the click occurred on the scrollbar
    if (isHTMLElement(target) && elements.floating.value) {
      const lastTraversableNode = isLastTraversableNode(target);
      const style = getComputedStyle(target);
      const scrollRe = /auto|scroll/;
      const isScrollableX =
        lastTraversableNode || scrollRe.test(style.overflowX);
      const isScrollableY =
        lastTraversableNode || scrollRe.test(style.overflowY);

      const canScrollX =
        isScrollableX &&
        target.clientWidth > 0 &&
        target.scrollWidth > target.clientWidth;
      const canScrollY =
        isScrollableY &&
        target.clientHeight > 0 &&
        target.scrollHeight > target.clientHeight;

      const isRTL = style.direction === 'rtl';

      // Check click position relative to scrollbar.
      // In some browsers it is possible to change the <body> (or window)
      // scrollbar to the left side, but is very rare and is difficult to
      // check for. Plus, for modal dialogs with backdrops, it is more
      // important that the backdrop is checked but not so much the window.
      const pressedVerticalScrollbar =
        canScrollY &&
        (isRTL
          ? event.offsetX <= target.offsetWidth - target.clientWidth
          : event.offsetX > target.clientWidth);

      const pressedHorizontalScrollbar =
        canScrollX && event.offsetY > target.clientHeight;

      if (pressedVerticalScrollbar || pressedHorizontalScrollbar) {
        return;
      }
    }

    const nodeId = dataRef.value.floatingContext?.nodeId.value;

    const targetIsInsideChildren =
      tree &&
      getNodeChildren(tree.nodesRef.value, nodeId).some((node) =>
        isEventTargetWithin(event, node.context?.elements.floating.value),
      );

    if (
      isEventTargetWithin(event, elements.floating.value) ||
      isEventTargetWithin(event, elements.domReference.value) ||
      targetIsInsideChildren
    ) {
      return;
    }

    const children = tree
      ? getNodeChildren(tree.nodesRef.value, nodeId)
      : [];
    if (children.length > 0) {
      let shouldDismiss = true;

      children.forEach((child) => {
        if (
          child.context?.open.value &&
          !child.context.dataRef.value.__outsidePressBubbles
        ) {
          shouldDismiss = false;
          return;
        }
      });

      if (!shouldDismiss) {
        return;
      }
    }

    onOpenChange(false, event, 'outside-press');
  });

  const closeOnPressOutsideCapture = useEffectEvent((event: MouseEvent) => {
    const callback = () => {
      closeOnPressOutside(event);
      getTarget(event)?.removeEventListener(outsidePressEvent, callback);
    };
    getTarget(event)?.addEventListener(outsidePressEvent, callback);
  });

  // React 版主 `useEffect`：open 时注册 document/scroll 监听
  let cleanupListeners: (() => void) | undefined;

  watch(
    [open, elements.floating, elements.domReference],
    () => {
      cleanupListeners?.();
      cleanupListeners = undefined;

      if (!open.value || !enabled) {
        return;
      }

      dataRef.value.__escapeKeyBubbles = escapeKeyBubbles;
      dataRef.value.__outsidePressBubbles = outsidePressBubbles;

      let compositionTimeout = -1;

      function onScroll(event: Event) {
        onOpenChange(false, event, 'ancestor-scroll');
      }

      function handleCompositionStart() {
        window.clearTimeout(compositionTimeout);
        isComposingRef.value = true;
      }

      function handleCompositionEnd() {
        // Safari fires `compositionend` before `keydown`, so we need to wait
        // until the next tick to set `isComposing` to `false`.
        // https://bugs.webkit.org/show_bug.cgi?id=165004
        compositionTimeout = window.setTimeout(
          () => {
            isComposingRef.value = false;
          },
          // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
          // Only apply to WebKit for the test to remain 0ms.
          isWebKit() ? 5 : 0,
        );
      }

      const doc = getDocument(elements.floating.value);

      if (escapeKey) {
        doc.addEventListener(
          'keydown',
          escapeKeyCapture
            ? closeOnEscapeKeyDownCapture
            : closeOnEscapeKeyDown,
          escapeKeyCapture,
        );
        doc.addEventListener('compositionstart', handleCompositionStart);
        doc.addEventListener('compositionend', handleCompositionEnd);
      }

      outsidePress &&
        doc.addEventListener(
          outsidePressEvent,
          outsidePressCapture
            ? closeOnPressOutsideCapture
            : closeOnPressOutside,
          outsidePressCapture,
        );

      let ancestors: (Element | Window | VisualViewport)[] = [];

      if (ancestorScroll) {
        if (isElement(elements.domReference.value)) {
          ancestors = getOverflowAncestors(elements.domReference.value);
        }

        if (isElement(elements.floating.value)) {
          ancestors = ancestors.concat(
            getOverflowAncestors(elements.floating.value),
          );
        }

        if (
          !isElement(elements.reference.value) &&
          elements.reference.value &&
          elements.reference.value.contextElement
        ) {
          ancestors = ancestors.concat(
            getOverflowAncestors(elements.reference.value.contextElement),
          );
        }
      }

      // Ignore the visual viewport for scrolling dismissal (allow pinch-zoom)
      ancestors = ancestors.filter(
        (ancestor) => ancestor !== doc.defaultView?.visualViewport,
      );

      ancestors.forEach((ancestor) => {
        ancestor.addEventListener('scroll', onScroll);
      });

      cleanupListeners = () => {
        if (escapeKey) {
          doc.removeEventListener(
            'keydown',
            escapeKeyCapture
              ? closeOnEscapeKeyDownCapture
              : closeOnEscapeKeyDown,
            escapeKeyCapture,
          );
          doc.removeEventListener('compositionstart', handleCompositionStart);
          doc.removeEventListener('compositionend', handleCompositionEnd);
        }

        outsidePress &&
          doc.removeEventListener(
            outsidePressEvent,
            outsidePressCapture
              ? closeOnPressOutsideCapture
              : closeOnPressOutside,
            outsidePressCapture,
          );
        ancestors.forEach((ancestor) => {
          ancestor.removeEventListener('scroll', onScroll);
        });

        window.clearTimeout(compositionTimeout);
      };
    },
    {immediate: true},
  );

  // React 版 `useEffect`：[dataRef, outsidePress, outsidePressEvent] → 挂载重置
  onUnmounted(() => {
    cleanupListeners?.();
  });

  const reference: ElementProps['reference'] = {
    onKeyDown: closeOnEscapeKeyDown,
    ...(referencePress && {
      [bubbleHandlerKeys[referencePressEvent]]: (event: MouseEvent) => {
        // actview 无合成事件：event 即原生事件
        onOpenChange(false, event, 'reference-press');
      },
      ...(referencePressEvent !== 'click' && {
        onClick(event: MouseEvent) {
          onOpenChange(false, event, 'reference-press');
        },
      }),
    }),
  };

  const floating: ElementProps['floating'] = {
    onKeyDown: closeOnEscapeKeyDown,
    onMouseDown: setMouseDownOrUpInside,
    onMouseUp: setMouseDownOrUpInside,
  };

  function setMouseDownOrUpInside(event: MouseEvent) {
    if (event.button !== 0) {
      return;
    }

    endedOrStartedInsideRef.value = true;
  }

  return enabled ? {reference, floating} : {};
}
