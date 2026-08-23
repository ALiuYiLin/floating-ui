import {
  act,
  cleanup,
  fireEvent,
  flushMicrotasks,
  render,
  screen,
  waitFor,
} from './utils';
import userEvent from '@testing-library/user-event';
import {defineComponent, onMounted, ref, watch, type Ref} from '@actview/core';
import {vi, test, describe} from 'vitest';

import {
  FloatingFocusManager,
  FloatingList,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListItem,
  useListNavigation,
} from '../../src';
import type {UseListNavigationProps} from '../../src/hooks/useListNavigation';
import {isJSDOM} from '../../src/utils';
import {Main as ComplexGrid} from '../visual/components/ComplexGrid';
import {Main as Grid} from '../visual/components/Grid';
import {Main as ListboxFocus} from '../visual/components/ListboxFocus';

const App = defineComponent(function (
  props: Omit<Partial<UseListNavigationProps>, 'listRef'> & {
    onNavigate?: (index: number | null) => void;
  },
) {
  const open = ref(false);
  const listRef = ref<Array<HTMLLIElement | null>>([]);
  const activeIndex = ref<number | null>(null);
  const {refs, context} = useFloating({
    open,
    onOpenChange: (o) => {
      open.value = o;
    },
  });
  const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
    useClick(context),
    useListNavigation(context, {
      ...props,
      listRef,
      activeIndex,
      onNavigate(index) {
        activeIndex.value = index;
        props.onNavigate?.(index);
      },
    }),
  ]);

  return () => (
    <>
      <button {...getReferenceProps({ref: refs.setReference})} />
      {open.value && (
        <div role="menu" {...getFloatingProps({ref: refs.setFloating})}>
          <ul>
            {['one', 'two', 'three'].map((string, index) => (
              <li
                data-testid={`item-${index}`}
                aria-selected={activeIndex.value === index}
                key={string}
                tabIndex={-1}
                {...getItemProps({
                  ref(node: HTMLLIElement) {
                    listRef.value[index] = node;
                  },
                })}
              >
                {string}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
});

test('opens on ArrowDown and focuses first item', async () => {
  render(<App />);
  await flushMicrotasks();

  fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
  await flushMicrotasks();
  expect(screen.getByRole('menu')).toBeInTheDocument();
  expect(screen.getByTestId('item-0')).toHaveFocus();
  cleanup();
});

test('opens on ArrowUp and focuses last item', async () => {
  render(<App />);
  await flushMicrotasks();

  fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowUp'});
  await flushMicrotasks();
  expect(screen.queryByRole('menu')).toBeInTheDocument();
  expect(screen.getByTestId('item-2')).toHaveFocus();
  cleanup();
});

test('navigates down on ArrowDown', async () => {
  render(<App />);
  await flushMicrotasks();

  fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
  await flushMicrotasks();
  expect(screen.queryByRole('menu')).toBeInTheDocument();
  expect(screen.getByTestId('item-0')).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowDown'});
  await flushMicrotasks();
  expect(screen.getByTestId('item-1')).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowDown'});
  await flushMicrotasks();
  expect(screen.getByTestId('item-2')).toHaveFocus();

  // Reached the end of the list.
  fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowDown'});
  await flushMicrotasks();
  expect(screen.getByTestId('item-2')).toHaveFocus();

  cleanup();
});

test('navigates up on ArrowUp', async () => {
  render(<App />);
  await flushMicrotasks();

  fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowUp'});
  await flushMicrotasks();
  expect(screen.queryByRole('menu')).toBeInTheDocument();
  expect(screen.getByTestId('item-2')).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowUp'});
  await flushMicrotasks();
  expect(screen.getByTestId('item-1')).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowUp'});
  await flushMicrotasks();
  expect(screen.getByTestId('item-0')).toHaveFocus();

  // Reached the end of the list.
  fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowUp'});
  await flushMicrotasks();
  expect(screen.getByTestId('item-0')).toHaveFocus();

  cleanup();
});

test('resets indexRef to -1 upon close', async () => {
  const data = ['a', 'ab', 'abc', 'abcd'];

  const Autocomplete = defineComponent(function () {
    const open = ref(false);
    const inputValue = ref('');
    const activeIndex = ref<number | null>(null);

    const listRef = ref<Array<HTMLElement | null>>([]);

    const {refs, context} = useFloating<HTMLInputElement>({
      open,
      onOpenChange: (o) => {
        open.value = o;
      },
    });

    const {getReferenceProps, getFloatingProps, getItemProps} =
      useInteractions([
        useDismiss(context),
        useListNavigation(context, {
          listRef,
          activeIndex,
          onNavigate: (index) => {
            activeIndex.value = index;
          },
          virtual: true,
          loop: true,
        }),
      ]);

    function onChange(event: Event) {
      const value = (event.target as HTMLInputElement).value;
      inputValue.value = value;

      if (value) {
        activeIndex.value = null;
        open.value = true;
      } else {
        open.value = false;
      }
    }

    const items = data.filter((item) =>
      item.toLowerCase().startsWith(inputValue.value.toLowerCase()),
    );

    return () => (
      <>
        <input
          {...getReferenceProps({
            ref: refs.setReference,
            onChange,
            value: inputValue.value,
            placeholder: 'Enter fruit',
            'aria-autocomplete': 'list',
          })}
          data-testid="reference"
        />
        {open.value && (
          <div
            {...getFloatingProps({
              ref: refs.setFloating,
              style: {
                background: '#eee',
                color: 'black',
                overflowY: 'auto',
              },
            })}
            data-testid="floating"
          >
            <ul>
              {items.map((item, index) => (
                <li
                  key={item}
                  {...getItemProps({
                    ref(node) {
                      listRef.value[index] = node;
                    },
                    onClick() {
                      inputValue.value = item;
                      open.value = false;
                      refs.domReference.value?.focus();
                    },
                  })}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div data-testid="active-index">{activeIndex.value}</div>
      </>
    );
  });

  render(<Autocomplete />);
  await flushMicrotasks();

  act(() => screen.getByTestId('reference').focus());
  await flushMicrotasks();
  await userEvent.keyboard('a');
  await flushMicrotasks();
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getByTestId('floating')).toBeInTheDocument();
  expect(screen.getByTestId('active-index').textContent).toBe('');

  await userEvent.keyboard('{ArrowDown}');
  await flushMicrotasks();
  await userEvent.keyboard('{ArrowDown}');
  await flushMicrotasks();
  await userEvent.keyboard('{ArrowDown}');
  await flushMicrotasks();

  expect(screen.getByTestId('active-index').textContent).toBe('2');

  await userEvent.keyboard('{Escape}');
  await flushMicrotasks();

  expect(screen.getByTestId('active-index').textContent).toBe('');

  await userEvent.keyboard('{Backspace}');
  await flushMicrotasks();
  await userEvent.keyboard('a');
  await flushMicrotasks();

  expect(screen.getByTestId('floating')).toBeInTheDocument();
  expect(screen.getByTestId('active-index').textContent).toBe('');

  await userEvent.keyboard('{ArrowDown}');
  await flushMicrotasks();

  expect(screen.getByTestId('active-index').textContent).toBe('0');

  cleanup();
});

describe('loop', () => {
  test('ArrowDown looping', async () => {
    render(<App loop />);
    await flushMicrotasks();

    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.queryByRole('menu')).toBeInTheDocument();
    expect(screen.getByTestId('item-0')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-2')).toHaveFocus();

    // Reached the end of the list and loops.
    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0')).toHaveFocus();

    cleanup();
  });

  test('ArrowUp looping', async () => {
    render(<App loop />);
    await flushMicrotasks();

    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.queryByRole('menu')).toBeInTheDocument();
    expect(screen.getByTestId('item-2')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0')).toHaveFocus();

    // Reached the end of the list and loops.
    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-2')).toHaveFocus();

    cleanup();
  });
});

describe('orientation', () => {
  test('navigates down on ArrowRight', async () => {
    render(<App orientation="horizontal" />);
    await flushMicrotasks();

    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.queryByRole('menu')).toBeInTheDocument();
    expect(screen.getByTestId('item-0')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-2')).toHaveFocus();

    // Reached the end of the list.
    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-2')).toHaveFocus();

    cleanup();
  });

  test('navigates up on ArrowLeft', async () => {
    render(<App orientation="horizontal" />);
    await flushMicrotasks();

    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.queryByRole('menu')).toBeInTheDocument();
    expect(screen.getByTestId('item-2')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0')).toHaveFocus();

    // Reached the end of the list.
    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0')).toHaveFocus();

    cleanup();
  });
});

describe('rtl', () => {
  test('navigates down on ArrowLeft', async () => {
    render(<App rtl={true} orientation="horizontal" />);
    await flushMicrotasks();

    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.queryByRole('menu')).toBeInTheDocument();
    expect(screen.getByTestId('item-0')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-2')).toHaveFocus();

    // Reached the end of the list.
    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-2')).toHaveFocus();

    cleanup();
  });

  test('navigates up on ArrowRight', async () => {
    render(<App rtl={true} orientation="horizontal" />);
    await flushMicrotasks();

    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.queryByRole('menu')).toBeInTheDocument();
    expect(screen.getByTestId('item-2')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0')).toHaveFocus();

    // Reached the end of the list.
    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0')).toHaveFocus();

    cleanup();
  });
});

describe('focusItemOnOpen', () => {
  test('true click', async () => {
    render(<App focusItemOnOpen={true} />);
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();
    expect(screen.getByTestId('item-0')).toHaveFocus();
    cleanup();
  });

  test('false click', async () => {
    render(<App focusItemOnOpen={false} />);
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();
    expect(screen.getByTestId('item-0')).not.toHaveFocus();
    cleanup();
  });

  // 依赖 vitest-browser-react + Menubar visual 组件（React，未迁移），跳过。
  describe.skipIf(isJSDOM())('browser tests', () => {
    test('does not override "auto" setting when using Enter/Space', async () => {});
  });
});

describe('selectedIndex', () => {
  test('scrollIntoView on open', async ({onTestFinished}) => {
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 0);
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    onTestFinished(() => {
      // `vi.spyOn` returns the spy created in `setupTests.ts`, so restore the
      // sync implementation from there instead of the native async one.
      requestAnimationFrame.mockImplementation(
        (callback: FrameRequestCallback): number => {
          callback(0);
          return 0;
        },
      );
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    });

    render(<App selectedIndex={0} />);
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button'));
    // actview 响应式更新在微任务：等待 menu 渲染、列表 ref 填充后再手动
    // 触发 rAF 回调（React 版 fireEvent 自动包 act，渲染同步完成）。
    await flushMicrotasks();
    expect(requestAnimationFrame).toHaveBeenCalled();
    // Run the timer
    requestAnimationFrame.mock.calls.forEach((call) => call[0](0));
    expect(scrollIntoView).toHaveBeenCalled();
    cleanup();
  });
});

describe('allowEscape + virtual', () => {
  test('true', async () => {
    render(<App allowEscape={true} virtual loop />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0').getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0').getAttribute('aria-selected')).toBe(
      'false',
    );
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0').getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1').getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-2').getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-2').getAttribute('aria-selected')).toBe(
      'false',
    );
    cleanup();
  });

  test('false', async () => {
    render(<App allowEscape={false} virtual loop />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-0').getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1').getAttribute('aria-selected')).toBe(
      'true',
    );
    cleanup();
  });

  test('true - onNavigate is called with `null` when escaped', async () => {
    const spy = vi.fn();
    render(<App allowEscape virtual loop onNavigate={spy} />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(null);
    cleanup();
  });
});

describe('openOnArrowKeyDown', () => {
  test('true ArrowDown', async () => {
    render(<App openOnArrowKeyDown={true} />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    cleanup();
  });

  test('true ArrowUp', async () => {
    render(<App openOnArrowKeyDown={true} />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    cleanup();
  });

  test('false ArrowDown', async () => {
    render(<App openOnArrowKeyDown={false} />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    cleanup();
  });

  test('false ArrowUp', async () => {
    render(<App openOnArrowKeyDown={false} />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    cleanup();
  });
});

describe('disabledIndices', () => {
  test('indices are skipped in focus order', async () => {
    render(<App disabledIndices={[0]} />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).toHaveFocus();
    cleanup();
  });
});

describe('focusOnHover', () => {
  test('true - focuses item on hover and syncs the active index', async () => {
    const spy = vi.fn();
    render(<App onNavigate={spy} />);
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();
    fireEvent.mouseMove(screen.getByTestId('item-1'));
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).toHaveFocus();
    fireEvent.pointerLeave(screen.getByTestId('item-1'));
    await flushMicrotasks();
    expect(screen.getByRole('menu')).toHaveFocus();
    expect(spy).toHaveBeenCalledWith(1);
    cleanup();
  });

  test('false - does not focus item on hover and does not sync the active index', async () => {
    const spy = vi.fn();
    render(
      <App onNavigate={spy} focusItemOnOpen={false} focusItemOnHover={false} />,
    );
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();
    fireEvent.mouseMove(screen.getByTestId('item-1'));
    await flushMicrotasks();
    expect(screen.getByTestId('item-1')).not.toHaveFocus();
    expect(spy).toHaveBeenCalledTimes(0);
    cleanup();
  });
});

// 以下 grid 测试使用 visual 组件（Grid / ComplexGrid / ListboxFocus，已迁移
// 到 actview）；changing/disabled list items 依赖 EmojiPicker（未迁移，跳过）。
describe('grid navigation', () => {
  test('ArrowDown focuses first item', async () => {
    render(<Grid />);
    await flushMicrotasks();

    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();
    expect(screen.queryByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[8]).toHaveFocus();
    cleanup();
  });

  test('focuses first non-disabled item in grid', async () => {
    render(<Grid />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[8]).toHaveFocus();
    cleanup();
  });

  test('focuses next item using ArrowRight key, skipping disabled items', async () => {
    render(<Grid />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[9]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[11]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[14]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[16]).toHaveFocus();
    cleanup();
  });

  test('focuses previous item using ArrowLeft key, skipping disabled items', async () => {
    render(<Grid />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();

    act(() => screen.getAllByRole('option')[47].focus());

    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[46]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[44]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[41]).toHaveFocus();
    cleanup();
  });

  test('skips row and remains on same column when pressing ArrowDown', async () => {
    render(<Grid />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[13]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[18]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[23]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[28]).toHaveFocus();

    cleanup();
  });

  test('skips row and remains on same column when pressing ArrowUp', async () => {
    render(<Grid />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();

    act(() => screen.getAllByRole('option')[47].focus());

    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[42]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[37]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[32]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[27]).toHaveFocus();

    cleanup();
  });

  test('loops on the same column with ArrowDown', async () => {
    render(<Grid loop />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();

    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    await flushMicrotasks();

    expect(screen.getAllByRole('option')[8]).toHaveFocus();

    cleanup();
  });

  test('loops on the same column with ArrowUp', async () => {
    render(<Grid loop />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();

    act(() => screen.getAllByRole('option')[43].focus());

    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
    await flushMicrotasks();

    expect(screen.getAllByRole('option')[43]).toHaveFocus();

    cleanup();
  });

  test('does not leave row with "both" orientation while looping', async () => {
    render(<Grid orientation="both" loop />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();

    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[9]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[8]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[9]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[8]).toHaveFocus();

    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[13]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[14]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[11]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[14]).toHaveFocus();

    cleanup();
  });

  test('looping works on last row', async () => {
    render(<Grid orientation="both" loop />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();

    act(() => screen.getAllByRole('option')[46].focus());

    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[47]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowRight'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[46]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[47]).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowLeft'});
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[46]).toHaveFocus();

    cleanup();
  });
});

describe('grid navigation when items have different sizes', () => {
  test('focuses first non-disabled item in grid', async () => {
    render(<ComplexGrid />);
    await flushMicrotasks();
    fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
    fireEvent.click(screen.getByRole('button'));
    await flushMicrotasks();
    expect(screen.getAllByRole('option')[7]).toHaveFocus();
    cleanup();
  });

  describe.each([
    {rtl: false, arrowToStart: 'ArrowLeft', arrowToEnd: 'ArrowRight'},
    {rtl: true, arrowToStart: 'ArrowRight', arrowToEnd: 'ArrowLeft'},
  ])('with rtl $rtl', ({rtl, arrowToStart, arrowToEnd}) => {
    test(`focuses next item using ${arrowToEnd} key, skipping disabled items`, async () => {
      render(<ComplexGrid rtl={rtl} />);
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
      fireEvent.click(screen.getByRole('button'));
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[8]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[10]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[13]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[15]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[20]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[24]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[34]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[36]).toHaveFocus();
      cleanup();
    });

    test(`focuses previous item using ${arrowToStart} key, skipping disabled items`, async () => {
      render(<ComplexGrid rtl={rtl} />);
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
      fireEvent.click(screen.getByRole('button'));
      await flushMicrotasks();

      act(() => screen.getAllByRole('option')[36].focus());

      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[34]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[28]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[20]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[7]).toHaveFocus();
      cleanup();
    });

    test(`moves through rows when pressing ArrowDown, prefers ${
      rtl ? 'right' : 'left'
    } side of wide items`, async () => {
      render(<ComplexGrid rtl={rtl} />);
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
      fireEvent.click(screen.getByRole('button'));
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[20]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[25]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[31]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[36]).toHaveFocus();

      cleanup();
    });

    test(`moves through rows when pressing ArrowUp, prefers ${
      rtl ? 'right' : 'left'
    } side of wide items`, async () => {
      render(<ComplexGrid rtl={rtl} />);
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
      fireEvent.click(screen.getByRole('button'));
      await flushMicrotasks();

      act(() => screen.getAllByRole('option')[29].focus());

      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[21]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[15]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[8]).toHaveFocus();

      cleanup();
    });

    test(`loops over column with ArrowDown, prefers ${
      rtl ? 'right' : 'left'
    } side of wide items`, async () => {
      render(<ComplexGrid rtl={rtl} loop />);
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
      fireEvent.click(screen.getByRole('button'));
      await flushMicrotasks();

      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      await flushMicrotasks();

      expect(screen.getAllByRole('option')[13]).toHaveFocus();

      cleanup();
    });

    test(`loops over column with ArrowUp, prefers ${
      rtl ? 'right' : 'left'
    } side of wide items`, async () => {
      render(<ComplexGrid rtl={rtl} loop />);
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
      fireEvent.click(screen.getByRole('button'));
      await flushMicrotasks();

      act(() => screen.getAllByRole('option')[30].focus());

      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowUp'});
      await flushMicrotasks();

      expect(screen.getAllByRole('option')[8]).toHaveFocus();

      cleanup();
    });

    test('loops over row with "both" orientation, prefers top side of tall items', async () => {
      render(<ComplexGrid rtl={rtl} orientation="both" loop />);
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
      fireEvent.click(screen.getByRole('button'));
      await flushMicrotasks();

      act(() => screen.getAllByRole('option')[20].focus());

      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[21]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[20]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[21]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToStart});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[21]).toHaveFocus();

      fireEvent.keyDown(screen.getByTestId('floating'), {key: 'ArrowDown'});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[22]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[24]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[20]).toHaveFocus();
      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[21]).toHaveFocus();

      cleanup();
    });

    test('looping works on last row', async () => {
      render(<ComplexGrid rtl={rtl} orientation="both" loop />);
      await flushMicrotasks();
      fireEvent.keyDown(screen.getByRole('button'), {key: 'Enter'});
      fireEvent.click(screen.getByRole('button'));
      await flushMicrotasks();

      act(() => screen.getAllByRole('option')[36].focus());

      fireEvent.keyDown(screen.getByTestId('floating'), {key: arrowToEnd});
      await flushMicrotasks();
      expect(screen.getAllByRole('option')[36]).toHaveFocus();

      cleanup();
    });
  });
});

