import {
  computed,
  createContext,
  defineComponent,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from '@actview/core';
import {useId} from '../hooks/useId';
import type {FloatingNodeType, FloatingTreeType, ReferenceType} from '../types';
import {createEventEmitter} from '../utils/createEventEmitter';

/**
 * actview 版（upstream 为 React 组件/hooks）。
 *
 * 与 upstream 的差异：
 * - `React.createContext` → actview 官方 `createContext`（`.Provider` / `.use()`，
 *   `use()` 返回 `Ref<T>`）
 * - `useFloatingNodeId` 返回 `Ref<string | undefined>`（渲染期读 `.value`）
 * - 组件用 actview `defineComponent` + render 闭包（JSX 来自 @actview/jsx）
 * - `React.useRef` → `ref()`；`useCallback` → 普通函数；`useModernLayoutEffect` → `watch`
 */

const FloatingNodeContext = createContext<FloatingNodeType | null>(null);
const FloatingTreeContext = createContext<FloatingTreeType | null>(null);

/**
 * Returns the parent node id for nested floating elements, if available.
 * Returns `null` for top-level floating elements.
 */
export const useFloatingParentNodeId = (): string | null =>
  FloatingNodeContext.use().value?.id || null;

/**
 * Returns the nearest floating tree context, if available.
 */
export const useFloatingTree = <
  RT extends ReferenceType = ReferenceType,
>(): FloatingTreeType<RT> | null =>
  FloatingTreeContext.use().value as FloatingTreeType<RT> | null;

/**
 * Registers a node into the `FloatingTree`, returning its id.
 * @see https://floating-ui.com/docs/FloatingTree
 */
export function useFloatingNodeId(
  customParentId?: string,
): Ref<string | undefined> {
  const id = useId();
  const tree = useFloatingTree();
  const nodeContext = FloatingNodeContext.use();
  const parentId = computed(
    () => customParentId || nodeContext.value?.id || null,
  );

  let added = false;
  watch(id, () => {
    if (!id.value || added) return;
    const node = {id: id.value, parentId: parentId.value};
    tree?.addNode(node);
    added = true;
    onUnmounted(() => {
      tree?.removeNode(node);
    });
  });

  return id;
}

export interface FloatingNodeProps {
  children?: any;
  id: string | undefined;
}

/**
 * Provides parent node context for nested floating elements.
 * @see https://floating-ui.com/docs/FloatingTree
 */
export const FloatingNode = defineComponent(function (
  props: FloatingNodeProps,
) {
  const nodeContext = FloatingNodeContext.use();
  const parentId = computed(() => nodeContext.value?.id || null);

  return () => (
    <FloatingNodeContext.Provider
      value={{id: props.id, parentId: parentId.value}}
    >
      {props.children}
    </FloatingNodeContext.Provider>
  );
});

export interface FloatingTreeProps {
  children?: any;
}

/**
 * Provides context for nested floating elements when they are not children of
 * each other on the DOM.
 * This is not necessary in all cases, except when there must be explicit communication between parent and child floating elements. It is necessary for:
 * - The `bubbles` option in the `useDismiss()` Hook
 * - Nested virtual list navigation
 * - Nested floating elements that each open on hover
 * - Custom communication between parent and child floating elements
 * @see https://floating-ui.com/docs/FloatingTree
 */
export const FloatingTree = defineComponent(function (
  props: FloatingTreeProps,
) {
  const nodesRef = ref<Array<FloatingNodeType>>([]);

  const addNode = (node: FloatingNodeType) => {
    nodesRef.value = [...nodesRef.value, node];
  };

  const removeNode = (node: FloatingNodeType) => {
    nodesRef.value = nodesRef.value.filter((n) => n !== node);
  };

  const events = createEventEmitter();

  return () => (
    <FloatingTreeContext.Provider
      value={{nodesRef, addNode, removeNode, events}}
    >
      {props.children}
    </FloatingTreeContext.Provider>
  );
});
