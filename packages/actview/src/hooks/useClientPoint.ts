import {onUnmounted, ref, watch, type Ref} from '@actview/core';
import {getWindow} from '@floating-ui/utils/dom';
import {
  contains,
  getTarget,
  isMouseLikePointerType,
  useEffectEvent,
} from '../utils';

import type {ContextData, ElementProps, FloatingRootContext} from '../types';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - `React.useState` → `ref()`；`React.useRef` → `ref()`
 * - `React.useEffect` / `useModernLayoutEffect` → `watch`（依赖追踪 + immediate）
 * - `React.useCallback` → 普通函数；`useEffectEvent` / `contains` / `getTarget` /
 *   `isMouseLikePointerType` 从 `../utils` 导入
 * - 无 React 合成事件：处理器参数为原生事件
 * - props 标量（x / y / axis / enabled）在 setup 解构固定；响应式状态
 *   （open / floating / pointerType）通过 Ref `.value` 读取
 */

function createVirtualElement(
  domElement: Element | null | undefined,
  data: {
    axis: 'x' | 'y' | 'both';
    dataRef: Ref<ContextData>;
    pointerType: string | undefined;
    x: number | null;
    y: number | null;
  },
) {
  let offsetX: number | null = null;
  let offsetY: number | null = null;
  let isAutoUpdateEvent = false;

  return {
    contextElement: domElement || undefined,
    getBoundingClientRect() {
      const domRect = domElement?.getBoundingClientRect() || {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
      };

      const isXAxis = data.axis === 'x' || data.axis === 'both';
      const isYAxis = data.axis === 'y' || data.axis === 'both';
      const canTrackCursorOnAutoUpdate =
        ['mouseenter', 'mousemove'].includes(
          data.dataRef.value.openEvent?.type || '',
        ) && data.pointerType !== 'touch';

      let width = domRect.width;
      let height = domRect.height;
      let x = domRect.x;
      let y = domRect.y;

      if (offsetX == null && data.x && isXAxis) {
        offsetX = domRect.x - data.x;
      }

      if (offsetY == null && data.y && isYAxis) {
        offsetY = domRect.y - data.y;
      }

      x -= offsetX || 0;
      y -= offsetY || 0;
      width = 0;
      height = 0;

      if (!isAutoUpdateEvent || canTrackCursorOnAutoUpdate) {
        width = data.axis === 'y' ? domRect.width : 0;
        height = data.axis === 'x' ? domRect.height : 0;
        x = isXAxis && data.x != null ? data.x : x;
        y = isYAxis && data.y != null ? data.y : y;
      } else if (isAutoUpdateEvent && !canTrackCursorOnAutoUpdate) {
        height = data.axis === 'x' ? domRect.height : height;
        width = data.axis === 'y' ? domRect.width : width;
      }

      isAutoUpdateEvent = true;

      return {
        width,
        height,
        x,
        y,
        top: y,
        right: x + width,
        bottom: y + height,
        left: x,
      };
    },
  };
}

function isMouseBasedEvent(event: Event | undefined): event is MouseEvent {
  return event != null && (event as MouseEvent).clientX != null;
}

export interface UseClientPointProps {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: boolean | undefined;
  /**
   * Whether to restrict the client point to an axis and use the reference
   * element (if it exists) as the other axis. This can be useful if the
   * floating element is also interactive.
   * @default 'both'
   */
  axis?: 'x' | 'y' | 'both' | undefined;
  /**
   * An explicitly defined `x` client coordinate.
   * @default null
   */
  x?: number | null | undefined;
  /**
   * An explicitly defined `y` client coordinate.
   * @default null
   */
  y?: number | null | undefined;
}

/**
 * Positions the floating element relative to a client point (in the viewport),
 * such as the mouse position. By default, it follows the mouse cursor.
 * @see https://floating-ui.com/docs/useClientPoint
 */
