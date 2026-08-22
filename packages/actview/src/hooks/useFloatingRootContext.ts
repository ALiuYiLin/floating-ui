import {computed, ref, toValue, type Ref} from '@actview/core';
import {isElement} from '@floating-ui/utils/dom';
import {useEffectEvent} from '../utils';

import type {
  ContextData,
  FloatingRootContext,
  OpenChangeReason,
  ReferenceType,
} from '../types';
import {createEventEmitter} from '../utils/createEventEmitter';
import {useId} from './useId';
import {useFloatingParentNodeId} from '../components/FloatingTree';
import {error} from '../utils/log';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - `React.useRef` → `ref()`；`React.useState` → `ref()` / 直接创建
 * - `open` 为 `computed(() => toValue(options.open) ?? false)`——options.open
 *   支持 boolean 或 `Ref<boolean>`（useFloating 传 Ref 时响应式追踪）
 * - `elements` 字段为 `Ref`（reference / domReference 用 computed 派生，
 *   floating 固定为首次值——elementsProp 在 setup 解构固定）
 * - `useEffectEvent` 从 `../utils` 导入
 */

export interface UseFloatingRootContextOptions {
  open?: boolean | Ref<boolean> | undefined;
  onOpenChange?:
    | ((open: boolean, event?: Event, reason?: OpenChangeReason) => void)
    | undefined;
  elements: {
    reference: Element | null;
    floating: HTMLElement | null;
  };
}

export function useFloatingRootContext(
  options: UseFloatingRootContextOptions,
): FloatingRootContext {
  const {
    onOpenChange: onOpenChangeProp,
    elements: elementsProp,
  } = options;

  const floatingId = useId();
  const dataRef = ref<ContextData>({});
  const events = createEventEmitter();
  const nested = useFloatingParentNodeId() != null;

  if (__DEV__) {
    const optionDomReference = toValue(elementsProp.reference);
    if (optionDomReference && !isElement(optionDomReference)) {
      error(
        'Cannot pass a virtual element to the `elements.reference` option,',
        'as it must be a real DOM element. Use `refs.setPositionReference()`',
        'instead.',
      );
    }
  }

  const open = computed(() => toValue(options.open) ?? false);

  const positionReference = ref<ReferenceType | null>(
    toValue(elementsProp.reference),
  );

  const onOpenChange = useEffectEvent(
    (open: boolean, event?: Event, reason?: OpenChangeReason) => {
      dataRef.value.openEvent = open ? event : undefined;
      events.emit('openchange', {open, event, reason, nested});
      onOpenChangeProp?.(open, event, reason);
    },
  );

  const refs = {
    setPositionReference: (node: ReferenceType | null) => {
      positionReference.value = node;
    },
  };

  // elements 选项支持 Ref：测试/调用方可以传响应式元素（如 ref 回调设置的元素）
  const elements = {
    reference: computed(
      () => positionReference.value || toValue(elementsProp.reference) || null,
    ),
    floating: computed(() => toValue(elementsProp.floating) || null),
    domReference: computed(() => toValue(elementsProp.reference) || null),
  };

  return {
    dataRef,
    open,
    onOpenChange,
    elements,
    events,
    floatingId,
    refs,
  };
}
