import {defineComponent, ref} from '@actview/core';
import {vi, test} from 'vitest';

import {useFloating, useHover, useInteractions} from '../../src';
import type {UseHoverProps} from '../../src/hooks/useHover';
import {
  act,
  cleanup,
  fireEvent,
  flushMicrotasks,
  render,
  screen,
} from './utils';

vi.useFakeTimers();

const App = defineComponent(function (
  props: UseHoverProps & {showReference?: boolean},
) {
  const open = ref(false);
  const {refs, context} = useFloating({
    open,
    onOpenChange: (o) => {
      open.value = o;
    },
  });
  const {getReferenceProps, getFloatingProps} = useInteractions([
    useHover(context, props),
  ]);

  return () => (
    <>
      {(props.showReference ?? true) && (
        <button {...getReferenceProps({ref: refs.setReference})} />
      )}
      {open.value && (
        <div role="tooltip" {...getFloatingProps({ref: refs.setFloating})} />
      )}
    </>
  );
});

test('opens on mouseenter', async () => {
  render(<App />);
  await flushMicrotasks();

  fireEvent.mouseEnter(screen.getByRole('button'));
  await flushMicrotasks();
  expect(screen.queryByRole('tooltip')).toBeInTheDocument();

  cleanup();
});

test('closes on mouseleave', async () => {
  render(<App />);
  await flushMicrotasks();

  fireEvent.mouseEnter(screen.getByRole('button'));
  await flushMicrotasks();
  fireEvent.mouseLeave(screen.getByRole('button'));
  await flushMicrotasks();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  cleanup();
});

describe('delay', () => {
  test('symmetric number', async () => {
    render(<App delay={1000} />);
  await flushMicrotasks();

    fireEvent.mouseEnter(screen.getByRole('button'));

    await act(async () => {
      vi.advanceTimersByTime(999);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    cleanup();
  });

  test('open', async () => {
    render(<App delay={{open: 500}} />);
  await flushMicrotasks();

    fireEvent.mouseEnter(screen.getByRole('button'));

    await act(async () => {
      vi.advanceTimersByTime(499);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    cleanup();
  });

  test('close', async () => {
    render(<App delay={{close: 500}} />);
  await flushMicrotasks();

    fireEvent.mouseEnter(screen.getByRole('button'));
    await flushMicrotasks();
    fireEvent.mouseLeave(screen.getByRole('button'));

    await act(async () => {
      vi.advanceTimersByTime(499);
    });

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    cleanup();
  });

  test('open with close 0', async () => {
    render(<App delay={{open: 500}} />);
  await flushMicrotasks();

    fireEvent.mouseEnter(screen.getByRole('button'));

    await act(async () => {
      vi.advanceTimersByTime(499);
    });

    fireEvent.mouseLeave(screen.getByRole('button'));

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    cleanup();
  });

  test('restMs + nullish open delay should respect restMs', async () => {
    render(<App restMs={100} delay={{close: 100}} />);
  await flushMicrotasks();

    fireEvent.mouseEnter(screen.getByRole('button'));

    await act(async () => {
      vi.advanceTimersByTime(99);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    cleanup();
  });
});

test('restMs', async () => {
  render(<App restMs={100} />);
  await flushMicrotasks();

  const button = screen.getByRole('button');

  const originalDispatchEvent = button.dispatchEvent;
  const spy = vi.spyOn(button, 'dispatchEvent').mockImplementation((event) => {
    Object.defineProperty(event, 'movementX', {value: 10});
    Object.defineProperty(event, 'movementY', {value: 10});
    return originalDispatchEvent.call(button, event);
  });

  fireEvent.mouseMove(button);

  await act(async () => {
    vi.advanceTimersByTime(99);
  });

  fireEvent.mouseMove(button);

  await act(async () => {
    vi.advanceTimersByTime(1);
  });

  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  fireEvent.mouseMove(button);

  await act(async () => {
    vi.advanceTimersByTime(100);
  });

  expect(screen.queryByRole('tooltip')).toBeInTheDocument();

  spy.mockRestore();
  cleanup();
});

test('restMs is always 0 for touch input', async () => {
  render(<App restMs={100} />);
  await flushMicrotasks();

  fireEvent.pointerDown(screen.getByRole('button'), {pointerType: 'touch'});
  fireEvent.mouseMove(screen.getByRole('button'));

  await act(async () => {});

  expect(screen.queryByRole('tooltip')).toBeInTheDocument();
});

test('restMs does not cause floating element to open if mouseOnly is true', async () => {
  render(<App restMs={100} mouseOnly />);
  await flushMicrotasks();

  fireEvent.pointerDown(screen.getByRole('button'), {pointerType: 'touch'});
  fireEvent.mouseMove(screen.getByRole('button'));

  await act(async () => {});

  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('restMs does not reset timer for minor mouse movement', async () => {
  render(<App restMs={100} />);
  await flushMicrotasks();

  const button = screen.getByRole('button');

  const originalDispatchEvent = button.dispatchEvent;
  const spy = vi.spyOn(button, 'dispatchEvent').mockImplementation((event) => {
    Object.defineProperty(event, 'movementX', {value: 1});
    Object.defineProperty(event, 'movementY', {value: 0});
    return originalDispatchEvent.call(button, event);
  });

  fireEvent.mouseMove(button);

  await act(async () => {
    vi.advanceTimersByTime(99);
  });

  fireEvent.mouseMove(button);

  await act(async () => {
    vi.advanceTimersByTime(1);
  });

  expect(screen.queryByRole('tooltip')).toBeInTheDocument();

  spy.mockRestore();
  cleanup();
});

test('mouseleave on the floating element closes it (mouse)', async () => {
  render(<App />);
  await flushMicrotasks();

  fireEvent.mouseEnter(screen.getByRole('button'));
  await flushMicrotasks();

  fireEvent(
    screen.getByRole('button'),
    new MouseEvent('mouseleave', {
      relatedTarget: screen.getByRole('tooltip'),
    }),
  );
  await flushMicrotasks();

  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('does not show after delay if domReference changes', async () => {
  const {rerender} = render(<App delay={1000} />);

  fireEvent.mouseEnter(screen.getByRole('button'));

  await act(async () => {
    vi.advanceTimersByTime(1);
  });

  rerender({showReference: false});

  await act(async () => {
    vi.advanceTimersByTime(999);
  });

  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  cleanup();
});

test('reason string', async () => {
  const ReasonApp = defineComponent(function () {
    const isOpen = ref(false);
    const {refs, context} = useFloating({
      open: isOpen,
      onOpenChange(open, _, reason) {
        isOpen.value = open;
        expect(reason).toBe('hover');
      },
    });

    const hover = useHover(context);
    const {getReferenceProps, getFloatingProps} = useInteractions([hover]);

    return () => (
      <>
        <button ref={refs.setReference} {...getReferenceProps()} />
        {isOpen.value && (
          <div role="tooltip" ref={refs.setFloating} {...getFloatingProps()} />
        )}
      </>
    );
  });

  render(<ReasonApp />);
  const button = screen.getByRole('button');
  fireEvent.mouseEnter(button);
  await act(async () => {});
  fireEvent.mouseLeave(button);
});

// 依赖 visual/components/Popover.tsx（React 组件，未迁移到 actview），跳过。
test.skip('cleans up blockPointerEvents if trigger changes', async () => {});
