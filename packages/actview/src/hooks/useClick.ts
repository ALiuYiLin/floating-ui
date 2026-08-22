import {ref} from '@actview/core';
import {isHTMLElement} from '@floating-ui/utils/dom';
import {isMouseLikePointerType, isTypeableElement} from '../utils';

import type {ElementProps, FloatingRootContext} from '../types';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - `React.useRef` → actview `ref()`（.value）
 * - 无 useMemo：事件处理器对象每次调用新建（actview setup 中调用一次，
 *   闭包内的 `open` / `dataRef` / `domReference` 均为 Ref，事件触发时读 .value 取最新值）
 * - 无 React 合成事件：处理器参数为原生事件，`event.nativeEvent` → 直接传 `event`
 */

function isButtonTarget(event: KeyboardEvent) {
  return isHTMLElement(event.target) && event.target.tagName === 'BUTTON';
}

function isAnchorTarget(event: KeyboardEvent) {
  return isHTMLElement(event.target) && event.target.tagName === 'A';
}

function isSpaceIgnored(element: Element | null) {
  return isTypeableElement(element);
}

export interface UseClickProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: boolean | undefined;
  /**
   * The type of event to use to determine a “click” with mouse input.
   * Keyboard clicks work as normal.
   * @default 'click'
   */
  event?: 'click' | 'mousedown' | undefined;
  /**
   * Whether to toggle the open state with repeated clicks.
   * @default true
   */
  toggle?: boolean | undefined;
  /**
   * Whether to ignore the logic for mouse input (for example, if `useHover()`
   * is also being used).
   * @default false
   */
  ignoreMouse?: boolean | undefined;
  /**
   * Whether to add keyboard handlers (Enter and Space key functionality) for
   * non-button elements (to open/close the floating element via keyboard
   * “click”).
   * @default true
   */
  keyboardHandlers?: boolean | undefined;
  /**
   * If already open from another event such as the `useHover()` Hook,
   * determines whether to keep the floating element open when clicking the
   * reference element for the first time.
   * @default true
   */
  stickIfOpen?: boolean | undefined;
}

/**
 * Opens or closes the floating element when clicking the reference element.
 * @see https://floating-ui.com/docs/useClick
 */
export function useClick(
  context: FloatingRootContext,
  props: UseClickProps = {},
): ElementProps {
  const {
    open,
    onOpenChange,
    dataRef,
    elements: {domReference},
  } = context;
  const {
    enabled = true,
    event: eventOption = 'click',
    toggle = true,
    ignoreMouse = false,
    keyboardHandlers = true,
    stickIfOpen = true,
  } = props;

  const pointerTypeRef = ref<'mouse' | 'pen' | 'touch' | undefined>(undefined);
  const didKeyDownRef = ref(false);

  const reference: ElementProps['reference'] = {
    onPointerDown(event: PointerEvent) {
      pointerTypeRef.value = event.pointerType as 'mouse' | 'pen' | 'touch';
    },
    onMouseDown(event: MouseEvent) {
      const pointerType = pointerTypeRef.value;

      // Ignore all buttons except for the "main" button.
      // https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
      if (event.button !== 0) return;
      if (eventOption === 'click') return;
      if (isMouseLikePointerType(pointerType, true) && ignoreMouse) return;

      if (
        open.value &&
        toggle &&
        (dataRef.value.openEvent && stickIfOpen
          ? dataRef.value.openEvent.type === 'mousedown'
          : true)
      ) {
        onOpenChange(false, event, 'click');
      } else {
        // Prevent stealing focus from the floating element
        event.preventDefault();
        onOpenChange(true, event, 'click');
      }
    },
    onClick(event: MouseEvent) {
      const pointerType = pointerTypeRef.value;

      if (eventOption === 'mousedown' && pointerTypeRef.value) {
        pointerTypeRef.value = undefined;
        return;
      }

      if (isMouseLikePointerType(pointerType, true) && ignoreMouse) return;

      if (
        open.value &&
        toggle &&
        (dataRef.value.openEvent && stickIfOpen
          ? dataRef.value.openEvent.type === 'click'
          : true)
      ) {
        onOpenChange(false, event, 'click');
      } else {
        onOpenChange(true, event, 'click');
      }
    },
    onKeyDown(event: KeyboardEvent) {
      pointerTypeRef.value = undefined;

      if (
        event.defaultPrevented ||
        !keyboardHandlers ||
        isButtonTarget(event)
      ) {
        return;
      }

      if (event.key === ' ' && !isSpaceIgnored(domReference.value)) {
        // Prevent scrolling
        event.preventDefault();
        didKeyDownRef.value = true;
      }

      if (isAnchorTarget(event)) {
        return;
      }

      if (event.key === 'Enter') {
        if (open.value && toggle) {
          onOpenChange(false, event, 'click');
        } else {
          onOpenChange(true, event, 'click');
        }
      }
    },
    onKeyUp(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        !keyboardHandlers ||
        isButtonTarget(event) ||
        isSpaceIgnored(domReference.value)
      ) {
        return;
      }

      if (event.key === ' ' && didKeyDownRef.value) {
        didKeyDownRef.value = false;
        if (open.value && toggle) {
          onOpenChange(false, event, 'click');
        } else {
          onOpenChange(true, event, 'click');
        }
      }
    },
  };

  return enabled ? {reference} : {};
}
