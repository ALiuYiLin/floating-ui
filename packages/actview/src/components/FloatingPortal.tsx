import {
  computed,
  createContext,
  defineComponent,
  onUnmounted,
  ref,
  toValue,
  watch,
  Teleport,
  type Ref,
} from '@actview/core';
import {
  disableFocusInside,
  enableFocusInside,
  getNextTabbable,
  getPreviousTabbable,
  isOutsideEvent,
} from '@floating-ui/actview/utils';

import {useId} from '../hooks/useId';
import type {OpenChangeReason} from '../types';
import {createAttribute} from '../utils/createAttribute';
import {FocusGuard} from './FocusGuard';

/**
 * actview 版（upstream 为 React 组件）。
 *
 * 与 upstream 的差异：
 * - `ReactDOM.createPortal` → actview 内置 `<Teleport to={portalNode}>`
 *   （Vue 语义：目标容器渲染，to 支持 Element/选择器）
 * - `useFloatingPortalNode` 返回 `Ref<HTMLElement | null>`（渲染期读 .value）
 * - `React.useState` → `ref()`；`useModernLayoutEffect` → `watch`
 *   （id / uniqueId / root / portalContext 变化时创建节点）
 * - `usePortalContext` 返回 `Ref`（调用方渲染期读 .value）
 * - `setFocusManagerState` 支持值与函数式更新（React SetStateAction 语义）
 * - 无 React 合成事件：`event.nativeEvent` → 直接传 `event`
 */

// Special visually hidden styles for the aria-owns owner element
// to ensure owned element accessibility in iOS/Safari/VoiceControl.
// The owner element is an empty span, so most of the common visually hidden styles are not needed.
// See https://github.com/floating-ui/floating-ui/issues/3403
const HIDDEN_OWNER_STYLES: Record<string, string | number> = {
  clipPath: 'inset(50%)',
  position: 'fixed',
  top: 0,
  left: 0,
};

type FocusManagerState = {
  modal: boolean;
  open: boolean;
  onOpenChange(open: boolean, event?: Event, reason?: OpenChangeReason): void;
  domReference: Element | null;
  closeOnFocusOut: boolean;
} | null;

type SetFocusManagerState = (
  value:
    | FocusManagerState
    | ((prev: FocusManagerState) => FocusManagerState),
) => void;

interface PortalContextValue {
  preserveTabOrder: boolean;
  portalNode: HTMLElement | null;
  setFocusManagerState: SetFocusManagerState;
  beforeInsideRef: Ref<HTMLSpanElement | null>;
  afterInsideRef: Ref<HTMLSpanElement | null>;
  beforeOutsideRef: Ref<HTMLSpanElement | null>;
  afterOutsideRef: Ref<HTMLSpanElement | null>;
}

const PortalContext = createContext<PortalContextValue | null>(null);

const attr = createAttribute('portal');

export interface UseFloatingPortalNodeProps {
  id?: string | undefined;
  root?:
    | HTMLElement
    | ShadowRoot
    | null
    | Ref<HTMLElement | ShadowRoot | null>
    | undefined;
}

/**
 * @see https://floating-ui.com/docs/FloatingPortal#usefloatingportalnode
 */
export function useFloatingPortalNode(
  props: UseFloatingPortalNodeProps = {},
): Ref<HTMLElement | null> {
  const {id, root} = props;

  const uniqueId = useId();
  const portalContext = usePortalContext();

  const portalNode = ref<HTMLElement | null>(null);
  const portalNodeRef = ref<HTMLDivElement | null>(null);

  // React 版清理 effect [portalNode]：旧节点移除 + 重置 ref（微任务）
  watch(portalNode, (_, oldNode) => {
    oldNode?.remove();
    // Allow the subsequent layout effects to create a new node on updates.
    // The portal node will still be cleaned up on unmount.
    // https://github.com/floating-ui/floating-ui/issues/2454
    queueMicrotask(() => {
      portalNodeRef.value = null;
    });
  });

  onUnmounted(() => {
    portalNode.value?.remove();
  });

  // React 版两个创建 effect（id 分支 + root 分支）
  watch(
    () => [
      id,
      uniqueId.value,
      toValue(root),
      portalContext.value?.portalNode,
    ],
    () => {
      // Wait for the uniqueId to be generated before creating the portal node
      // (mirroring React <18 `useFloatingId` semantics).
      // https://github.com/floating-ui/floating-ui/issues/2778
      if (!uniqueId.value) return;
      if (portalNodeRef.value) return;

      // `id` 分支：已有元素直接作为 root（优先）
      const existingIdRoot = id ? document.getElementById(id) : null;
      if (existingIdRoot) {
        const subRoot = document.createElement('div');
        subRoot.id = uniqueId.value;
        subRoot.setAttribute(attr, '');
        existingIdRoot.appendChild(subRoot);
        portalNodeRef.value = subRoot;
        portalNode.value = subRoot;
        return;
      }

      // `root` 分支：root / 父 portal 节点 / body
      const rootValue = toValue(root);
      if (rootValue === null) return;

      let container = rootValue || portalContext.value?.portalNode;
      container = container || document.body;

      let idWrapper: HTMLDivElement | null = null;
      if (id) {
        idWrapper = document.createElement('div');
        idWrapper.id = id;
        container.appendChild(idWrapper);
      }

      const subRoot = document.createElement('div');
      subRoot.id = uniqueId.value;
      subRoot.setAttribute(attr, '');

      container = idWrapper || container;
      container.appendChild(subRoot);

      portalNodeRef.value = subRoot;
      portalNode.value = subRoot;
    },
  );

  return portalNode;
}

