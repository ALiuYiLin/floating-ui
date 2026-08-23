import type {Ref} from '@actview/core';
import {floor} from '@floating-ui/utils';

import type {Dimensions} from '../types';
import {stopEvent} from '../utils/event';
import {ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, ARROW_UP} from './constants';

// actview: `React.MutableRefObject<T>` → actview 框架类型 `Ref<T>`（.value）、
// `React.KeyboardEvent` → `KeyboardEventLike`（结构类型，无 React 依赖）
type ListRef = Ref<Array<HTMLElement | null>>;

interface KeyboardEventLike {
  key: string;
  preventDefault(): void;
  stopPropagation(): void;
}

export type DisabledIndices = Array<number> | ((index: number) => boolean);

export function isDifferentGridRow(
  index: number,
  cols: number,
  prevRow: number,
) {
  return Math.floor(index / cols) !== prevRow;
}

export function isIndexOutOfListBounds(
  listRef: ListRef,
  index: number,
) {
  return index < 0 || index >= listRef.value.length;
}

export function getMinListIndex(
  listRef: ListRef,
  disabledIndices?: DisabledIndices | undefined,
) {
  return findNonDisabledListIndex(listRef, {disabledIndices});
}

export function getMaxListIndex(
  listRef: ListRef,
  disabledIndices?: DisabledIndices | undefined,
) {
  return findNonDisabledListIndex(listRef, {
    decrement: true,
    startingIndex: listRef.value.length,
    disabledIndices,
  });
}

export function findNonDisabledListIndex(
  listRef: ListRef,
  {
    startingIndex = -1,
    decrement = false,
    disabledIndices,
    amount = 1,
  }: {
    startingIndex?: number | undefined;
    decrement?: boolean | undefined;
    disabledIndices?: DisabledIndices | undefined;
    amount?: number | undefined;
  } = {},
): number {
  let index = startingIndex;
  do {
    index += decrement ? -amount : amount;
  } while (
    index >= 0 &&
    index <= listRef.value.length - 1 &&
    isListIndexDisabled(listRef, index, disabledIndices)
  );

  return index;
}

export function getGridNavigatedIndex(
  listRef: ListRef,
  {
    event,
    orientation,
    loop,
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
    rtl: boolean;
    cols: number;
    disabledIndices: DisabledIndices | undefined;
    minIndex: number;
    maxIndex: number;
    prevIndex: number;
    stopEvent?: boolean | undefined;
  },
) {
  let nextIndex = prevIndex;

  if (event.key === ARROW_UP) {
    stop && stopEvent(event);

    if (prevIndex === -1) {
      nextIndex = maxIndex;
    } else {
      nextIndex = findNonDisabledListIndex(listRef, {
        startingIndex: nextIndex,
        amount: cols,
        decrement: true,
        disabledIndices,
      });

      if (loop && (prevIndex - cols < minIndex || nextIndex < 0)) {
        const col = prevIndex % cols;
        const maxCol = maxIndex % cols;
        const offset = maxIndex - (maxCol - col);

        if (maxCol === col) {
          nextIndex = maxIndex;
        } else {
          nextIndex = maxCol > col ? offset : offset - cols;
        }
      }
    }

    if (isIndexOutOfListBounds(listRef, nextIndex)) {
      nextIndex = prevIndex;
    }
  }

  if (event.key === ARROW_DOWN) {
    stop && stopEvent(event);

    if (prevIndex === -1) {
      nextIndex = minIndex;
    } else {
      nextIndex = findNonDisabledListIndex(listRef, {
        startingIndex: prevIndex,
        amount: cols,
        disabledIndices,
      });

      if (loop && prevIndex + cols > maxIndex) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: (prevIndex % cols) - cols,
          amount: cols,
          disabledIndices,
        });
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
      stop && stopEvent(event);

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
        }
      } else if (loop) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex - (prevIndex % cols) - 1,
          disabledIndices,
        });
      }

      if (isDifferentGridRow(nextIndex, cols, prevRow)) {
        nextIndex = prevIndex;
      }
    }

    if (event.key === (rtl ? ARROW_RIGHT : ARROW_LEFT)) {
      stop && stopEvent(event);

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
        }
      } else if (loop) {
        nextIndex = findNonDisabledListIndex(listRef, {
          startingIndex: prevIndex + (cols - (prevIndex % cols)),
          decrement: true,
          disabledIndices,
        });
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
      } else {
        nextIndex = prevIndex;
      }
    }
  }

  return nextIndex;
}

