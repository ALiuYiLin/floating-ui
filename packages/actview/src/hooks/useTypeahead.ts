import {onUnmounted, ref, toValue, watch, type Ref} from '@actview/core';
import {
  useEffectEvent,
  useLatestRef,
  stopEvent,
} from '../utils';

import type {ElementProps, FloatingRootContext} from '../types';
import {clearTimeoutIfSet} from '../utils/clearTimeoutIfSet';

/**
 * actview 版（upstream 为 React hook）。
 *
 * 与 upstream 的差异：
 * - `React.useRef` → `ref()`；`useModernLayoutEffect` → `watch`
 * - `activeIndex` / `selectedIndex` 接受 `Ref<number | null> | number | null`，
 *   内部用 `toValue` 统一读取（传入 Ref 时 watch 响应式同步 prevIndexRef）
 * - `listRef` 为 `Ref<Array<string | null>>`（.value）
 * - 无 React 合成事件：onKeyDown 参数为原生 KeyboardEvent
 * - `useEffectEvent` / `useLatestRef` / `stopEvent` 从 `../utils` 导入
 */

export interface UseTypeaheadProps {
  /**
   * A ref which contains an array of strings whose indices match the HTML
   * elements of the list.
   * @default empty list
   */
  listRef: Ref<Array<string | null>>;
  /**
   * The index of the active (focused or highlighted) item in the list.
   * @default null
   */
  activeIndex: Ref<number | null> | number | null;
  /**
   * Callback invoked with the matching index if found as the user types.
   */
  onMatch?: ((index: number) => void) | undefined;
  /**
   * Callback invoked with the typing state as the user types.
   */
  onTypingChange?: ((isTyping: boolean) => void) | undefined;
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: boolean | undefined;
  /**
   * A function that returns the matching string from the list.
   * @default lowercase-finder
   */
  findMatch?:
    | null
    | ((
        list: Array<string | null>,
        typedString: string,
      ) => string | null | undefined)
    | undefined;
  /**
   * The number of milliseconds to wait before resetting the typed string.
   * @default 750
   */
  resetMs?: number | undefined;
  /**
   * An array of keys to ignore when typing.
   * @default []
   */
  ignoreKeys?: Array<string> | undefined;
  /**
   * The index of the selected item in the list, if available.
   * @default null
   */
  selectedIndex?: Ref<number | null> | number | null | undefined;
}

/**
 * Provides a matching callback that can be used to focus an item as the user
 * types, often used in tandem with `useListNavigation()`.
 * @see https://floating-ui.com/docs/useTypeahead
 */
export function useTypeahead(
  context: FloatingRootContext,
  props: UseTypeaheadProps,
): ElementProps {
  const {open, dataRef} = context;
  const {
    listRef,
    activeIndex,
    onMatch: unstable_onMatch,
    onTypingChange: unstable_onTypingChange,
    enabled = true,
    findMatch = null,
    resetMs = 750,
    ignoreKeys = [],
    selectedIndex = null,
  } = props;

  const timeoutIdRef = ref(-1);
  const stringRef = ref('');
  const prevIndexRef = ref<number | null>(
    toValue(selectedIndex) ?? toValue(activeIndex) ?? -1,
  );
  const matchIndexRef = ref<number | null>(null);

  const onMatch = useEffectEvent(unstable_onMatch);
  const onTypingChange = useEffectEvent(unstable_onTypingChange);

  const findMatchRef = useLatestRef(findMatch);
  const ignoreKeysRef = useLatestRef(ignoreKeys);

  // React 版 `useModernLayoutEffect` [open]：打开时重置
  watch(open, () => {
    if (open.value) {
      clearTimeoutIfSet(timeoutIdRef);
      matchIndexRef.value = null;
      stringRef.value = '';
    }
  });

  // React 版 `useModernLayoutEffect` [open, selectedIndex, activeIndex]：
  // 同步 arrow key 导航（但不含 typeahead 导航）
  watch(
    () => [open.value, toValue(selectedIndex), toValue(activeIndex)],
    () => {
      if (open.value && stringRef.value === '') {
        prevIndexRef.value =
          toValue(selectedIndex) ?? toValue(activeIndex) ?? -1;
      }
    },
  );

  const setTypingChange = useEffectEvent((value: boolean) => {
    if (value) {
      if (!dataRef.value.typing) {
        dataRef.value.typing = value;
        onTypingChange(value);
      }
    } else {
      if (dataRef.value.typing) {
        dataRef.value.typing = value;
        onTypingChange(value);
      }
    }
  });

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    function getMatchingIndex(
      list: Array<string | null>,
      orderedList: Array<string | null>,
      string: string,
    ) {
      const str = findMatchRef.value
        ? findMatchRef.value(orderedList, string)
        : orderedList.find(
            (text) =>
              text
                ?.toLocaleLowerCase()
                .indexOf(string.toLocaleLowerCase()) === 0,
          );

      return str ? list.indexOf(str) : -1;
    }

    const listContent = listRef.value;

    if (stringRef.value.length > 0 && stringRef.value[0] !== ' ') {
      if (
        getMatchingIndex(listContent, listContent, stringRef.value) === -1
      ) {
        setTypingChange(false);
      } else if (event.key === ' ') {
        stopEvent(event);
      }
    }

    if (
      listContent == null ||
      ignoreKeysRef.value.includes(event.key) ||
      // Character key.
      event.key.length !== 1 ||
      // Modifier key.
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    if (open.value && event.key !== ' ') {
      stopEvent(event);
      setTypingChange(true);
    }

    // Bail out if the list contains a word like "llama" or "aaron". TODO:
    // allow it in this case, too.
    const allowRapidSuccessionOfFirstLetter = listContent.every((text) =>
      text
        ? text[0]?.toLocaleLowerCase() !== text[1]?.toLocaleLowerCase()
        : true,
    );

    // Allows the user to cycle through items that start with the same letter
    // in rapid succession.
    if (allowRapidSuccessionOfFirstLetter && stringRef.value === event.key) {
      stringRef.value = '';
      prevIndexRef.value = matchIndexRef.value;
    }

    stringRef.value += event.key;
    clearTimeoutIfSet(timeoutIdRef);
    timeoutIdRef.value = window.setTimeout(() => {
      stringRef.value = '';
      prevIndexRef.value = matchIndexRef.value;
      setTypingChange(false);
    }, resetMs);

    const prevIndex = prevIndexRef.value;

    const index = getMatchingIndex(
      listContent,
      [
        ...listContent.slice((prevIndex || 0) + 1),
        ...listContent.slice(0, (prevIndex || 0) + 1),
      ],
      stringRef.value,
    );

    if (index !== -1) {
      onMatch(index);
      matchIndexRef.value = index;
    } else if (event.key !== ' ') {
      stringRef.value = '';
      setTypingChange(false);
    }
  });

  // React 版 `useEffect`（卸载清理 timeout）
  onUnmounted(() => {
    clearTimeoutIfSet(timeoutIdRef);
  });

  const reference: ElementProps['reference'] = {onKeyDown};

  const floating: ElementProps['floating'] = {
    onKeyDown,
    onKeyUp(event: KeyboardEvent) {
      if (event.key === ' ') {
        setTypingChange(false);
      }
    },
  };

  return enabled ? {reference, floating} : {};
}
