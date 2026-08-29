import {act, fireEvent, flushMicrotasks, render, screen} from './utils';
import {createContext, defineComponent, ref, type Ref} from '@actview/core';

import {
  FloatingList,
  useClick,
  useFloating,
  useInteractions,
  useListItem,
  useListNavigation,
  useTypeahead,
} from '../../src';

const SelectContext = createContext<any>(null);

const Select = defineComponent(function (props: {children?: any}) {
  const isOpen = ref(false);
  const activeIndex = ref<number | null>(null);

  const {refs, context} = useFloating({
    open: isOpen,
    onOpenChange: (o) => {
      isOpen.value = o;
    },
  });

  const elementsRef = ref<Array<HTMLElement | null>>([]);
  const labelsRef = ref<Array<string | null>>([]);

  const click = useClick(context);
  const listNavigation = useListNavigation(context, {
    listRef: elementsRef,
    activeIndex,
    onNavigate: (index) => {
      activeIndex.value = index;
    },
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    onMatch: (index) => {
      activeIndex.value = index;
    },
  });

  const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
    click,
    listNavigation,
    typeahead,
  ]);

  return () => (
    <SelectContext.Provider value={{getItemProps, activeIndex}}>
      <button ref={refs.setReference} {...getReferenceProps()}>
        Open select menu
      </button>
      <FloatingList elementsRef={elementsRef} labelsRef={labelsRef}>
        {isOpen.value && (
          <div ref={refs.setFloating} role="listbox" {...getFloatingProps()}>
            {props.children}
          </div>
        )}
      </FloatingList>
    </SelectContext.Provider>
  );
});

const Option = defineComponent(function (props: {
  children?: any;
  label?: string;
}) {
  // store-as-is：createContext().use() 原样返回 payload——直读字段；
  // activeIndex 本身是 Ref（来自 Select），渲染闭包内读 .value 保持响应式。
  const {getItemProps, activeIndex} = SelectContext.use();
  const {ref, index} = useListItem({label: props.label});

  return () => {
    const isActive =
      index.value === activeIndex.value && index.value !== null;

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        {...getItemProps()}
      >
        {props.children}
      </div>
    );
  };
});

test('registers element ref and indexes correctly', async () => {
  render(
    <Select>
      <Option>One</Option>
      <div>
        <Option>Two</Option>
        <Option>Three</Option>
        <Option>Four</Option>
      </div>
      <>
        <Option>Five</Option>
        <Option>Six</Option>
      </>
    </Select>,
  );
  await flushMicrotasks();

  fireEvent.click(screen.getByRole('button'));
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[0]).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'ArrowDown'});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[1]).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'ArrowDown'});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[2]).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'ArrowDown'});
  await flushMicrotasks();
  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'ArrowDown'});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[4]).toHaveFocus();
  expect(screen.getAllByRole('option')[4].getAttribute('tabindex')).toBe('0');
});

test('registers an element ref and index correctly', async () => {
  render(
    <Select>
      <Option>One</Option>
    </Select>,
  );
  await flushMicrotasks();

  fireEvent.click(screen.getByRole('button'));
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[0]).toHaveFocus();
});

test('registers strings correctly (no value)', async () => {
  render(
    <Select>
      <Option>One</Option>
      <div>
        <Option>Two</Option>
        <Option>Three</Option>
        <Option>Four</Option>
      </div>
      <>
        <Option>Five</Option>
        <Option>Six</Option>
      </>
    </Select>,
  );
  await flushMicrotasks();

  fireEvent.click(screen.getByRole('button'));
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[0]).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'F'});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[3]).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'I'});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[4]).toHaveFocus();
});

test('registers strings correctly (label)', async () => {
  render(
    <Select>
      <Option label="One">One</Option>
      <div>
        <Option label="Two">Two</Option>
        <Option label="Three">Three</Option>
        <Option label="Four">Four</Option>
      </div>
      <>
        <Option label="Five">Five</Option>
        <Option label="Six">Six</Option>
      </>
    </Select>,
  );
  await flushMicrotasks();

  fireEvent.click(screen.getByRole('button'));
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[0]).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'F'});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[3]).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'I'});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[4]).toHaveFocus();
});

test('handles re-ordering', async () => {
  const {rerender} = render(
    <Select>
      <Option>One</Option>
      <div>
        <Option>Two</Option>
        <Option>Three</Option>
        <Option>Four</Option>
      </div>
      <>
        <Option>Five</Option>
        <Option>Six</Option>
      </>
    </Select>,
  );
  await flushMicrotasks();

  fireEvent.click(screen.getByRole('button'));
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[0]).toHaveFocus();

  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'ArrowDown'});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[1]).toHaveFocus();

  rerender(
    <Select>
      <Option>One</Option>
      <div>
        <Option>Two</Option>
        <Option>Three</Option>
        <Option>Four</Option>
      </div>
      <>
        <Option>Six</Option>
        <Option>Five</Option>
      </>
    </Select>,
  );
  await flushMicrotasks();

  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'ArrowDown'});
  await flushMicrotasks();
  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'ArrowDown'});
  await flushMicrotasks();
  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'ArrowDown'});
  await flushMicrotasks();
  fireEvent.keyDown(screen.getByRole('listbox'), {key: 'ArrowDown'});
  await flushMicrotasks();

  expect(screen.getAllByRole('option')[5]).toHaveFocus();
});
