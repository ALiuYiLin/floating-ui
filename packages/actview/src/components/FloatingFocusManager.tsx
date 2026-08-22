import {
  computed,
  defineComponent,
  onUnmounted,
  onWatcherCleanup,
  ref,
  watch,
  type Ref,
} from '@actview/core';
import {tabbable, isTabbable, focusable, type FocusableElement} from 'tabbable';
import {getNodeName, isHTMLElement} from '@floating-ui/utils/dom';
import {
  activeElement,
  contains,
  getDocument,
  getFloatingFocusElement,
  getNextTabbable,
  getNodeAncestors,
  getNodeChildren,
  getPreviousTabbable,
  getTarget,
  getTabbableOptions,
  isOutsideEvent,
  isTypeableCombobox,
  isVirtualClick,
  isVirtualPointerEvent,
  stopEvent,
} from '../utils';

import type {FloatingRootContext, OpenChangeReason} from '../types';
import {createAttribute} from '../utils/createAttribute';
import {enqueueFocus} from '../utils/enqueueFocus';
import {markOthers, supportsInert} from '../utils/markOthers';
import {usePortalContext} from './FloatingPortal';
import {useFloatingTree} from './FloatingTree';
import {FocusGuard, HIDDEN_STYLES} from './FocusGuard';
import {useLiteMergeRefs} from '../utils/useLiteMergeRefs';
import {clearTimeoutIfSet} from '../utils/clearTimeoutIfSet';

/**
 * actview 版（upstream 为 React 组件）。
 *
 * 与 upstream 的差异：
 * - `React.forwardRef` → `defineComponent`；`React.useRef` → `ref()`
 * - `React.useEffect` / `useModernLayoutEffect` → `watch`（依赖追踪 +
 *   手动 cleanup + `onUnmounted`）；effect cleanup → `onWatcherCleanup`
 * - `useEffectEvent` → 普通函数（闭包读 `.value` 即最新）
 * - context 字段为 `Ref`：`open.value` / `domReference.value` /
 *   `floating.value` / `dataRef.value.floatingContext?.nodeId.value`
 * - `usePortalContext` 返回 `Ref`（`.value`）；merged guard refs 用惰性 ref
 *   （portalContext 挂载后求值）
 * - `initialFocus` / `returnFocus` / `order` 为 props（computed 读取）
 * - 无 React 合成事件：`event.nativeEvent` → 直接传 `event`
 * - props 标量（disabled / modal / closeOnFocusOut / guards）在 setup 解构固定
 */

const LIST_LIMIT = 20;
let previouslyFocusedElements: WeakRef<Element>[] = [];

function clearDisconnectedPreviouslyFocusedElements() {
  previouslyFocusedElements = previouslyFocusedElements.filter(
    (elementRef) => elementRef.deref()?.isConnected,
  );
}

function addPreviouslyFocusedElement(element: Element | null) {
  clearDisconnectedPreviouslyFocusedElements();
  if (element && getNodeName(element) !== 'body') {
    previouslyFocusedElements.push(new WeakRef(element));
    if (previouslyFocusedElements.length > LIST_LIMIT) {
      previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
    }
  }
}

function getPreviouslyFocusedElement() {
  clearDisconnectedPreviouslyFocusedElements();
  const elementRef =
    previouslyFocusedElements[previouslyFocusedElements.length - 1];
  return elementRef?.deref();
}

function getFirstTabbableElement(container: Element) {
  const tabbableOptions = getTabbableOptions();
  if (isTabbable(container, tabbableOptions)) {
    return container;
  }

  return tabbable(container, tabbableOptions)[0] || container;
}

