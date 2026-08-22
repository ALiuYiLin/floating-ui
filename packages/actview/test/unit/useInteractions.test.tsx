import {defineComponent, ref} from '@actview/core';
import {vi} from 'vitest';

import {
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInnerOffset,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
} from '../../src';
import {render} from './utils';

test('correctly merges functions', () => {
  const firstInteractionOnClick = vi.fn();
  const secondInteractionOnClick = vi.fn();
  const secondInteractionOnKeyDown = vi.fn();
  const userOnClick = vi.fn();

  const App = defineComponent(function () {
    const {getReferenceProps} = useInteractions([
      {reference: {onClick: firstInteractionOnClick}},
      {
        reference: {
          onClick: secondInteractionOnClick,
          onKeyDown: secondInteractionOnKeyDown,
        },
      },
    ]);

    const {onClick, onKeyDown} = getReferenceProps({onClick: userOnClick});

    // @ts-expect-error
    onClick();
    // @ts-expect-error
    onKeyDown();

    return () => null;
  });

  render(<App />);

  expect(firstInteractionOnClick).toHaveBeenCalledTimes(1);
  expect(secondInteractionOnClick).toHaveBeenCalledTimes(1);
  expect(userOnClick).toHaveBeenCalledTimes(1);
  expect(secondInteractionOnKeyDown).toHaveBeenCalledTimes(1);
});

test('does not error with undefined user supplied functions', () => {
  const App = defineComponent(function () {
    const {getReferenceProps} = useInteractions([{reference: {onClick() {}}}]);
    expect(() =>
      // @ts-expect-error
      getReferenceProps({onClick: undefined}).onClick(),
    ).not.toThrowError();
    return () => null;
  });

  render(<App />);
});

test('does not break props that start with `on`', () => {
  const App = defineComponent(function () {
    const {getReferenceProps} = useInteractions([]);

    const props = getReferenceProps({
      // @ts-expect-error
      onlyShowVotes: true,
      onyx: () => {},
    });

    expect(props.onlyShowVotes).toBe(true);
    expect(typeof props.onyx).toBe('function');

    return () => null;
  });

  render(<App />);
});

test('does not break props that return values', () => {
  const App = defineComponent(function () {
    const {getReferenceProps} = useInteractions([]);

    const props = getReferenceProps({
      // @ts-expect-error
      onyx: () => 'returned value',
    });

    // @ts-expect-error
    expect(props.onyx()).toBe('returned value');

    return () => null;
  });

  render(<App />);
});

test('all interaction hooks can be combined', () => {
  const App = defineComponent(function () {
    const open = ref(false);

    const handleClose = () => () => {};
    handleClose.__options = {blockPointerEvents: true};

    const listRef = ref<Array<HTMLElement | null>>([]);
    const overflowRef = ref({top: 0, left: 0, bottom: 0, right: 0});
    const {context} = useFloating({
      open,
      onOpenChange: (o) => {
        open.value = o;
      },
    });

    const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions(
      [
        useHover(context, {handleClose}),
        useFocus(context),
        useClick(context),
        useRole(context),
        useDismiss(context),
        useListNavigation(context, {
          listRef,
          activeIndex: 0,
          onNavigate: () => {},
          disabledIndices: [],
        }),
        useTypeahead(context, {
          listRef,
          activeIndex: 0,
          ignoreKeys: [],
          onMatch: () => {},
          findMatch: () => '',
        }),
        useInnerOffset(context, {
          onChange: () => {},
          overflowRef,
        }),
      ],
    );

    expect(typeof getReferenceProps).toBe('function');
    expect(typeof getFloatingProps).toBe('function');
    expect(typeof getItemProps).toBe('function');

    return () => null;
  });

  render(<App />);
});