export interface FloatingPortalProps {
  children?: any;
  /**
   * Optionally selects the node with the id if it exists, or create it and
   * append it to the specified `root` (by default `document.body`).
   */
  id?: string | undefined;
  /**
   * Specifies the root node the portal container will be appended to.
   */
  root?:
    | HTMLElement
    | ShadowRoot
    | null
    | Ref<HTMLElement | ShadowRoot | null>
    | undefined;
  /**
   * When using non-modal focus management using `FloatingFocusManager`, this
   * will preserve the tab order context based on the React tree instead of the
   * DOM tree.
   */
  preserveTabOrder?: boolean | undefined;
}

/**
 * Portals the floating element into a given container element — by default,
 * outside of the app root and into the body.
 * This is necessary to ensure the floating element can appear outside any
 * potential parent containers that cause clipping (such as `overflow: hidden`),
 * while retaining its location in the React tree.
 * @see https://floating-ui.com/docs/FloatingPortal
 */
export const FloatingPortal = defineComponent(function (
  props: FloatingPortalProps,
) {
  const {children, id, root, preserveTabOrder = true} = props;

  const portalNode = useFloatingPortalNode({id, root});
  const focusManagerState = ref<FocusManagerState>(null);

  const beforeOutsideRef = ref<HTMLSpanElement | null>(null);
  const afterOutsideRef = ref<HTMLSpanElement | null>(null);
  const beforeInsideRef = ref<HTMLSpanElement | null>(null);
  const afterInsideRef = ref<HTMLSpanElement | null>(null);

  const setFocusManagerState: SetFocusManagerState = (value) => {
    focusManagerState.value =
      typeof value === 'function'
        ? (value as (prev: FocusManagerState) => FocusManagerState)(
            focusManagerState.value,
          )
        : value;
  };

  const modal = computed(() => focusManagerState.value?.modal);
  const open = computed(() => focusManagerState.value?.open);

  const shouldRenderGuards = computed(
    () =>
      // The FocusManager and therefore floating element are currently open/
      // rendered.
      !!focusManagerState.value &&
      // Guards are only for non-modal focus management.
      !focusManagerState.value.modal &&
      // Don't render if unmount is transitioning.
      focusManagerState.value.open &&
      preserveTabOrder &&
      !!(toValue(root) || portalNode.value),
  );

  // https://codesandbox.io/s/tabbable-portal-f4tng?file=/src/TabbablePortal.tsx
  let cleanupFocusListeners: (() => void) | undefined;
  watch(
    () => [portalNode.value, preserveTabOrder, modal.value],
    () => {
      cleanupFocusListeners?.();
      cleanupFocusListeners = undefined;

      if (!portalNode.value || !preserveTabOrder || modal.value) {
        return;
      }

      // Make sure elements inside the portal element are tabbable only when the
      // portal has already been focused, either by tabbing into a focus trap
      // element outside or using the mouse.
      function onFocus(event: FocusEvent) {
        if (portalNode.value && isOutsideEvent(event)) {
          const focusing = event.type === 'focusin';
          const manageFocus = focusing
            ? enableFocusInside
            : disableFocusInside;
          manageFocus(portalNode.value);
        }
      }
      // Listen to the event on the capture phase so they run before the focus
      // trap elements onFocus prop is called.
      portalNode.value.addEventListener('focusin', onFocus, true);
      portalNode.value.addEventListener('focusout', onFocus, true);
      cleanupFocusListeners = () => {
        portalNode.value?.removeEventListener('focusin', onFocus, true);
        portalNode.value?.removeEventListener('focusout', onFocus, true);
      };
    },
  );

  watch(
    () => [portalNode.value, open.value],
    () => {
      if (!portalNode.value) return;
      if (open.value) return;
      enableFocusInside(portalNode.value);
    },
  );

  onUnmounted(() => {
    cleanupFocusListeners?.();
  });

  const contextValue = computed<PortalContextValue>(() => ({
    preserveTabOrder,
    beforeOutsideRef,
    afterOutsideRef,
    beforeInsideRef,
    afterInsideRef,
    portalNode: portalNode.value,
    setFocusManagerState,
  }));

  return () => (
    <PortalContext.Provider value={contextValue.value}>
      {shouldRenderGuards.value && portalNode.value && (
        <FocusGuard
          data-type="outside"
          ref={beforeOutsideRef}
          onFocus={(event: FocusEvent) => {
            if (isOutsideEvent(event, portalNode.value ?? undefined)) {
              beforeInsideRef.value?.focus();
            } else {
              const domReference = focusManagerState.value
                ? focusManagerState.value.domReference
                : null;
              const prevTabbable = getPreviousTabbable(domReference);
              prevTabbable?.focus();
            }
          }}
        />
      )}
      {shouldRenderGuards.value && portalNode.value && (
        <span aria-owns={portalNode.value.id} style={HIDDEN_OWNER_STYLES} />
      )}
      {portalNode.value && (
        <Teleport to={portalNode.value}>{children}</Teleport>
      )}
      {shouldRenderGuards.value && portalNode.value && (
        <FocusGuard
          data-type="outside"
          ref={afterOutsideRef}
          onFocus={(event: FocusEvent) => {
            if (isOutsideEvent(event, portalNode.value ?? undefined)) {
              afterInsideRef.value?.focus();
            } else {
              const domReference = focusManagerState.value
                ? focusManagerState.value.domReference
                : null;
              const nextTabbable = getNextTabbable(domReference);
              nextTabbable?.focus();

              focusManagerState.value?.closeOnFocusOut &&
                focusManagerState.value?.onOpenChange(
                  false,
                  event,
                  'focus-out',
                );
            }
          }}
        />
      )}
    </PortalContext.Provider>
  );
});

export const usePortalContext = () => PortalContext.use();
