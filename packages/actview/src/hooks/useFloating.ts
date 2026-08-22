import {computed, ref, toValue, watch, type Ref} from '@actview/core';
import {isElement} from '@floating-ui/utils/dom';
import type {VirtualElement} from '@floating-ui/dom';

import {useFloatingTree} from '../components/FloatingTree';
import type {
  FloatingContext,
  NarrowedElement,
  ReferenceType,
  UseFloatingOptions,
  UseFloatingReturn,
} from '../types';
import {useFloating as usePosition, type UseFloatingOptions as PositionOptions} from '../useFloating';
import {useFloatingRootContext} from './useFloatingRootContext';

/**
 * actview 版（upstream 为 @floating-ui/react 的 useFloating）。
 *
 * 与 upstream 的差异：
 * - 定位核心直接调用 `@floating-ui/dom` 的 computePosition（actview 版
 *   `src/useFloating.ts`，无 @floating-ui/react-dom 依赖）
 * - `React.useState` → `ref()`；`useModernLayoutEffect` → `watch`
 * - `computedElements`（rootContext.elements）字段为 `Ref` → `.value` /
 *   直接传 Ref 给定位核心（内部 toValue）
 * - `nodeId` 支持 `string | Ref<string | undefined>`（toValue 读取）
 * - 无 React 合成事件 / useCallback / useMemo
 */

/**
 * Provides data to position a floating element and context to add interactions.
 * @see https://floating-ui.com/docs/useFloating
 */
export function useFloating<RT extends ReferenceType = ReferenceType>({
  elements: elementsOption,
  ...options
}: UseFloatingOptions<RT> = {}): UseFloatingReturn<RT> {
  const {nodeId} = options;

  const internalRootContext = useFloatingRootContext({
    ...options,
    elements: {
      reference: (elementsOption?.reference ?? null) as unknown as Element | null,
      floating: elementsOption?.floating ?? null,
    },
  });

  const rootContext = options.rootContext || internalRootContext;
  const computedElements = rootContext.elements;

  const _domReference = ref<NarrowedElement<RT> | null>(null);
  const positionReference = ref<ReferenceType | null>(null);

  const optionDomReference = computedElements?.domReference;
  const domReference = computed<Element | null>(
    () =>
      optionDomReference.value ||
      (_domReference.value as unknown as Element | null),
  );
  const domReferenceRef = ref<NarrowedElement<RT> | null>(null);

  const tree = useFloatingTree();

  // React 版 `useModernLayoutEffect` [domReference]：同步 domReferenceRef
  watch(
    domReference,
    () => {
      if (domReference.value) {
        domReferenceRef.value = domReference.value as NarrowedElement<RT>;
      }
    },
    {immediate: true},
  );

  const position = usePosition({
    ...options,
    elements: {
      ...computedElements,
      // positionReference 为 Ref：setPositionReference 更新后定位核心
      // 通过 toValue 追踪（外部 elements.reference 指定时的覆盖）
      ...(positionReference && {reference: positionReference}),
    },
  } as unknown as PositionOptions);

  const setPositionReference = (node: ReferenceType | null) => {
    const computedPositionReference = isElement(node)
      ? ({
          getBoundingClientRect: () => node.getBoundingClientRect(),
          getClientRects: () => node.getClientRects(),
          contextElement: node,
        } satisfies VirtualElement)
      : node;
    // Store the positionReference in state if the DOM reference is specified
    // externally via the `elements.reference` option. This ensures that it
    // won't be overridden on future renders.
    positionReference.value = computedPositionReference;
    position.refs.setReference(computedPositionReference);
  };

  const setReference = (node: RT | null) => {
    if (isElement(node) || node === null) {
      (domReferenceRef as Ref<Element | null>).value = node;
      _domReference.value = node as NarrowedElement<RT> | null;
    }

    // Backwards-compatibility for passing a virtual element to `reference`
    // after it has set the DOM reference.
    if (
      isElement(position.refs.reference.value) ||
      position.refs.reference.value === null ||
      // Don't allow setting virtual elements using the old technique back to
      // `null` to support `positionReference` + an unstable `reference`
      // callback ref.
      (node !== null && !isElement(node))
    ) {
      position.refs.setReference(node);
    }
  };

  const refs = {
    ...position.refs,
    setReference,
    setPositionReference,
    domReference: domReferenceRef,
  };

  const elements = {
    ...position.elements,
    domReference: domReference,
  };

  const context: FloatingContext<RT> = {
    ...position,
    ...rootContext,
    refs,
    elements,
    nodeId: computed(() => toValue(nodeId)),
  };

  // React 版（无依赖 layout effect）：同步 floatingContext 到 tree 节点
  watch(
    [rootContext.dataRef],
    () => {
      rootContext.dataRef.value.floatingContext = context;

      const node = tree?.nodesRef.value.find(
        (node) => node.id === toValue(nodeId),
      );
      if (node) {
        node.context = context;
      }
    },
    {immediate: true},
  );

  return {
    ...position,
    context,
    refs,
    elements,
  } as UseFloatingReturn<RT>;
}
