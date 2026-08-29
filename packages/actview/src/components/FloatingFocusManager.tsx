import {
  computed,
  defineComponent,
  onUnmounted,
  onWatcherCleanup,
  ref,
  toValue,
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
import {isElementVisible} from '../utils/composite';

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

function getFirstTabbableElement(container: Element | null | undefined) {
  if (!container) {
    return null;
  }

  const tabbableOptions = getTabbableOptions();
  if (isTabbable(container, tabbableOptions)) {
    return container;
  }

  return tabbable(container, tabbableOptions)[0] || container;
}

// 推断关闭交互类型（React 版 getEventType 的 actview 等价）。
function getCloseType(event: Event): string {
  if (event instanceof KeyboardEvent) return 'keyboard';
  if ('pointerType' in event) {
    return (event as PointerEvent).pointerType || 'keyboard';
  }
  if (event instanceof MouseEvent) {
    return (event as MouseEvent).detail === 0 ? 'keyboard' : 'mouse';
  }
  return '';
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
      // 对齐 base-ui：管理写 tabindex=0 时同步 data-tabindex，供
      // 「managed tabIndex downgraded」测试断言。
      floatingFocusElement.setAttribute('data-tabindex', '0');
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
  disabled?: boolean | Ref<boolean> | undefined;
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
  initialFocus?: number | boolean | Ref<HTMLElement | null> | undefined;
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
  returnFocus?:
    | boolean
    | Ref<HTMLElement | null>
    | ((closeType: string) => boolean | HTMLElement | null | void)
    | undefined;
  /**
   * Determines if focus should be restored to the nearest tabbable element if
   * focus inside the floating element is lost (such as due to the removal of
   * the currently focused element from the DOM).
   * @default false
   */
  restoreFocus?: boolean | 'popup' | undefined;
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
  const {context, children} = props;

  // 标量 props 响应式同步：父组件/测试可能传 Ref（如 disabled={disabled}）或
  // 通过 rerender 更新 props。传 Ref 时 computed 的依赖收集对「RefImpl 引用
  // 本身」不变不触发（actview shallowReactive 不解包 Ref），改用
  // ref + watch(() => toValue(...))——watch getter 读 RefImpl.value 追踪内部
  // 变化；传值时 props 代理变化同样触发。
  const disabled = ref(toValue(props.disabled ?? false));
  watch(
    () => toValue(props.disabled ?? false),
    (v) => {
      disabled.value = v;
    },
  );
  const order = computed<Array<'reference' | 'floating' | 'content'>>(
    () => props.order ?? ['content'],
  );
  const guardsRaw = computed(() => props.guards ?? true);
  const initialFocus = computed(() => props.initialFocus ?? 0);
  // returnFocus 每次读取 props（React 版每次渲染读取 props）：computed 缓存
  // 与 shallowReactive props 的依赖追踪存在时序问题（computed 首次求值可能
  // 早于 props 写入完成），事件回调里读到的 stale 值会导致 returnFocus 失效。
  const getReturnFocus = () => props.returnFocus ?? true;
  const restoreFocus = computed(() => toValue(props.restoreFocus ?? false));
  const modal = computed(() => props.modal ?? true);
  const visuallyHiddenDismiss = computed(
    () => props.visuallyHiddenDismiss ?? false,
  );
  const closeOnFocusOut = computed(() => props.closeOnFocusOut ?? true);
  const outsideElementsInert = computed(
    () => props.outsideElementsInert ?? false,
  );
  const getInsideElements = props.getInsideElements ?? (() => []);

  const {
    open,
    onOpenChange,
    events,
    dataRef,
    elements: {domReference, floating},
  } = context;

  const getNodeId = () => dataRef.value.floatingContext?.nodeId.value;

  const ignoreInitialFocus = computed(
    () =>
      initialFocus.value === false ||
      (typeof initialFocus.value === 'number' && initialFocus.value < 0),
  );
  // If the reference is a combobox and is typeable (e.g. input/textarea),
  // there are different focus semantics. The guards should not be rendered, but
  // aria-hidden should be applied to all nodes still. Further, the visually
  // hidden dismiss button should only appear at the end of the list, not the
  // start.
  const isUntrappedTypeableCombobox = computed(
    () => isTypeableCombobox(domReference.value) && ignoreInitialFocus.value,
  );

  // Force the guards to be rendered if the `inert` attribute is not supported.
  const inertSupported = supportsInert();
  const guards = computed(() => (inertSupported ? guardsRaw.value : true));
  const useInert = computed(
    () => !guards.value || (inertSupported && outsideElementsInert.value),
  );

  const orderRef = order;
  const initialFocusRef = initialFocus;
  const returnFocusRef = {
    get value() {
      return getReturnFocus();
    },
  } as Ref<
    | boolean
    | HTMLElement
    | null
    | ((closeType: string) => boolean | HTMLElement | null | void)
  >;

  const tree = useFloatingTree();
  const portalContext = usePortalContext();

  const startDismissButtonRef = ref<HTMLButtonElement | null>(null);
  const endDismissButtonRef = ref<HTMLButtonElement | null>(null);
  const preventReturnFocusRef = ref(false);
  const isPointerDownRef = ref(false);
  const tabbableIndexRef = ref(-1);
  const blurTimeoutRef = ref(-1);
  // closeType 跨 watch 周期共享（React 版 useRef 语义）：keepMounted 场景下
  // disabled/open 变化会触发多次 watch 重跑，若为周期局部变量，后续周期的
  // cleanup 会读到 ''（丢失 Escape 的 'keyboard'），returnFocus 函数参数错。
  const closeTypeRef = ref('');

  const isInsidePortal = computed(() => portalContext != null);
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

      if (disabled.value) return;
      if (!modal.value) return;

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

      if (disabled.value) return;
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
  // 依赖含 disabled：keepMounted 场景初始 disabled=true 时跳过注册，
  // 打开（disabled=false）后需重新注册 focusout 监听。
  let cleanupFocusOut: (() => void) | undefined;
  watch(
    [domReference, floating, portalContext, disabled],
    () => {
      cleanupFocusOut?.();
      cleanupFocusOut = undefined;

      if (disabled.value) return;
      if (!closeOnFocusOut.value) return;

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
            contains(portalContext?.portalNode ?? null, relatedTarget) ||
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
            restoreFocus.value &&
            currentTarget !== domReference.value &&
            !isElementVisible(target as Element) &&
            activeElement(getDocument(floatingFocusElement.value)) ===
              getDocument(floatingFocusElement.value).body
          ) {
            // Let `FloatingPortal` effect knows that focus is still inside the
            // floating tree.
            if (isHTMLElement(floatingFocusElement.value)) {
              floatingFocusElement.value.focus();
              // 若显式要求恢复到 popup 容器，不再搜索前/后 tabbable。
              if (restoreFocus.value === 'popup') {
                return;
              }
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
          // base-ui 变体：untrapped 且非 modal 时，焦点从 reference（combobox
          // input）Tab 离开不应关闭——React 版中该场景 Tab 落在 floating 内
          // （movedToUnrelatedNode=false 不关闭）；actview 版 DOM 顺序使 Tab
          // 落在 floating 前/后的外部兄弟上，这里对齐 React 版语义不关闭。
          if (
            (isUntrappedTypeableCombobox.value
              ? !(currentTarget === domReference.value && !modal.value)
              : !modal.value) &&
            relatedTarget &&
            movedToUnrelatedNode &&
            !isPointerDownRef.value &&
            // Fix React 18 Strict Mode returnFocus due to double rendering.
            // 未受陷的 typeable combobox 第二次 Tab 序列也要关闭（React 版
            // 行为：相关元素为先前已聚焦元素时仍允许关闭）。
            (isUntrappedTypeableCombobox.value ||
              relatedTarget !== getPreviouslyFocusedElement())
          ) {
            preventReturnFocusRef.value = true;
            onOpenChange(false, event, 'focus-out');
          }
        });
      }

      const shouldHandleBlurCapture = Boolean(!tree && portalContext);

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
    () => portalContext?.beforeInsideRef,
  ]);
  const mergedAfterGuardRef = useLiteMergeRefs([
    afterGuardRef,
    () => portalContext?.afterInsideRef,
  ]);

  // React 版 effect：markOthers（inert / aria-hidden）
  let cleanupMarkOthers: (() => void) | undefined;
  watch(
    [domReference, floating, portalContext],
    () => {
      cleanupMarkOthers?.();
      cleanupMarkOthers = undefined;

      if (disabled.value) return;
      if (!floating.value) return;

      // Don't hide portals nested within the parent portal.
      const portalNodes = Array.from(
        portalContext?.portalNode?.querySelectorAll(
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
        portalContext?.beforeOutsideRef.value,
        portalContext?.afterOutsideRef.value,
        orderRef.value.includes('reference') ||
        isUntrappedTypeableCombobox.value
          ? domReference.value
          : null,
      ].filter((x): x is Element => x != null);

      cleanupMarkOthers =
        modal.value || isUntrappedTypeableCombobox.value
          ? markOthers(insideElements, !useInert.value, useInert.value)
          : markOthers(insideElements);
    },
  );

  // React 版 `useModernLayoutEffect`：初始 focus
  // 依赖含 disabled：React 版 effect 依赖 disabled，disabled 变化（如
  // keepMounted 场景 disabled={!open}）需重新评估初始聚焦。
  watch(
    [open, floatingFocusElement, disabled],
    () => {
      if (disabled.value || !isHTMLElement(floatingFocusElement.value)) return;

      const doc = getDocument(floatingFocusElement.value);
      const previouslyFocusedElement = activeElement(doc);

      // Wait for any layout effect state setters to execute to set `tabIndex`.
      queueMicrotask(() => {
        const focusableElements = getTabbableElements(
          floatingFocusElement.value,
        );
        const initialFocusValue = initialFocusRef.value as any;
        // actview core 无 React 的 autoFocus 机制：显式尊重 `[autofocus]` 元素
        // （React 版靠 autoFocus 已在 commit 聚焦 + focusAlreadyInside 检查）。
        // 仅在未显式指定 initialFocus（默认行为，React 版等价 initialFocus=true）
        // 时优先 autofocus 元素；显式指定（number/Ref/函数）时尊重显式目标。
        // 注意：必须先于 number 分支解析（number 0 会短路 `elToFocus ||`）。
        let elToFocus: FocusableElement | null | undefined =
          props.initialFocus === undefined
            ? (floating.value?.querySelector(
                '[autofocus]',
              ) as FocusableElement | null)
            : null;
        if (!elToFocus && typeof initialFocusValue === 'number') {
          elToFocus = focusableElements[initialFocusValue];
        } else if (typeof initialFocusValue === 'function') {
          elToFocus = initialFocusValue('') || null;
        } else if (
          initialFocusValue &&
          typeof initialFocusValue === 'object' &&
          '__v_isRef' in initialFocusValue
        ) {
          elToFocus = initialFocusValue.value;
        }
        elToFocus =
          elToFocus || focusableElements[0] || floatingFocusElement.value;
        // React 版用打开时的快照 `previouslyFocusedElement` 判断，但 actview 的
        // watch 触发顺序与 React 的 layout effect 相反（父先子后）：useListNavigation
        // 的 focusItem 可能已在本微任务前聚焦了列表项。这里用实时 activeElement 检查，
        // 若焦点已在 floating 内（如列表导航已聚焦），则不重复抢焦。
        const focusAlreadyInsideFloatingEl = contains(
          floatingFocusElement.value,
          activeElement(doc),
        );

        if (!ignoreInitialFocus.value && !focusAlreadyInsideFloatingEl && open.value) {
          enqueueFocus(elToFocus, {
            preventScroll: elToFocus === floatingFocusElement.value,
          });
        }
      });
    },
    {immediate: true},
  );

  // React 版 `useModernLayoutEffect`：returnFocus 管理
  // 依赖含 disabled：disabled 变化（keepMounted 场景 disabled={!open}）时
  // React 版 effect 重跑并执行旧 cleanup（returnFocus）。actview 的 disabled
  // 同步 watch 与 returnFocus watch 同属 pre flush，顺序不保证——disabled
  // 变化必须显式触发本 watch，否则打开时 disabled 尚未同步导致 cleanup 未注册。
  let cleanupReturnFocus: (() => void) | undefined;
  watch(
    [open, floatingFocusElement, domReference, disabled],
    () => {
      cleanupReturnFocus?.();
      cleanupReturnFocus = undefined;

      if (disabled.value || !floatingFocusElement.value) return;

      // 对齐 React 版（打开 effect 里 `closeTypeRef.current = ''`）：
      // 每次打开时重置 closeType。keepMounted 场景下打开的 emit 可能在
      // 本 watch 注册 events.on 之前到达（disabled prop 同步滞后），若依赖
      // onOpenChange 重置会残留上一次关闭的 closeType（如 'keyboard'）。
      if (open.value) {
        closeTypeRef.value = '';
      }

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
        closeTypeRef.value = getCloseType(event);

        if (open) {
          // 重新打开时重置 close modality（React 版在 cleanup 的
          // queueMicrotask 无条件重置；actview 版 cleanup 可能多次执行，
          // 改为打开时重置，避免重复 cleanup 用已重置的 false 抢回焦点）。
          preventReturnFocusRef.value = false;
        }

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
      // returnFocus 为函数时不插入 fallback（React 版行为：函数返回 falsy 时
      // 既不聚焦也不插入兜底元素）。
      if (
        isInsidePortal.value &&
        domReference.value &&
        typeof returnFocusRef.value !== 'function'
      ) {
        domReference.value.insertAdjacentElement('afterend', fallbackEl);
      }

      // base-ui 变体：returnFocus 支持函数（closeType）→ 返回值解析；
      // 函数返回 undefined/false 返回 null（不聚焦）。
      function getReturnElement() {
        const value = returnFocusRef.value;
        let resolved: any =
          typeof value === 'function' ? value(closeTypeRef.value) : value;

        if (resolved === undefined || resolved === false) {
          return null;
        }

        if (resolved === null) {
          resolved = true;
        }

        const refEl =
          resolved && typeof resolved === 'object' && '__v_isRef' in resolved
            ? (resolved as unknown as Ref<HTMLElement | null>).value
            : resolved;

        if (typeof resolved === 'boolean') {
          const el = domReference.value || getPreviouslyFocusedElement();
          return el && el.isConnected ? el : fallbackEl;
        }

        return (
          (refEl as HTMLElement | null) ||
          (domReference.value || getPreviouslyFocusedElement()) ||
          fallbackEl
        );
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
        const hasExplicitReturnFocus =
          typeof returnFocusRef.value !== 'boolean';

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
            (!hasExplicitReturnFocus &&
            tabbableReturnElement !== activeEl &&
            activeEl !== doc.body
              ? isFocusInsideFloatingTree
              : true)
          ) {
            const focusOptions: FocusOptions = {preventScroll: true};
            // 键盘关闭时显式 focusVisible（React 版行为）。
            if (closeTypeRef.value === 'keyboard') {
              (focusOptions as Record<string, unknown>).focusVisible = true;
            }
            tabbableReturnElement.focus(focusOptions);
          }

          fallbackEl.remove();
        });
      };
    },
  );

  // React 版 effect [disabled]：preventReturnFocus 重置。
  // disabled 变化时重置 preventReturnFocus（React 版 effect 依赖 disabled 重跑）；
  // 否则 keepMounted 场景下 tab 移出关闭设置的 preventReturnFocus=true 会一直
  // 残留，导致后续 Escape 关闭时 returnFocus 被跳过。
  watch(
    disabled,
    () => {
      queueMicrotask(() => {
        preventReturnFocusRef.value = false;
      });
    },
    {immediate: true},
  );

  // React 版 `useModernLayoutEffect`：同步 context & modal 到 FloatingPortal
  // 注意：open 在 FFM 挂载前已为 true，watch 无 immediate 时首次不触发，
  // FloatingPortal 的 focusManagerState 保持 null（owner/guard 不渲染）。
  watch(
    [portalContext, open, domReference],
    () => {
      if (disabled.value) return;
      const currentPortal = portalContext;
      if (!currentPortal) return;

      currentPortal.setFocusManagerState({
        modal: modal.value,
        closeOnFocusOut: closeOnFocusOut.value,
        open: open.value,
        onOpenChange,
        domReference: domReference.value,
      });

      onWatcherCleanup(() => {
        currentPortal.setFocusManagerState(null);
      });
    },
    {immediate: true},
  );

  // React 版 `useModernLayoutEffect`：handleTabIndex
  // 依赖含 disabled：disabled 变化（keepMounted 场景）时需重设 tabIndex，
  // 否则聚焦 floating（无 tabIndex 的 div）在 jsdom 下无效。
  watch(
    [floatingFocusElement, disabled],
    () => {
      if (disabled.value) return;
      if (!floatingFocusElement.value) return;
      handleTabIndex(floatingFocusElement.value, orderRef);
    },
    {immediate: true},
  );

  const shouldRenderGuards = computed(
    () =>
      !disabled.value &&
      guards.value &&
      (modal.value ? !isUntrappedTypeableCombobox.value : true) &&
      (isInsidePortal.value || modal.value),
  );

  function renderDismissButton(location: 'start' | 'end') {
    if (disabled.value || !visuallyHiddenDismiss.value || !modal.value) {
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
            if (modal.value) {
              const els = getTabbableElements();
              enqueueFocus(
                order.value[0] === 'reference' ? els[0] : els[els.length - 1],
              );
            } else if (
              portalContext?.preserveTabOrder &&
              portalContext.portalNode
            ) {
              preventReturnFocusRef.value = false;
              if (
                isOutsideEvent(
                  event,
                  portalContext.portalNode ?? undefined,
                )
              ) {
                const nextTabbable = getNextTabbable(domReference.value);
                nextTabbable?.focus();
              } else {
                portalContext.beforeOutsideRef.value?.focus();
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
      {props.children}
      {renderDismissButton('end')}
      {shouldRenderGuards.value && (
        <FocusGuard
          data-type="inside"
          ref={mergedAfterGuardRef}
          onFocus={(event: FocusEvent) => {
            if (modal.value) {
              enqueueFocus(getTabbableElements()[0]);
            } else if (
              portalContext?.preserveTabOrder &&
              portalContext.portalNode
            ) {
              if (closeOnFocusOut.value) {
                preventReturnFocusRef.value = true;
              }

              if (
                isOutsideEvent(
                  event,
                  portalContext.portalNode ?? undefined,
                )
              ) {
                const prevTabbable = getPreviousTabbable(domReference.value);
                prevTabbable?.focus();
              } else {
                portalContext.afterOutsideRef.value?.focus();
              }
            }
          }}
        />
      )}
    </>
  );
});