function handleTabIndex(
  floatingFocusElement: HTMLElement,
  orderRef: Ref<Array<'reference' | 'floating' | 'content'>>,
) {
  if (
    !orderRef.value.includes('floating') &&
    !floatingFocusElement.getAttribute('role')?.includes('dialog')
  ) {
    return;
  }

  const options = getTabbableOptions();
  const focusableElements = focusable(floatingFocusElement, options);
  const tabbableContent = focusableElements.filter((element) => {
    const dataTabIndex = element.getAttribute('data-tabindex') || '';
    return (
      isTabbable(element, options) ||
      (element.hasAttribute('data-tabindex') && !dataTabIndex.startsWith('-'))
    );
  });
  const tabIndex = floatingFocusElement.getAttribute('tabindex');

  if (orderRef.value.includes('floating') || tabbableContent.length === 0) {
    if (tabIndex !== '0') {
      floatingFocusElement.setAttribute('tabindex', '0');
    }
  } else if (
    tabIndex !== '-1' ||
    (floatingFocusElement.hasAttribute('data-tabindex') &&
      floatingFocusElement.getAttribute('data-tabindex') !== '-1')
  ) {
    floatingFocusElement.setAttribute('tabindex', '-1');
    floatingFocusElement.setAttribute('data-tabindex', '-1');
  }
}

const VisuallyHiddenDismiss = defineComponent(function (
  props: Record<string, unknown>,
) {
  const {ref: refProp, ...rest} = props;

  return () => (
    <button
      {...rest}
      type="button"
      ref={refProp as Ref<HTMLButtonElement | null> | undefined}
      tabIndex={-1}
      style={HIDDEN_STYLES}
    />
  );
});

export interface FloatingFocusManagerProps {
  children: any;
  /**
   * The floating context returned from `useFloatingRootContext`.
   */
  context: FloatingRootContext;
  /**
   * Whether or not the focus manager should be disabled. Useful to delay focus
   * management until after a transition completes or some other conditional
   * state.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * The order in which focus cycles.
   * @default ['content']
   */
  order?: Array<'reference' | 'floating' | 'content'> | undefined;
  /**
   * Which element to initially focus. Can be either a number (tabbable index as
   * specified by the `order`) or a ref.
   * @default 0
   */
  initialFocus?: number | Ref<HTMLElement | null> | undefined;
  /**
   * Determines if the focus guards are rendered. If not, focus can escape into
   * the address bar/console/browser UI, like in native dialogs.
   * @default true
   */
  guards?: boolean | undefined;
  /**
   * Determines if focus should be returned to the reference element once the
   * floating element closes/unmounts (or if that is not available, the
   * previously focused element). This prop is ignored if the floating element
   * lost focus.
   * It can be also set to a ref to explicitly control the element to return focus to.
   * @default true
   */
  returnFocus?: boolean | Ref<HTMLElement | null> | undefined;
  /**
   * Determines if focus should be restored to the nearest tabbable element if
   * focus inside the floating element is lost (such as due to the removal of
   * the currently focused element from the DOM).
   * @default false
   */
  restoreFocus?: boolean | undefined;
  /**
   * Determines if focus is “modal”, meaning focus is fully trapped inside the
   * floating element and outside content cannot be accessed. This includes
   * screen reader virtual cursors.
   * @default true
   */
  modal?: boolean | undefined;
  /**
   * If your focus management is modal and there is no explicit close button
   * available, you can use this prop to render a visually-hidden dismiss
   * button at the start and end of the floating element. This allows
   * touch-based screen readers to escape the floating element due to lack of
   * an `esc` key.
   * @default undefined
   */
  visuallyHiddenDismiss?: boolean | string | undefined;
  /**
   * Determines whether `focusout` event listeners that control whether the
   * floating element should be closed if the focus moves outside of it are
   * attached to the reference and floating elements. This affects non-modal
   * focus management.
   * @default true
   */
  closeOnFocusOut?: boolean | undefined;
  /**
   * Determines whether outside elements are `inert` when `modal` is enabled.
   * This enables pointer modality without a backdrop.
   * @default false
   */
  outsideElementsInert?: boolean | undefined;
  /**
   * Returns a list of elements that should be considered part of the
   * floating element.
   */
  getInsideElements?: (() => Element[]) | undefined;
}

/**
 * Provides focus management for the floating element.
 * @see https://floating-ui.com/docs/FloatingFocusManager
 */
