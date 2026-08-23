import {defineComponent, isRef, ref, type Ref} from '@actview/core';
import {vi} from 'vitest';

import {useClick, useFloating, useInteractions, useTypeahead} from '../../src';
import type {UseTypeaheadProps} from '../../src/hooks/useTypeahead';
import {act, cleanup, flushMicrotasks, render, screen} from './utils';
import userEvent from '@testing-library/user-event';
import {Main as MenuMain} from '../visual/components/Menu';

vi.useFakeTimers({shouldAdvanceTime: true});

function useImpl(
  props: Pick<UseTypeaheadProps, 'onMatch' | 'onTypingChange'> & {
    list?: Array<string>;
    open?: Ref<boolean> | boolean;
    onOpenChange?: (open: boolean) => void;
    addUseClick?: boolean;
  },
) {
  const internalOpen = ref(true);
  const openSource = props.open ?? internalOpen;
  // useFloating 的 open 接受 Ref | boolean；对外统一返回 Ref（组件读 .value）
  const open = isRef(openSource) ? openSource : ref(openSource);
  const activeIndex = ref<number | null>(null);
  const {refs, context} = useFloating({
    open,
    onOpenChange:
      props.onOpenChange ??
      ((o: boolean) => {
        internalOpen.value = o;
      }),
  });
  const listRef = ref<Array<string>>(props.list ?? ['one', 'two', 'three']);
  const typeahead = useTypeahead(context, {
    listRef,
    activeIndex,
    onMatch(index) {
      activeIndex.value = index;
      props.onMatch?.(index);
    },
    onTypingChange: props.onTypingChange,
  });
  const click = useClick(context, {
    enabled: props.addUseClick ?? false,
  });

  const {getReferenceProps, getFloatingProps} = useInteractions([
    typeahead,
    click,
  ]);

  return {
    activeIndex,
    open,
    getReferenceProps: (userProps?: Record<string, any>) =>
      getReferenceProps({
        role: 'combobox',
        ...userProps,
        ref: refs.setReference,
      }),
    getFloatingProps: () =>
      getFloatingProps({
        role: 'listbox',
        ref: refs.setFloating,
      }),
  };
}

const Combobox = defineComponent(function (
  props: Pick<UseTypeaheadProps, 'onMatch' | 'onTypingChange'> & {
    list?: Array<string>;
  },
) {
  const {getReferenceProps, getFloatingProps} = useImpl(props);
  return () => (
    <>
      <input {...getReferenceProps()} />
      <div {...getFloatingProps()} />
    </>
  );
});

const Select = defineComponent(function (
  props: Pick<UseTypeaheadProps, 'onMatch' | 'onTypingChange'> & {
    list?: Array<string>;
  },
) {
  const isOpen = ref(false);
  const {getReferenceProps, getFloatingProps} = useImpl({
    ...props,
    open: isOpen,
    onOpenChange: (o) => {
      isOpen.value = o;
    },
    addUseClick: true,
  });
  return () => (
    <>
      <div tabIndex={0} {...getReferenceProps()} />
      {isOpen.value && <div {...getFloatingProps()} />}
    </>
  );
});

test('rapidly focuses list items when they start with the same letter', async () => {
  const spy = vi.fn();
  render(<Combobox onMatch={spy} />);

  await userEvent.click(screen.getByRole('combobox'));
  await flushMicrotasks();

  await userEvent.keyboard('t');
  expect(spy).toHaveBeenCalledWith(1);

  await userEvent.keyboard('t');
  expect(spy).toHaveBeenCalledWith(2);

  await userEvent.keyboard('t');
  expect(spy).toHaveBeenCalledWith(1);

  cleanup();
});

test('bails out of rapid focus of first letter if the list contains a string that starts with two of the same letter', async () => {
  const spy = vi.fn();
  render(<Combobox onMatch={spy} list={['apple', 'aaron', 'apricot']} />);

  await userEvent.click(screen.getByRole('combobox'));
  await flushMicrotasks();

  await userEvent.keyboard('a');
  expect(spy).toHaveBeenCalledWith(0);

  await userEvent.keyboard('a');
  expect(spy).toHaveBeenCalledWith(0);

  cleanup();
});

test('starts from the current activeIndex and correctly loops', async () => {
  const spy = vi.fn();
  render(
    <Combobox
      onMatch={spy}
      list={['Toy Story 2', 'Toy Story 3', 'Toy Story 4']}
    />,
  );

  await userEvent.click(screen.getByRole('combobox'));
  await flushMicrotasks();

  await userEvent.keyboard('t');
  await userEvent.keyboard('o');
  await userEvent.keyboard('y');
  expect(spy).toHaveBeenCalledWith(0);

  spy.mockReset();

  await userEvent.keyboard('t');
  await userEvent.keyboard('o');
  await userEvent.keyboard('y');
  expect(spy).not.toHaveBeenCalled();

  vi.advanceTimersByTime(750);

  await userEvent.keyboard('t');
  await userEvent.keyboard('o');
  await userEvent.keyboard('y');
  expect(spy).toHaveBeenCalledWith(1);

  vi.advanceTimersByTime(750);

  await userEvent.keyboard('t');
  await userEvent.keyboard('o');
  await userEvent.keyboard('y');
  expect(spy).toHaveBeenCalledWith(2);

  vi.advanceTimersByTime(750);

  await userEvent.keyboard('t');
  await userEvent.keyboard('o');
  await userEvent.keyboard('y');
  expect(spy).toHaveBeenCalledWith(0);

  cleanup();
});