/** For each cell index, gets the item index that occupies that cell */
export function createGridCellMap(
  sizes: Dimensions[],
  cols: number,
  dense: boolean,
) {
  const cellMap: (number | undefined)[] = [];
  let startIndex = 0;
  sizes.forEach(({width, height}, index) => {
    if (width > cols) {
      if (__DEV__) {
        throw new Error(
          `[Floating UI]: Invalid grid - item width at index ${index} is greater than grid columns`,
        );
      }
    }
    let itemPlaced = false;
    if (dense) {
      startIndex = 0;
    }
    while (!itemPlaced) {
      const targetCells: number[] = [];
      for (let i = 0; i < width; i++) {
        for (let j = 0; j < height; j++) {
          targetCells.push(startIndex + i + j * cols);
        }
      }
      if (
        (startIndex % cols) + width <= cols &&
        targetCells.every((cell) => cellMap[cell] == null)
      ) {
        targetCells.forEach((cell) => {
          cellMap[cell] = index;
        });
        itemPlaced = true;
      } else {
        startIndex++;
      }
    }
  });

  // convert into a non-sparse array
  return [...cellMap];
}

/** Gets cell index of an item's corner or -1 when index is -1. */
export function getGridCellIndexOfCorner(
  index: number,
  sizes: Dimensions[],
  cellMap: (number | undefined)[],
  cols: number,
  corner: 'tl' | 'tr' | 'bl' | 'br',
) {
  if (index === -1) return -1;

  const firstCellIndex = cellMap.indexOf(index);
  const sizeItem = sizes[index];

  switch (corner) {
    case 'tl':
      return firstCellIndex;
    case 'tr':
      if (!sizeItem) {
        return firstCellIndex;
      }
      return firstCellIndex + sizeItem.width - 1;
    case 'bl':
      if (!sizeItem) {
        return firstCellIndex;
      }
      return firstCellIndex + (sizeItem.height - 1) * cols;
    case 'br':
      return cellMap.lastIndexOf(index);
  }
}

/** Gets all cell indices that correspond to the specified indices */
export function getGridCellIndices(
  indices: (number | undefined)[],
  cellMap: (number | undefined)[],
) {
  return cellMap.flatMap((index, cellIndex) =>
    indices.includes(index) ? [cellIndex] : [],
  );
}

export function isListIndexDisabled(
  listRef: ListRef,
  index: number,
  disabledIndices?: DisabledIndices,
) {
  const isExplicitlyDisabled =
    typeof disabledIndices === 'function'
      ? disabledIndices(index)
      : (disabledIndices?.includes(index) ?? false);

  if (isExplicitlyDisabled) {
    return true;
  }

  const element = listRef.value[index];
  if (!element) {
    return false;
  }

  if (!isElementVisible(element)) {
    return true;
  }

  // A natively disabled element can never receive focus, so it must always be
  // skipped, even when `disabledIndices` marks it as enabled. Only
  // `aria-disabled` items can be focusable-while-disabled.
  if (element.matches(':disabled')) {
    return true;
  }

  // base-ui 语义：只有未显式传入 disabledIndices 时才检查属性
  // （disabled/aria-disabled）。initial sync 故意不传 disabledIndices
  // （mui/base-ui#2604），使属性禁用的项在打开时也被跳过；导航时传入
  // disabledIndices 数组，由数组控制（aria-disabled 项可聚焦）。
  return (
    !disabledIndices &&
    (element.hasAttribute('disabled') ||
      element.getAttribute('aria-disabled') === 'true')
  );
}

export function isHiddenByStyles(styles: CSSStyleDeclaration) {
  return styles.visibility === 'hidden' || styles.visibility === 'collapse';
}

export function isElementVisible(
  element: Element | null,
  styles: CSSStyleDeclaration | null = element
    ? getComputedStyle(element)
    : null,
) {
  if (!element || !element.isConnected || !styles || isHiddenByStyles(styles)) {
    return false;
  }

  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility();
  }

  return styles.display !== 'none' && styles.display !== 'contents';
}