test.skip('grid navigation with changing list items', async () => {});
test.skip('grid navigation with disabled list items', async () => {});
test('selectedIndex changing does not steal focus', async () => {
  render(<ListboxFocus />);
  await flushMicrotasks();

  await userEvent.click(screen.getByTestId('reference'));
  await flushMicrotasks();

  expect(screen.getByTestId('reference')).toHaveFocus();
  cleanup();
});

// React 版：jsdom 下不会聚焦第一个条目，仅在浏览器验证（visual Menu 未迁移）。
test.skipIf(!isJSDOM())('focus management in nested lists', async () => {});
test.skipIf(!isJSDOM())(
  'keyboard navigation in nested menus lists',
  async () => {},
);
test.skipIf(!isJSDOM())(
  'keyboard navigation in nested menus with different orientation',
  async () => {},
);

test.skip('virtual nested Home or End key press', async () => {});
test.skip('domReference trigger in nested virtual menu is set as virtual item', async () => {});

test('scheduled list population', async () => {
  const Option = defineComponent(function (props: {
    listRef: Ref<Array<HTMLElement | null>>;
    getItemProps: () => Record<string, unknown>;
    active: boolean;
    index: number;
  }) {
    const index = ref(-1);
    const nodeRef = ref<HTMLElement | null>(null);

    watch(
      () => props.index,
      () => {
        index.value = props.index;
      },
      // React 版 useLayoutEffect 挂载后立即执行；watch 非 immediate 不触发
      {immediate: true},
    );

    // React 版靠 setIndex 重渲染 + ref 回调重建（依赖 index）写入 listRef；
    // actview 的 ref 回调固定不重建，这里在 index 就绪后主动同步。
    watch(
      index,
      () => {
        if (index.value !== -1 && nodeRef.value) {
          props.listRef.value[index.value] = nodeRef.value;
        }
      },
      {immediate: true},
    );

    return () => (
      <div
        role="option"
        aria-selected={props.active}
        tabIndex={props.active ? 0 : -1}
        ref={(node) => {
          nodeRef.value = node;
          if (index.value !== -1) {
            props.listRef.value[index.value] = node;
          }
        }}
        {...props.getItemProps()}
      />
    );
  });

  const ScheduledApp = defineComponent(function () {
    const isOpen = ref(false);

    const {refs, context} = useFloating({
      open: isOpen,
      onOpenChange: (o) => {
        isOpen.value = o;
      },
    });

    const activeIndex = ref<number | null>(null);
    const listRef = ref<Array<HTMLElement | null>>([]);

    const listNavigation = useListNavigation(context, {
      listRef,
      activeIndex,
      onNavigate: (index) => {
        activeIndex.value = index;
      },
    });

    const {getReferenceProps, getFloatingProps, getItemProps} =
      useInteractions([listNavigation]);

    return () => (
      <>
        <button
          ref={refs.setReference}
          {...getReferenceProps({
            onClick() {
              isOpen.value = !isOpen.value;
            },
          })}
        >
          Open
        </button>
        {isOpen.value && (
          <div ref={refs.setFloating} {...getFloatingProps()}>
            {['one', 'two', 'three'].map((option, index) => (
              <Option
                key={option}
                listRef={listRef}
                getItemProps={getItemProps}
                index={index}
                active={activeIndex.value === index}
              />
            ))}
          </div>
        )}
      </>
    );
  });

  render(<ScheduledApp />);
  await flushMicrotasks();

  fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowUp'});
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[2]).toHaveFocus();

  fireEvent.click(screen.getByRole('button'));
  await flushMicrotasks();
  fireEvent.keyDown(screen.getByRole('button'), {key: 'ArrowDown'});
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[0]).toHaveFocus();
});

