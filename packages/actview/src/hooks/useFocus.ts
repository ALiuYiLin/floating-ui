import {onUnmounted, ref, watch} from '@actview/core';
import {getWindow, isElement, isHTMLElement} from '@floating-ui/utils/dom';
import {
  activeElement,
  contains,
  getDocument,
  getTarget,
  isMac,
  isSafari,
  isTypeableElement,
  matchesFocusVisible,
} from '../utils';

import type {
  ElementProps,
  FloatingRootContext,
  OpenChangeReason,
} from '../types';
import {createAttribute} from '../utils/createAttribute';
import {clearTimeoutIfSet} from '../utils/clearTimeoutIfSet';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - `React.useRef` → `ref()`；`React.useEffect` → `watch`（依赖追踪 + immediate）
 *   + 手动 cleanup 管理；卸载清理用 `onUnmounted`
 * - `events.on('openchange')` 在 setup 注册一次（events 对象固定）
 * - 无 React 合成事件：处理器参数为原生事件，`event.nativeEvent` → 直接传 `event`
 * - `elements.domReference` 为 `Ref<Element | null>` → `.value`
 * - props 标量（enabled / visibleOnly）在 setup 解构固定
 */

function isMacSafari() {
  return isMac() && isSafari();
}

export interface UseFocusProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: boolean | undefined;
  /**
   * Whether the open state only changes if the focus event is considered
   * visible (`:focus-visible` CSS selector).
   * @default true
   */
  visibleOnly?: boolean | undefined;
}

/**
 * Opens the floating element while the reference element has focus, like CSS
 * `:focus`.
 * @see https://floating-ui.com/docs/useFocus
 */
export function useFocus(
  context: FloatingRootContext,
  props: UseFocusProps = {},
): ElementProps {
  const {open, onOpenChange, events, dataRef, elements} = context;
  const {enabled = true, visibleOnly = true} = props;

  const blockFocusRef = ref(false);
  const timeoutRef = ref(-1);
  const keyboardModalityRef = ref(true);

  // React 版 `useEffect`：[elements.domReference, open, enabled] → window 监听
  let cleanupWindowListeners: (() => void) | undefined;
  watch(
    [elements.domReference, open],
    () => {
      cleanupWindowListeners?.();
      cleanupWindowListeners = undefined;

      if (!enabled) return;

      const win = getWindow(elements.domReference.value);

      // If the reference was focused and the user left the tab/window, and the
      // floating element was not open, the focus should be blocked when they
      // return to the tab/window.
      function onBlur() {
        if (
          !open.value &&
          isHTMLElement(elements.domReference.value) &&
          elements.domReference.value ===
            activeElement(getDocument(elements.domReference.value))
        ) {
          blockFocusRef.value = true;
        }
      }

      function onKeyDown() {
        keyboardModalityRef.value = true;
      }

      function onPointerDown() {
        keyboardModalityRef.value = false;
      }

      win.addEventListener('blur', onBlur);

      if (isMacSafari()) {
        win.addEventListener('keydown', onKeyDown, true);
        win.addEventListener('pointerdown', onPointerDown, true);
      }

      cleanupWindowListeners = () => {
        win.removeEventListener('blur', onBlur);

        if (isMacSafari()) {
          win.removeEventListener('keydown', onKeyDown, true);
          win.removeEventListener('pointerdown', onPointerDown, true);
        }
      };
    },
    {immediate: true},
  );

  // React 版 `useEffect`：[events, enabled] → openchange 事件订阅
  if (enabled) {
    const onOpenChange = ({reason}: {reason: OpenChangeReason}) => {
      if (reason === 'reference-press' || reason === 'escape-key') {
        blockFocusRef.value = true;
      }
    };

    events.on('openchange', onOpenChange);
    onUnmounted(() => {
      events.off('openchange', onOpenChange);
    });
  }

  // React 版 `useEffect`（卸载清理 timeout）
  onUnmounted(() => {
    cleanupWindowListeners?.();
    clearTimeoutIfSet(timeoutRef);
  });

  const reference: ElementProps['reference'] = {
    onMouseLeave() {
      blockFocusRef.value = false;
    },
    onFocus(event: FocusEvent) {
      if (blockFocusRef.value) return;

      const target = getTarget(event);

      if (visibleOnly && isElement(target)) {
        // Safari fails to match `:focus-visible` if focus was initially
        // outside the document.
        if (isMacSafari() && !event.relatedTarget) {
          if (!keyboardModalityRef.value && !isTypeableElement(target)) {
            return;
          }
        } else if (!matchesFocusVisible(target)) {
          return;
        }
      }

      onOpenChange(true, event, 'focus');
    },
    onBlur(event: FocusEvent) {
      blockFocusRef.value = false;
      const relatedTarget = event.relatedTarget;
      // actview 无合成事件：原生 event 直接传递
      const nativeEvent = event;

      // Hit the non-modal focus management portal guard. Focus will be
      // moved into the floating element immediately after.
      const movedToFocusGuard =
        isElement(relatedTarget) &&
        relatedTarget.hasAttribute(createAttribute('focus-guard')) &&
        relatedTarget.getAttribute('data-type') === 'outside';

      // Wait for the window blur listener to fire.
      timeoutRef.value = window.setTimeout(() => {
        const activeEl = activeElement(
          elements.domReference.value
            ? elements.domReference.value.ownerDocument
            : document,
        );

        // Focus left the page, keep it open.
        if (!relatedTarget && activeEl === elements.domReference.value) return;

        // When focusing the reference element (e.g. regular click), then
        // clicking into the floating element, prevent it from hiding.
        // Note: it must be focusable, e.g. `tabindex="-1"`.
        // We can not rely on relatedTarget to point to the correct element
        // as it will only point to the shadow host of the newly focused element
        // and not the element that actually has received focus if it is located
        // inside a shadow root.
        if (
          contains(
            dataRef.value.floatingContext?.refs.floating.value,
            activeEl,
          ) ||
          contains(elements.domReference.value, activeEl) ||
          movedToFocusGuard
        ) {
          return;
        }

        onOpenChange(false, nativeEvent, 'focus');
      });
    },
  };

  return enabled ? {reference} : {};
}
