import type {Ref} from '@actview/core';
import {floor} from '@floating-ui/utils';

import {
  findNonDisabledListIndex,
  isDifferentGridRow,
  isIndexOutOfListBounds,
  isListIndexDisabled,
  type DisabledIndices,
} from '../utils/composite';
import {ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, ARROW_UP} from '../utils/constants';
import {stopEvent} from '../utils/event';

// 移植自 base-ui 的 `packages/react/src/floating-ui-react/hooks/gridNavigation.ts`：
// base-ui 变体用注入式 grid 导航（`grid` 选项）替代上游的 `cols` 单元格映射，
// 支持 DOM 行结构检测（`role="row"`）、虚拟化间隙与部分行回退。
// actview 适配：`React.KeyboardEvent` → 结构类型 `KeyboardEventLike`、
// `React.RefObject` → actview `Ref<T>`（.value）、`loopFocus` → `loop`。

interface KeyboardEventLike {
  key: string;
  which: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}

type List = Array<HTMLElement | null>;
type ListRef = Ref<List>;

export function getGridNavigatedIndex(
  list: List,
  {
    event,
    orientation,
    loop,
    onLoop,
    rtl,
    cols,
    disabledIndices,
    minIndex,
    maxIndex,
    prevIndex,
    stopEvent: stop = false,
  }: {
    event: KeyboardEventLike;
    orientation: 'horizontal' | 'vertical' | 'both';
    loop: boolean;
    onLoop?:
      | ((
          event: KeyboardEventLike,
          prevIndex: number,
          nextIndex: number,
        ) => number)
      | undefined;
    rtl: boolean;
    cols: number;
    disabledIndices: DisabledIndices | undefined;
    minIndex: number;
    maxIndex: number;
    prevIndex: number;
    stopEvent?: boolean | undefined;
  },
) {
  // composite 的辅助函数收 actview Ref（.value）；这里是静态数组，用
  // 零开销别名即可（无需响应式包装）。
  const listRef = {value: list} as ListRef;

  let nextIndex = prevIndex;

  let verticalDirection: 'up' | 'down' | undefined;
  if (event.key === ARROW_UP) {
    verticalDirection = 'up';
  } else if (event.key === ARROW_DOWN) {
    verticalDirection = 'down';
  }

  if (verticalDirection) {
    // -------------------------------------------------------------------------
    // Detect row structure only when handling vertical navigation. This keeps
    // the non-vertical key paths free from row inference work.
    // -------------------------------------------------------------------------
    const rows: number[][] = [];
    const rowIndexMap: number[] = [];
    let hasRoleRow = false;
    let visibleItemCount = 0;
    {
      let currentRowEl: Element | null = null;
      let currentRowIndex = -1;

      list.forEach((el, idx) => {
        if (el == null) {
          return;
        }

        visibleItemCount += 1;

        const rowEl = el.closest('[role="row"]');
        if (rowEl) {
          hasRoleRow = true;
        }

        if (rowEl !== currentRowEl || currentRowIndex === -1) {
          currentRowEl = rowEl;
          currentRowIndex += 1;
          rows[currentRowIndex] = [];
        }
        rows[currentRowIndex].push(idx);
        rowIndexMap[idx] = currentRowIndex;
      });
    }

    let hasDomRows = false;
    let inferredDomCols = 0;

    if (hasRoleRow) {
      for (const row of rows) {
        const rowLength = row.length;

        if (rowLength > inferredDomCols) {
          inferredDomCols = rowLength;
        }

        if (rowLength !== cols) {
          hasDomRows = true;
        }
      }
    }

    const hasVirtualizedGaps = hasDomRows && visibleItemCount < list.length;
    const verticalCols = inferredDomCols || cols;

    const navigateVertically = (direction: 'up' | 'down') => {
      if (!hasDomRows || prevIndex === -1) {
        return undefined;
      }

      const currentRow = rowIndexMap[prevIndex];
      if (currentRow == null) {
        return undefined;
      }

      const colInRow = rows[currentRow].indexOf(prevIndex);
      const step = direction === 'up' ? -1 : 1;

      for (
        let nextRow = currentRow + step, i = 0;
        i < rows.length;
        i += 1, nextRow += step
      ) {
        if (nextRow < 0 || nextRow >= rows.length) {
          if (!loop || hasVirtualizedGaps) {
            return undefined;
          }
          nextRow = nextRow < 0 ? rows.length - 1 : 0;
          if (onLoop) {
            const clampedCol = Math.min(colInRow, rows[nextRow].length - 1);
            const targetItemIndex = rows[nextRow][clampedCol] ?? rows[nextRow][0];
            const returnedItemIndex = onLoop(event, prevIndex, targetItemIndex);
            nextRow = rowIndexMap[returnedItemIndex] ?? nextRow;
          }
        }

        const targetRow = rows[nextRow];
        for (
          let col = Math.min(colInRow, targetRow.length - 1);
          col >= 0;
          col -= 1
        ) {
          const candidate = targetRow[col];
          if (!isListIndexDisabled(listRef, candidate, disabledIndices)) {
            return candidate;
          }
        }
      }

      return undefined;
    };

    const navigateVerticallyWithInferredRows = (direction: 'up' | 'down') => {
      if (!hasVirtualizedGaps || prevIndex === -1) {
        return undefined;
      }

      const colInRow = prevIndex % verticalCols;
      const rowStep = direction === 'up' ? -verticalCols : verticalCols;
      const lastRowStart = maxIndex - (maxIndex % verticalCols);
      const rowCount = floor(maxIndex / verticalCols) + 1;

      for (
        let rowStart = prevIndex - colInRow + rowStep, i = 0;
        i < rowCount;
        i += 1, rowStart += rowStep
      ) {
        if (rowStart < 0 || rowStart > maxIndex) {
          if (!loop) {
            return undefined;
          }
          rowStart = rowStart < 0 ? lastRowStart : 0;
        }

        const rowEnd = Math.min(rowStart + verticalCols - 1, maxIndex);
        for (
          let candidate = Math.min(rowStart + colInRow, rowEnd);
          candidate >= rowStart;
          candidate -= 1
        ) {
          if (!isListIndexDisabled(listRef, candidate, disabledIndices)) {
            return candidate;
          }
        }
      }

      return undefined;
    };

    if (stop) {
      stopEvent(event as KeyboardEvent);
    }

    const verticalCandidate =
      navigateVertically(verticalDirection) ??
      navigateVerticallyWithInferredRows(verticalDirection);

    if (verticalCandidate !== undefined) {
      nextIndex = verticalCandidate;
    } else if (prevIndex === -1) {
      nextIndex = verticalDirection === 'up' ? maxIndex : minIndex;
    } else {
      nextIndex = findNonDisabledListIndex(listRef, {
        startingIndex: prevIndex,
        amount: verticalCols,
        decrement: verticalDirection === 'up',
        disabledIndices,
      });

      if (loop) {
        if (
          verticalDirection === 'up' &&
          (prevIndex - verticalCols < minIndex || nextIndex < 0)
        ) {
          const col = prevIndex % verticalCols;
          const maxCol = maxIndex % verticalCols;
          const offset = maxIndex - (maxCol - col);

          if (maxCol === col) {
            nextIndex = maxIndex;
          } else {
            nextIndex = maxCol > col ? offset : offset - verticalCols;
          }
          if (onLoop) {
            nextIndex = onLoop(event, prevIndex, nextIndex);
          }
        }

        if (
          verticalDirection === 'down' &&
          prevIndex + verticalCols > maxIndex
        ) {
          nextIndex = findNonDisabledListIndex(listRef, {
            startingIndex: (prevIndex % verticalCols) - verticalCols,
            amount: verticalCols,
            disabledIndices,
          });
          if (onLoop) {
            nextIndex = onLoop(event, prevIndex, nextIndex);
          }
        }
      }
    }

    if (isIndexOutOfListBounds(listRef, nextIndex)) {
      nextIndex = prevIndex;
    }
  }

  // Remains on the same row/column.
  if (orientation === 'both') {
    const prevRow = floor(prevIndex / cols);

    if (event.key === (rtl ? ARROW_LEFT : ARROW_RIGHT)) {
      if (stop) {
        stopEvent(event as KeyboardEvent);
      }

      if (prevIndex % cols !== cols - 1) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex,
          disabledIndices,
        });

        if (loop && isDifferentGridRow(nextIndex, cols, prevRow)) {
          nextIndex = findNonDisabledListIndex(listRef, {
            startingIndex: prevIndex - (prevIndex % cols) - 1,
            disabledIndices,
          });
          if (onLoop) {
            nextIndex = onLoop(event, prevIndex, nextIndex);
          }
        }
      } else if (loop) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex - (prevIndex % cols) - 1,
          disabledIndices,
        });
        if (onLoop) {
          nextIndex = onLoop(event, prevIndex, nextIndex);
        }
      }

      if (isDifferentGridRow(nextIndex, cols, prevRow)) {
        nextIndex = prevIndex;
      }
    }

    if (event.key === (rtl ? ARROW_RIGHT : ARROW_LEFT)) {
      if (stop) {
        stopEvent(event as KeyboardEvent);
      }

      if (prevIndex % cols !== 0) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex,
          decrement: true,
          disabledIndices,
        });

        if (loop && isDifferentGridRow(nextIndex, cols, prevRow)) {
          nextIndex = findNonDisabledListIndex(listRef, {
            startingIndex: prevIndex + (cols - (prevIndex % cols)),
            decrement: true,
            disabledIndices,
          });
          if (onLoop) {
            nextIndex = onLoop(event, prevIndex, nextIndex);
          }
        }
      } else if (loop) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex + (cols - (prevIndex % cols)),
          decrement: true,
          disabledIndices,
        });
        if (onLoop) {
          nextIndex = onLoop(event, prevIndex, nextIndex);
        }
      }

      if (isDifferentGridRow(nextIndex, cols, prevRow)) {
        nextIndex = prevIndex;
      }
    }

    const lastRow = floor(maxIndex / cols) === prevRow;

    if (isIndexOutOfListBounds(listRef, nextIndex)) {
      if (loop && lastRow) {
        nextIndex =
          event.key === (rtl ? ARROW_RIGHT : ARROW_LEFT)
            ? maxIndex
            : findNonDisabledListIndex(listRef, {
                startingIndex: prevIndex - (prevIndex % cols) - 1,
                disabledIndices,
              });
        if (onLoop) {
          nextIndex = onLoop(event, prevIndex, nextIndex);
        }
      } else {
        nextIndex = prevIndex;
      }
    }
  }

  return nextIndex;
}