export function useClientPoint(
  context: FloatingRootContext,
  props: UseClientPointProps = {},
): ElementProps {
  const {
    open,
    dataRef,
    elements: {floating, domReference},
    refs,
  } = context;
  const {enabled = true, axis = 'both', x = null, y = null} = props;

  const initialRef = ref(false);
  const cleanupListenerRef = ref<null | (() => void)>(null);

  const pointerType = ref<string | undefined>(undefined);
  const reactive = ref(0);

  const setReference = useEffectEvent((x: number | null, y: number | null) => {
    if (initialRef.value) return;

    // Prevent setting if the open event was not a mouse-like one
    // (e.g. focus to open, then hover over the reference element).
    // Only apply if the event exists.
    if (
      dataRef.value.openEvent &&
      !isMouseBasedEvent(dataRef.value.openEvent)
    ) {
      return;
    }

    refs.setPositionReference(
      createVirtualElement(domReference.value, {
        x,
        y,
        axis,
        dataRef,
        pointerType: pointerType.value,
      }),
    );
  });

  const handleReferenceEnterOrMove = useEffectEvent(
    (event: MouseEvent) => {
      if (x != null || y != null) return;

      if (!open.value) {
        setReference(event.clientX, event.clientY);
      } else if (!cleanupListenerRef.value) {
        // If there's no cleanup, there's no listener, but we want to ensure
        // we add the listener if the cursor landed on the floating element and
        // then back on the reference (i.e. it's interactive).
        reactive.value++;
      }
    },
  );

  // If the pointer is a mouse-like pointer, we want to continue following the
  // mouse even if the floating element is transitioning out. On touch
  // devices, this is undesirable because the floating element will move to
  // the dismissal touch point.
  const openCheck = isMouseLikePointerType(pointerType.value)
    ? floating.value
    : open.value;

  const addListener = () => {
    // Explicitly specified `x`/`y` coordinates shouldn't add a listener.
    if (!openCheck || !enabled || x != null || y != null) return;

    const win = getWindow(floating.value);

    function handleMouseMove(event: MouseEvent) {
      const target = getTarget(event) as Element | null;

      if (!contains(floating.value, target)) {
        setReference(event.clientX, event.clientY);
      } else {
        win.removeEventListener('mousemove', handleMouseMove);
        cleanupListenerRef.value = null;
      }
    }

    if (
      !dataRef.value.openEvent ||
      isMouseBasedEvent(dataRef.value.openEvent)
    ) {
      win.addEventListener('mousemove', handleMouseMove);
      const cleanup = () => {
        win.removeEventListener('mousemove', handleMouseMove);
        cleanupListenerRef.value = null;
      };
      cleanupListenerRef.value = cleanup;
      return cleanup;
    }

    refs.setPositionReference(domReference.value);
  };

  // React 版 `useEffect(() => addListener(), [addListener, reactive])`：
  // 相关响应式状态（open / floating / pointerType / reactive）变化时重建监听
  watch(
    [open, floating, pointerType, reactive],
    () => {
      cleanupListenerRef.value?.();
      cleanupListenerRef.value = null;
      cleanupListenerRef.value = addListener() ?? null;
    },
    {immediate: true},
  );

  onUnmounted(() => {
    cleanupListenerRef.value?.();
    cleanupListenerRef.value = null;
  });

  // React 版 `useEffect`：[enabled, floating] → 无 floating 时重置 initialRef
  watch(
    floating,
    () => {
      if (enabled && !floating.value) {
        initialRef.value = false;
      }
    },
    {immediate: true},
  );

  // React 版 `useEffect`：[enabled, open] → 禁用且打开时置位 initialRef
  watch(open, () => {
    if (!enabled && open.value) {
      initialRef.value = true;
    }
  });

  // React 版 `useModernLayoutEffect`：[enabled, x, y] → 显式坐标立即 setReference。
  // x / y 为 setup 解构的固定值，挂载时执行一次即可。
  if (enabled && (x != null || y != null)) {
    initialRef.value = false;
    setReference(x, y);
  }

  function setPointerTypeRef(event: PointerEvent) {
    pointerType.value = event.pointerType;
  }

  const reference: ElementProps['reference'] = {
    onPointerDown: setPointerTypeRef,
    onPointerEnter: setPointerTypeRef,
    onMouseMove: handleReferenceEnterOrMove,
    onMouseEnter: handleReferenceEnterOrMove,
  };

  return enabled ? {reference} : {};
}