export const FloatingFocusManager = defineComponent(function (
  props: FloatingFocusManagerProps,
) {
  const {
    context,
    children,
    disabled = false,
    order = ['content'],
    guards: _guards = true,
    initialFocus = 0,
    returnFocus = true,
    restoreFocus = false,
    modal = true,
    visuallyHiddenDismiss = false,
    closeOnFocusOut = true,
    outsideElementsInert = false,
    getInsideElements: _getInsideElements = () => [],
  } = props;
  const {
    open,
    onOpenChange,
    events,
    dataRef,
    elements: {domReference, floating},
  } = context;

  const getNodeId = () => dataRef.value.floatingContext?.nodeId.value;
  const getInsideElements = _getInsideElements;

  const ignoreInitialFocus = typeof initialFocus === 'number' && initialFocus < 0;
  // If the reference is a combobox and is typeable (e.g. input/textarea),
  // there are different focus semantics. The guards should not be rendered, but
  // aria-hidden should be applied to all nodes still. Further, the visually
  // hidden dismiss button should only appear at the end of the list, not the
  // start.
  const isUntrappedTypeableCombobox = computed(
    () => isTypeableCombobox(domReference.value) && ignoreInitialFocus,
  );

  // Force the guards to be rendered if the `inert` attribute is not supported.
  const inertSupported = supportsInert();
  const guards = inertSupported ? _guards : true;
  const useInert = !guards || (inertSupported && outsideElementsInert);

  const orderRef = computed(() => order);
  const initialFocusRef = computed(() => initialFocus);
  const returnFocusRef = computed(() => returnFocus);

  const tree = useFloatingTree();
  const portalContext = usePortalContext();

  const startDismissButtonRef = ref<HTMLButtonElement | null>(null);
  const endDismissButtonRef = ref<HTMLButtonElement | null>(null);
  const preventReturnFocusRef = ref(false);
  const isPointerDownRef = ref(false);
  const tabbableIndexRef = ref(-1);
  const blurTimeoutRef = ref(-1);

  const isInsidePortal = computed(() => portalContext.value != null);
  const floatingFocusElement = computed(() =>
    getFloatingFocusElement(floating.value),
  );

  const getTabbableContent = (
    container: Element | null = floatingFocusElement.value,
  ) => {
    return container ? tabbable(container, getTabbableOptions()) : [];
  };

  const getTabbableElements = (container?: Element | null) => {
    const content = getTabbableContent(container ?? undefined);

    return orderRef.value
      .map((type) => {
        if (domReference.value && type === 'reference') {
          return domReference.value;
        }

        if (floatingFocusElement.value && type === 'floating') {
          return floatingFocusElement.value;
        }

        return content;
      })
      .filter(Boolean)
      .flat() as Array<FocusableElement>;
  };

  // React 版 effect：modal 下 Tab 键循环
  let cleanupKeydown: (() => void) | undefined;
  watch(
    [domReference, floating],
    () => {
      cleanupKeydown?.();
      cleanupKeydown = undefined;

      if (disabled) return;
      if (!modal) return;

      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Tab') {
          // The focus guards have nothing to focus, so we need to stop the
          // event.
          if (
            contains(
              floatingFocusElement.value,
              activeElement(getDocument(floatingFocusElement.value)),
            ) &&
            getTabbableContent().length === 0 &&
            !isUntrappedTypeableCombobox.value
          ) {
            stopEvent(event);
          }

          const els = getTabbableElements();
          const target = getTarget(event);

          if (orderRef.value[0] === 'reference' && target === domReference.value) {
            stopEvent(event);
            if (event.shiftKey) {
              enqueueFocus(els[els.length - 1]);
            } else {
              enqueueFocus(els[1]);
            }
          }

          if (
            orderRef.value[1] === 'floating' &&
            target === floatingFocusElement.value &&
            event.shiftKey
          ) {
            stopEvent(event);
            enqueueFocus(els[0]);
          }
        }
      }

      const doc = getDocument(floatingFocusElement.value);
      doc.addEventListener('keydown', onKeyDown);
      cleanupKeydown = () => {
        doc.removeEventListener('keydown', onKeyDown);
      };
    },
  );

  // React 版 effect：记录 tabbable 索引
  let cleanupFocusIn: (() => void) | undefined;
  watch(
    floating,
    () => {
      cleanupFocusIn?.();
      cleanupFocusIn = undefined;

      if (disabled) return;
      if (!floating.value) return;

      function handleFocusIn(event: FocusEvent) {
        const target = getTarget(event) as Element | null;
        const tabbableContent = getTabbableContent() as Array<Element | null>;
        const tabbableIndex = tabbableContent.indexOf(target);
        if (tabbableIndex !== -1) {
          tabbableIndexRef.value = tabbableIndex;
        }
      }

      floating.value.addEventListener('focusin', handleFocusIn);
      cleanupFocusIn = () => {
        floating.value?.removeEventListener('focusin', handleFocusIn);
      };
    },
  );

  // React 版 effect：focusout 关闭逻辑
  let cleanupFocusOut: (() => void) | undefined;
  watch(
    [domReference, floating, portalContext],
    () => {
      cleanupFocusOut?.();
      cleanupFocusOut = undefined;

      if (disabled) return;
      if (!closeOnFocusOut) return;

      // In Safari, buttons lose focus when pressing them.
      function handlePointerDown() {
        isPointerDownRef.value = true;
        setTimeout(() => {
          isPointerDownRef.value = false;
        });
      }

      function handleFocusOutside(event: FocusEvent) {
        const relatedTarget = event.relatedTarget as HTMLElement | null;
        const currentTarget = event.currentTarget;
        const target = getTarget(event) as HTMLElement | null;

        queueMicrotask(() => {
          const nodeId = getNodeId();
          const movedToUnrelatedNode = !(
            contains(domReference.value, relatedTarget) ||
            contains(floating.value, relatedTarget) ||
            contains(relatedTarget, floating.value) ||
            contains(portalContext.value?.portalNode ?? null, relatedTarget) ||
            relatedTarget?.hasAttribute(createAttribute('focus-guard')) ||
            (tree &&
              (getNodeChildren(tree.nodesRef.value, nodeId).find(
                (node) =>
                  contains(node.context?.elements.floating.value, relatedTarget) ||
                  contains(
                    node.context?.elements.domReference.value,
                    relatedTarget,
                  ),
              ) ||
                getNodeAncestors(tree.nodesRef.value, nodeId).find(
                  (node) =>
                    [
                      node.context?.elements.floating.value,
                      getFloatingFocusElement(
                        node.context?.elements.floating.value,
                      ),
                    ].includes(relatedTarget) ||
                    node.context?.elements.domReference.value === relatedTarget,
                )))
          );

          if (currentTarget === domReference.value && floatingFocusElement.value) {
            handleTabIndex(floatingFocusElement.value, orderRef);
          }

          // Restore focus to the previous tabbable element index to prevent
          // focus from being lost outside the floating tree.
          if (
            restoreFocus &&
            currentTarget !== domReference.value &&
            !target?.isConnected &&
            activeElement(getDocument(floatingFocusElement.value)) ===
              getDocument(floatingFocusElement.value).body
          ) {
            // Let `FloatingPortal` effect knows that focus is still inside the
            // floating tree.
            if (isHTMLElement(floatingFocusElement.value)) {
              floatingFocusElement.value.focus();
            }

            const prevTabbableIndex = tabbableIndexRef.value;
            const tabbableContent =
              getTabbableContent() as Array<Element | null>;
            const nodeToFocus =
              tabbableContent[prevTabbableIndex] ||
              tabbableContent[tabbableContent.length - 1] ||
              floatingFocusElement.value;

            if (isHTMLElement(nodeToFocus)) {
              nodeToFocus.focus();
            }
          }

          // https://github.com/floating-ui/floating-ui/issues/3060
          if (dataRef.value.insideReactTree) {
            dataRef.value.insideReactTree = false;
            return;
          }

          // Focus did not move inside the floating tree, and there are no
          // tabbable portal guards to handle closing.
          if (
            (isUntrappedTypeableCombobox.value ? true : !modal) &&
            relatedTarget &&
            movedToUnrelatedNode &&
            !isPointerDownRef.value &&
            // Fix React 18 Strict Mode returnFocus due to double rendering.
            relatedTarget !== getPreviouslyFocusedElement()
          ) {
            preventReturnFocusRef.value = true;
            onOpenChange(false, event, 'focus-out');
          }
        });
      }

      const shouldHandleBlurCapture = Boolean(!tree && portalContext.value);

      function markInsideReactTree() {
        clearTimeoutIfSet(blurTimeoutRef);
        dataRef.value.insideReactTree = true;
        blurTimeoutRef.value = window.setTimeout(() => {
          dataRef.value.insideReactTree = false;
        });
      }

      if (floating.value && isHTMLElement(domReference.value)) {
        const focusOutListener = handleFocusOutside as EventListener;
        domReference.value.addEventListener('focusout', focusOutListener);
        domReference.value.addEventListener('pointerdown', handlePointerDown);
        floating.value.addEventListener('focusout', focusOutListener);

        if (shouldHandleBlurCapture) {
          floating.value.addEventListener(
            'focusout',
            markInsideReactTree,
            true,
          );
        }

        cleanupFocusOut = () => {
          domReference.value?.removeEventListener(
            'focusout',
            focusOutListener,
          );
          domReference.value?.removeEventListener(
            'pointerdown',
            handlePointerDown,
          );
          floating.value?.removeEventListener('focusout', focusOutListener);

          if (shouldHandleBlurCapture) {
            floating.value?.removeEventListener(
              'focusout',
              markInsideReactTree,
              true,
            );
          }
        };
      }
    },
  );

  const beforeGuardRef = ref<HTMLSpanElement | null>(null);
  const afterGuardRef = ref<HTMLSpanElement | null>(null);

  const mergedBeforeGuardRef = useLiteMergeRefs([
    beforeGuardRef,
    () => portalContext.value?.beforeInsideRef,
  ]);
  const mergedAfterGuardRef = useLiteMergeRefs([
    afterGuardRef,
    () => portalContext.value?.afterInsideRef,
  ]);

  // React 版 effect：markOthers（inert / aria-hidden）
  let cleanupMarkOthers: (() => void) | undefined;
  watch(
    [domReference, floating, portalContext],
    () => {
      cleanupMarkOthers?.();
      cleanupMarkOthers = undefined;

      if (disabled) return;
      if (!floating.value) return;

      // Don't hide portals nested within the parent portal.
      const portalNodes = Array.from(
        portalContext.value?.portalNode?.querySelectorAll(
          `[${createAttribute('portal')}]`,
        ) || [],
      );

      const ancestors = tree
        ? getNodeAncestors(tree.nodesRef.value, getNodeId())
        : [];
      const rootAncestorComboboxDomReference = ancestors.find((node) =>
        isTypeableCombobox(node.context?.elements.domReference.value || null),
      )?.context?.elements.domReference.value;

      const insideElements = [
        floating.value,
        rootAncestorComboboxDomReference,
        ...portalNodes,
        ...getInsideElements(),
        startDismissButtonRef.value,
        endDismissButtonRef.value,
        beforeGuardRef.value,
        afterGuardRef.value,
        portalContext.value?.beforeOutsideRef.value,
        portalContext.value?.afterOutsideRef.value,
        orderRef.value.includes('reference') ||
        isUntrappedTypeableCombobox.value
          ? domReference.value
          : null,
      ].filter((x): x is Element => x != null);

      cleanupMarkOthers =
        modal || isUntrappedTypeableCombobox.value
          ? markOthers(insideElements, !useInert, useInert)
          : markOthers(insideElements);
    },
  );

  // React 版 `useModernLayoutEffect`：初始 focus
  watch(
    [open, floatingFocusElement],
    () => {
      if (disabled || !isHTMLElement(floatingFocusElement.value)) return;

      const doc = getDocument(floatingFocusElement.value);
      const previouslyFocusedElement = activeElement(doc);

      // Wait for any layout effect state setters to execute to set `tabIndex`.
      queueMicrotask(() => {
        const focusableElements = getTabbableElements(
          floatingFocusElement.value,
        );
        const initialFocusValue = initialFocusRef.value;
        const elToFocus =
          (typeof initialFocusValue === 'number'
            ? focusableElements[initialFocusValue]
            : initialFocusValue.value) || floatingFocusElement.value;
        const focusAlreadyInsideFloatingEl = contains(
          floatingFocusElement.value,
          previouslyFocusedElement,
        );

        if (!ignoreInitialFocus && !focusAlreadyInsideFloatingEl && open.value) {
          enqueueFocus(elToFocus, {
            preventScroll: elToFocus === floatingFocusElement.value,
          });
        }
      });
    },
    {immediate: true},
  );

  // React 版 `useModernLayoutEffect`：returnFocus 管理
  let cleanupReturnFocus: (() => void) | undefined;
  watch(
    [open, floatingFocusElement, domReference],
    () => {
      cleanupReturnFocus?.();
      cleanupReturnFocus = undefined;

      if (disabled || !floatingFocusElement.value) return;

      const doc = getDocument(floatingFocusElement.value);
      const previouslyFocusedElement = activeElement(doc);

      addPreviouslyFocusedElement(previouslyFocusedElement);

      // Dismissing via outside press should always ignore `returnFocus` to
      // prevent unwanted scrolling.
      function onOpenChange({
        reason,
        event,
        nested,
      }: {
        open: boolean;
        reason: OpenChangeReason;
        event: Event;
        nested: boolean;
      }) {
        if (
          ['hover', 'safe-polygon'].includes(reason) &&
          event.type === 'mouseleave'
        ) {
          preventReturnFocusRef.value = true;
        }

        if (reason !== 'outside-press') return;

        if (nested) {
          preventReturnFocusRef.value = false;
        } else if (
          isVirtualClick(event as MouseEvent) ||
          isVirtualPointerEvent(event as PointerEvent)
        ) {
          preventReturnFocusRef.value = false;
        } else {
          let isPreventScrollSupported = false;
          document.createElement('div').focus({
            get preventScroll() {
              isPreventScrollSupported = true;
              return false;
            },
          });

          if (isPreventScrollSupported) {
            preventReturnFocusRef.value = false;
          } else {
            preventReturnFocusRef.value = true;
          }
        }
      }

      events.on('openchange', onOpenChange);

      const fallbackEl = doc.createElement('span');
      fallbackEl.setAttribute('tabindex', '-1');
      fallbackEl.setAttribute('aria-hidden', 'true');
      Object.assign(fallbackEl.style, HIDDEN_STYLES);

      if (isInsidePortal.value && domReference.value) {
        domReference.value.insertAdjacentElement('afterend', fallbackEl);
      }

      function getReturnElement() {
        if (typeof returnFocusRef.value === 'boolean') {
          const el = domReference.value || getPreviouslyFocusedElement();
          return el && el.isConnected ? el : fallbackEl;
        }

        return returnFocusRef.value.value || fallbackEl;
      }

      cleanupReturnFocus = () => {
        events.off('openchange', onOpenChange);

        const activeEl = activeElement(doc);
        const isFocusInsideFloatingTree =
          contains(floating.value, activeEl) ||
          (tree &&
            getNodeChildren(tree.nodesRef.value, getNodeId(), false).some(
              (node) =>
                contains(node.context?.elements.floating.value, activeEl),
            ));

        const returnElement = getReturnElement();

        queueMicrotask(() => {
          // This is `returnElement`, if it's tabbable, or its first tabbable
          // child.
          const tabbableReturnElement =
            getFirstTabbableElement(returnElement);
          if (
            returnFocusRef.value &&
            !preventReturnFocusRef.value &&
            isHTMLElement(tabbableReturnElement) &&
            // If the focus moved somewhere else after mount, avoid returning
            // focus since it likely entered a different element which should
            // be respected:
            // https://github.com/floating-ui/floating-ui/issues/2607
            (tabbableReturnElement !== activeEl && activeEl !== doc.body
              ? isFocusInsideFloatingTree
              : true)
          ) {
            tabbableReturnElement.focus({preventScroll: true});
          }

          fallbackEl.remove();
        });
      };
    },
  );

  // React 版 effect [disabled]：preventReturnFocus 重置
  queueMicrotask(() => {
    preventReturnFocusRef.value = false;
  });

  // React 版 `useModernLayoutEffect`：同步 context & modal 到 FloatingPortal
  watch(
    [portalContext, open, domReference],
    () => {
      if (disabled) return;
      const currentPortal = portalContext.value;
      if (!currentPortal) return;

      currentPortal.setFocusManagerState({
        modal,
        closeOnFocusOut,
        open: open.value,
        onOpenChange,
        domReference: domReference.value,
      });

      onWatcherCleanup(() => {
        currentPortal.setFocusManagerState(null);
      });
    },
  );

  // React 版 `useModernLayoutEffect`：handleTabIndex
  watch(
    floatingFocusElement,
    () => {
      if (disabled) return;
      if (!floatingFocusElement.value) return;
      handleTabIndex(floatingFocusElement.value, orderRef);
    },
    {immediate: true},
  );

  const shouldRenderGuards = computed(
    () =>
      !disabled &&
      guards &&
      (modal ? !isUntrappedTypeableCombobox.value : true) &&
      (isInsidePortal.value || modal),
  );

  function renderDismissButton(location: 'start' | 'end') {
    if (disabled || !visuallyHiddenDismiss || !modal) {
      return null;
    }

    return (
      <VisuallyHiddenDismiss
        ref={location === 'start' ? startDismissButtonRef : endDismissButtonRef}
        onClick={(event: MouseEvent) => onOpenChange(false, event)}
      >
        {typeof visuallyHiddenDismiss === 'string'
          ? visuallyHiddenDismiss
          : 'Dismiss'}
      </VisuallyHiddenDismiss>
    );
  }

  onUnmounted(() => {
    cleanupKeydown?.();
    cleanupFocusIn?.();
    cleanupFocusOut?.();
    cleanupMarkOthers?.();
    cleanupReturnFocus?.();
    queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
  });

  return () => (
    <>
      {shouldRenderGuards.value && (
        <FocusGuard
          data-type="inside"
          ref={mergedBeforeGuardRef}
          onFocus={(event: FocusEvent) => {
            if (modal) {
              const els = getTabbableElements();
              enqueueFocus(
                order[0] === 'reference' ? els[0] : els[els.length - 1],
              );
            } else if (
              portalContext.value?.preserveTabOrder &&
              portalContext.value.portalNode
            ) {
              preventReturnFocusRef.value = false;
              if (
                isOutsideEvent(
                  event,
                  portalContext.value.portalNode ?? undefined,
                )
              ) {
                const nextTabbable = getNextTabbable(domReference.value);
                nextTabbable?.focus();
              } else {
                portalContext.value.beforeOutsideRef.value?.focus();
              }
            }
          }}
        />
      )}
      {/*
        Ensure the first swipe is the list item. The end of the listbox popup
        will have a dismiss button.
      */}
      {!isUntrappedTypeableCombobox.value && renderDismissButton('start')}
      {children}
      {renderDismissButton('end')}
      {shouldRenderGuards.value && (
        <FocusGuard
          data-type="inside"
          ref={mergedAfterGuardRef}
          onFocus={(event: FocusEvent) => {
            if (modal) {
              enqueueFocus(getTabbableElements()[0]);
            } else if (
              portalContext.value?.preserveTabOrder &&
              portalContext.value.portalNode
            ) {
              if (closeOnFocusOut) {
                preventReturnFocusRef.value = true;
              }

              if (
                isOutsideEvent(
                  event,
                  portalContext.value.portalNode ?? undefined,
                )
              ) {
                const prevTabbable = getPreviousTabbable(domReference.value);
                prevTabbable?.focus();
              } else {
                portalContext.value.afterOutsideRef.value?.focus();
              }
            }
          }}
        />
      )}
    </>
  );
});