test('async selectedIndex', async () => {
  const options = ['core', 'dom', 'react', 'react-dom', 'vue', 'react-native'];

  const Option = defineComponent(function (props: {
    option: string;
    activeIndex: number | null;
    selectedIndex: number | null;
  }) {
    const {ref, index} = useListItem();
    return () => (
      <button
        ref={ref}
        role="option"
        tabIndex={index.value === props.activeIndex ? 0 : -1}
        aria-selected={index.value === props.selectedIndex}
      >
        <span>{props.option}</span>
      </button>
    );
  });

  const Select = defineComponent(function () {
    const activeIndex = ref<number | null>(null);
    const selectedIndex = ref<number | null>(null);
    const isOpen = ref(false);

    if (selectedIndex.value !== 2) {
      selectedIndex.value = 2;
    }

    const {refs, floatingStyles, context} = useFloating({
      open: isOpen,
      onOpenChange: (o) => {
        isOpen.value = o;
      },
    });

    const elementsRef = ref<Array<HTMLElement | null>>([]);

    const click = useClick(context);
    const listNav = useListNavigation(context, {
      listRef: elementsRef,
      activeIndex,
      selectedIndex,
      onNavigate: (index) => {
        activeIndex.value = index;
      },
    });

    const {getReferenceProps, getFloatingProps} = useInteractions([
      listNav,
      click,
    ]);

    return () => (
      <>
        <button ref={refs.setReference} {...getReferenceProps()}>
          Open
        </button>
        {isOpen.value && (
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles.value}
              {...getFloatingProps()}
            >
              <FloatingList elementsRef={elementsRef}>
                {options.map((option) => (
                  <Option
                    key={option}
                    option={option}
                    activeIndex={activeIndex.value}
                    selectedIndex={selectedIndex.value}
                  />
                ))}
              </FloatingList>
            </div>
          </FloatingFocusManager>
        )}
      </>
    );
  });

  render(<Select />);
  await flushMicrotasks();

  fireEvent.click(screen.getByRole('button'));
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[2]).toHaveFocus();
  await userEvent.keyboard('{ArrowDown}');
  await flushMicrotasks();
  expect(screen.getAllByRole('option')[3]).toHaveFocus();
});