test('capslock characters continue to match', async () => {
  const spy = vi.fn();
  render(<Combobox onMatch={spy} />);

  userEvent.click(screen.getByRole('combobox'));

  await userEvent.keyboard('{CapsLock}t');
  expect(spy).toHaveBeenCalledWith(1);

  cleanup();
});

const App1 = defineComponent(function (
  props: Pick<UseTypeaheadProps, 'onMatch'> & {list: Array<string>},
) {
  const {getReferenceProps, getFloatingProps, activeIndex, open} =
    useImpl(props);
  const inputRef = ref<HTMLInputElement | null>(null);

  return () => (
    <>
      <div
        {...getReferenceProps({
          onClick: () => inputRef.value?.focus(),
        })}
      >
        <input ref={inputRef} readOnly={true} />
      </div>
      {open.value && (
        <div {...getFloatingProps()}>
          {props.list.map((value, i) => (
            <div
              key={value}
              role="option"
              tabIndex={i === activeIndex.value ? 0 : -1}
              aria-selected={i === activeIndex.value}
            >
              {value}
            </div>
          ))}
        </div>
      )}
    </>
  );
});

test('matches when focus is within reference', async () => {
  const spy = vi.fn();
  render(<App1 onMatch={spy} list={['one', 'two', 'three']} />);

  await userEvent.click(screen.getByRole('combobox'));
  await flushMicrotasks();

  await userEvent.keyboard('t');
  expect(spy).toHaveBeenCalledWith(1);

  cleanup();
});

test('matches when focus is within floating', async () => {
  const spy = vi.fn();
  render(<App1 onMatch={spy} list={['one', 'two', 'three']} />);

  await userEvent.click(screen.getByRole('combobox'));
  await flushMicrotasks();

  await userEvent.keyboard('t');
  const option = await screen.findByRole('option', {selected: true});
  expect(option.textContent).toBe('two');
  option.focus();
  expect(option).toHaveFocus();

  await userEvent.keyboard('h');
  expect(
    (await screen.findByRole('option', {selected: true})).textContent,
  ).toBe('three');

  cleanup();
});

test('onTypingChange is called when typing starts or stops', async () => {
  const spy = vi.fn();
  render(<Combobox onTypingChange={spy} list={['one', 'two', 'three']} />);

  act(() => screen.getByRole('combobox').focus());

  await userEvent.keyboard('t');
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith(true);

  vi.advanceTimersByTime(750);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenCalledWith(false);

  cleanup();
});

test('Menu - skips disabled items and opens submenu on space if no match', async () => {
  vi.useRealTimers();
  const user = userEvent.setup();

  render(<MenuMain />);
  await flushMicrotasks();

  await user.click(screen.getByText('Edit'));
  await flushMicrotasks();

  expect(screen.getByRole('menu')).toBeInTheDocument();

  await user.keyboard('c');
  await flushMicrotasks();

  expect(screen.getByText('Copy as')).toHaveFocus();

  await user.keyboard('opy as ');
  await flushMicrotasks();

  expect(screen.getByText('Copy as').getAttribute('aria-expanded')).toBe(
    'false',
  );

  await user.keyboard(' ');
  await flushMicrotasks();

  expect(screen.getByText('Copy as').getAttribute('aria-expanded')).toBe(
    'true',
  );

  cleanup();
  vi.useFakeTimers({shouldAdvanceTime: true});
});

test('Menu - resets once a match is no longer found', async () => {
  vi.useRealTimers();
  const user = userEvent.setup();

  render(<MenuMain />);
  await flushMicrotasks();

  await user.click(screen.getByText('Edit'));
  await flushMicrotasks();

  expect(screen.getByRole('menu')).toBeInTheDocument();

  await user.keyboard('undr');
  await flushMicrotasks();

  expect(screen.getByText('Undo')).toHaveFocus();

  await user.keyboard('r');
  await flushMicrotasks();

  expect(screen.getByText('Redo')).toHaveFocus();

  cleanup();
  vi.useFakeTimers({shouldAdvanceTime: true});
});

test('typing spaces on <div> references does not open the menu', async () => {
  const spy = vi.fn();
  render(<Select onMatch={spy} />);

  vi.useFakeTimers({shouldAdvanceTime: true});

  await userEvent.click(screen.getByRole('combobox'));
  await flushMicrotasks();

  await userEvent.keyboard('h');
  await userEvent.keyboard(' ');
  await flushMicrotasks();

  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

  vi.advanceTimersByTime(750);

  await userEvent.keyboard(' ');
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.queryByRole('listbox')).toBeInTheDocument();
});