/**
 * Positional arguments are deliberate: property names of an options object
 * don't minify, and the signature is locked to the caller via `typeof` on the
 * `grid` option of `useListNavigation`.
 *
 * The injected grid navigator only ever operates on a uniform 1x1 grid (sizes are
 * always `1x1` and packing is never dense), so the cell-map machinery that supports
 * multi-cell items collapses to an identity transform over the item list. Calling
 * `getGridNavigatedIndex` directly keeps the cell-map helpers out of
 * grid-combobox bundles.
 */
export function gridNavigation(
  event: KeyboardEventLike,
  prevIndex: number,
  listRef: ListRef,
  orientation: 'horizontal' | 'vertical' | 'both',
  loop: boolean,
  rtl: boolean,
  disabledIndices: DisabledIndices | undefined,
  minIndex: number,
  maxIndex: number,
  cols = 2,
): number | undefined {
  const nextIndex = getGridNavigatedIndex(listRef.value, {
    event,
    orientation,
    loop,
    rtl,
    cols,
    disabledIndices,
    minIndex,
    maxIndex,
    // An out-of-range previous index falls back to the first enabled item.
    prevIndex: prevIndex > maxIndex ? minIndex : prevIndex,
    stopEvent: true,
  });

  // `getGridNavigatedIndex` can return an out-of-bounds sentinel (e.g. `-1` when there is no
  // previous item to move from); surface that as `undefined` so the caller treats it as
  // "no navigation" rather than highlighting index `-1`.
  return isIndexOutOfListBounds(listRef, nextIndex)
    ? undefined
    : nextIndex;
}