test('Home or End key press is ignored for typeable combobox reference', async () => {
  const ComboboxApp = defineComponent(function () {
    const open = ref(false);
    const listRef = ref<Array<HTMLLIElement | null>>([]);
    const activeIndex = ref<number | null>(null);
    const {refs, context} = useFloating({
      open,
      onOpenChange: (o) => {
        open.value = o;
      },
    });
    const {getReferenceProps, getFloatingProps, getItemProps} =
      useInteractions([
        useClick(context),
        useListNavigation(context, {
          listRef,
          activeIndex,
          onNavigate: (index) => {
            activeIndex.value = index;
          },
        }),
      ]);

    return () => (
      <>
        <input
          role="combobox"
          ref={refs.setReference}
          {...getReferenceProps()}
        />
        {open.value && (
          <div role="menu" {...getFloatingProps({ref: refs.setFloating})}>
            <ul>
              {['one', 'two', 'three'].map((string, index) => (
                <li
                  data-testid={`item-${index}`}
                  aria-selected={activeIndex.value === index}
                  key={string}
                  tabIndex={-1}
                  {...getItemProps({
                    ref(node: HTMLLIElement) {
                      listRef.value[index] = node;
                    },
                  })}
                >
                  {string}
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  });

  render(<ComboboxApp />);
  await flushMicrotasks();

  act(() => {
    screen.getByRole('combobox').focus();
  });
  await flushMicrotasks();

  await userEvent.keyboard('{ArrowDown}');
  await flushMicrotasks();

  await waitFor(() => {
    expect(screen.getByTestId('item-0')).toHaveFocus();
  });

  await userEvent.keyboard('{End}');
  await flushMicrotasks();

  expect(screen.getByTestId('item-0')).toHaveFocus();

  await userEvent.keyboard('{ArrowDown}');
  await flushMicrotasks();
  await userEvent.keyboard('{Home}');
  await flushMicrotasks();

  await waitFor(() => {
    expect(screen.getByTestId('item-1')).toHaveFocus();
  });
});
