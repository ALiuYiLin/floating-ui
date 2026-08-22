import {computed, createContext, defineComponent, onUnmounted, ref, watch, type Ref} from '@actview/core';

/**
 * actview 版（upstream 为 React 组件/hooks）。
 *
 * 与 upstream 的差异：
 * - `React.createContext` → actview 官方 `createContext`（`.use()` 返回 `Ref<T>`）
 * - `React.useState(Set)` → `ref(new Set())`（.value 替换触发渲染）
 * - `useMemo(map)` → `computed`（nodes 变化时重建 Map）
 * - `useListItem` 的 `index` 返回 `Ref<number>`（渲染期读 `.value`）；
 *   `elementsRef` / `labelsRef` 为 `Ref<Array<...>>`（.value）
 * - `useModernLayoutEffect` → `watch`（componentRef / map 变化时注册与同步）
 */

function sortByDocumentPosition(a: Node, b: Node) {
  const position = a.compareDocumentPosition(b);

  if (
    position & Node.DOCUMENT_POSITION_FOLLOWING ||
    position & Node.DOCUMENT_POSITION_CONTAINED_BY
  ) {
    return -1;
  }

  if (
    position & Node.DOCUMENT_POSITION_PRECEDING ||
    position & Node.DOCUMENT_POSITION_CONTAINS
  ) {
    return 1;
  }

  return 0;
}

interface FloatingListContextValue {
  register: (node: Node) => void;
  unregister: (node: Node) => void;
  map: Map<Node, number | null>;
  elementsRef: Ref<Array<HTMLElement | null>>;
  labelsRef?: Ref<Array<string | null>> | undefined;
}

export const FloatingListContext = createContext<FloatingListContextValue>({
  register: () => {},
  unregister: () => {},
  map: new Map(),
  elementsRef: ref<Array<HTMLElement | null>>([]),
});

interface FloatingListProps {
  children?: any;
  /**
   * A ref to the list of HTML elements, ordered by their index.
   * `useListNavigation`'s `listRef` prop.
   */
  elementsRef: Ref<Array<HTMLElement | null>>;
  /**
   * A ref to the list of element labels, ordered by their index.
   * `useTypeahead`'s `listRef` prop.
   */
  labelsRef?: Ref<Array<string | null>> | undefined;
}

/**
 * Provides context for a list of items within the floating element.
 * @see https://floating-ui.com/docs/FloatingList
 */
export const FloatingList = defineComponent(function (
  props: FloatingListProps,
) {
  const nodes = ref(new Set<Node>());

  const register = (node: Node) => {
    nodes.value = new Set(nodes.value).add(node);
  };

  const unregister = (node: Node) => {
    const set = new Set(nodes.value);
    set.delete(node);
    nodes.value = set;
  };

  const map = computed(() => {
    const newMap = new Map<Node, number>();
    const sortedNodes = Array.from(nodes.value.keys()).sort(
      sortByDocumentPosition,
    );

    sortedNodes.forEach((node, index) => {
      newMap.set(node, index);
    });

    return newMap;
  });

  const contextValue = computed<FloatingListContextValue>(() => ({
    register,
    unregister,
    map: map.value,
    elementsRef: props.elementsRef,
    labelsRef: props.labelsRef,
  }));

  return () => (
    <FloatingListContext.Provider value={contextValue.value}>
      {props.children}
    </FloatingListContext.Provider>
  );
});

export interface UseListItemProps {
  label?: string | null | undefined;
}

/**
 * Used to register a list item and its index (DOM position) in the
 * `FloatingList`.
 * @see https://floating-ui.com/docs/FloatingList#uselistitem
 */
export function useListItem(props: UseListItemProps = {}): {
  ref: (node: HTMLElement | null) => void;
  index: Ref<number>;
} {
  const {label} = props;

  const listContext = FloatingListContext.use();

  const indexRef = ref<number | null>(null);
  const componentRef = ref<Node | null>(null);

  const itemRef = (node: HTMLElement | null) => {
    componentRef.value = node;

    const index = indexRef.value;
    if (index !== null) {
      listContext.value.elementsRef.value[index] = node;
      if (listContext.value.labelsRef) {
        const isLabelDefined = label !== undefined;
        listContext.value.labelsRef.value[index] = isLabelDefined
          ? label
          : node?.textContent ?? null;
      }
    }
  };

  // React 版 `useModernLayoutEffect`：[register, unregister] → 挂载注册。
  // onUnmounted 必须在 setup 同步调用（watch 回调无组件实例上下文），
  // 用闭包变量记录已注册节点。
  let registeredNode: Node | null = null;
  watch(
    () => componentRef.value,
    () => {
      const node = componentRef.value;
      if (node) {
        listContext.value.register(node);
        registeredNode = node;
      }
    },
  );
  onUnmounted(() => {
    if (registeredNode) {
      listContext.value.unregister(registeredNode);
    }
  });

  // React 版 `useModernLayoutEffect`：[map] → 同步 index。
  // React 版靠「ref 回调依赖 index state、依赖变化时 React 重新调用 ref(null)+ref(node)」
  // 写入 elementsRef；actview 的 ref 回调是固定函数不会重建，这里在 index 就绪后
  // 主动同步 elementsRef / labelsRef。
  watch(
    () => listContext.value.map,
    () => {
      const node = componentRef.value;
      const index = node ? listContext.value.map.get(node) : null;
      if (index != null) {
        indexRef.value = index;
        listContext.value.elementsRef.value[index] = node;
        if (listContext.value.labelsRef) {
          const isLabelDefined = label !== undefined;
          listContext.value.labelsRef.value[index] = isLabelDefined
            ? label
            : node?.textContent ?? null;
        }
      }
    },
  );

  return {
    ref: itemRef,
    index: computed(() => (indexRef.value == null ? -1 : indexRef.value)),
  };
}
