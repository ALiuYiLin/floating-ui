import {inline} from '@floating-ui/dom';
import {isElement} from '@floating-ui/utils/dom';
import {defineComponent, onMounted, ref} from '@actview/core';
import {vi} from 'vitest';

import {
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
} from '../../src';
import {
  act,
  fireEvent,
  flushMicrotasks,
  render,
  screen,
} from './utils';
import userEvent from '@testing-library/user-event';

describe('positionReference', () => {
  test('sets separate refs', async () => {
    const App = defineComponent(function () {
      const {refs} = useFloating<HTMLDivElement>();

      return () => (
        <>
          <div ref={refs.setReference} data-testid="reference" />
          <div
            ref={refs.setPositionReference}
            data-testid="position-reference"
          />
          <div data-testid="reference-text">
            {String(
              refs.domReference.value?.getAttribute('data-testid'),
            )}
          </div>
          <div data-testid="position-reference-text">
            {String(isElement(refs.reference.value as any))}
          </div>
        </>
      );
    });

    const {rerender} = render(<App />);
    await flushMicrotasks();

    expect(screen.getByTestId('reference-text').textContent).toBe('reference');
    expect(screen.getByTestId('position-reference-text').textContent).toBe('false');

    rerender();
    await flushMicrotasks();

    expect(screen.getByTestId('reference-text').textContent).toBe('reference');
    expect(screen.getByTestId('position-reference-text').textContent).toBe('false');
  });

  test('handles unstable reference prop', async () => {
    const App = defineComponent(function () {
      const {refs} = useFloating<HTMLDivElement>();

      return () => (
        <>
          <div
            ref={(node) => refs.setReference(node)}
            data-testid="reference"
          />
          <div
            ref={refs.setPositionReference}
            data-testid="position-reference"
          />
          <div data-testid="reference-text">
            {String(
              refs.domReference.value?.getAttribute('data-testid'),
            )}
          </div>
          <div data-testid="position-reference-text">
            {String(isElement(refs.reference.value as any))}
          </div>
        </>
      );
    });

    const {rerender} = render(<App />);
    await flushMicrotasks();

    expect(screen.getByTestId('reference-text').textContent).toBe('reference');
    expect(screen.getByTestId('position-reference-text').textContent).toBe('false');

    rerender();
    await flushMicrotasks();

    expect(screen.getByTestId('reference-text').textContent).toBe('reference');
    expect(screen.getByTestId('position-reference-text').textContent).toBe('false');
  });

  test('handles real virtual element', async () => {
    const App = defineComponent(function () {
      const {refs} = useFloating();

      onMounted(() => {
        refs.setPositionReference({
          getBoundingClientRect: () => ({
            x: 218,
            y: 0,
            width: 0,
            height: 0,
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }),
        });
      });

      return () => (
        <>
          <div
            ref={(node) => refs.setReference(node)}
            data-testid="reference"
          />
          <div data-testid="reference-text">
            {String(
              refs.domReference.value?.getAttribute('data-testid'),
            )}
          </div>
          <div data-testid="position-reference-text">
            {refs.reference.value?.getBoundingClientRect().x}
          </div>
        </>
      );
    });

    const {rerender} = render(<App />);
    await flushMicrotasks();

    expect(screen.getByTestId('reference-text').textContent).toBe('reference');
    expect(screen.getByTestId('position-reference-text').textContent).toBe('218');

    rerender();
    await flushMicrotasks();

    expect(screen.getByTestId('reference-text').textContent).toBe('reference');
    expect(screen.getByTestId('position-reference-text').textContent).toBe('218');
  });

  test('does not error when using `inline` middleware and setting the position reference to a real element', async () => {
    const App = defineComponent(function () {
      const {refs} = useFloating({
        middleware: [inline()],
      });

      return () => (
        <>
          <div ref={refs.setReference} />
          <div ref={refs.setPositionReference} />
          <div ref={refs.setFloating} />
        </>
      );
    });

    render(<App />);
    await act(async () => {});
  });
});

test('#2129: interactions.getFloatingProps as a dep does not cause setState loop', async () => {
  const App = defineComponent(function () {
    const {refs, context} = useFloating({
      open: true,
    });

    const interactions = useInteractions([
      useHover(context),
      useClick(context),
      useFocus(context),
      useDismiss(context),
    ]);

    return () => (
      <>
        <div ref={refs.setReference} {...interactions.getReferenceProps()} />
        <div
          data-testid="floating"
          ref={refs.setFloating}
          {...interactions.getFloatingProps()}
        />
      </>
    );
  });

  render(<App />);
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.queryByTestId('floating')).toBeInTheDocument();
});

test('domReference refers to externally synchronized `reference`', async () => {
  const App = defineComponent(function () {
    const referenceEl = ref<Element | null>(null);
    const isOpen = ref(false);
    const {refs, context} = useFloating({
      open: isOpen,
      onOpenChange: (o) => {
        isOpen.value = o;
      },
      elements: {reference: referenceEl},
    });

    const hover = useHover(context);

    const {getReferenceProps, getFloatingProps} = useInteractions([hover]);

    return () => (
      <>
        <button
          ref={(el) => {
            referenceEl.value = el;
          }}
          {...getReferenceProps()}
        />
        {isOpen.value && (
          <div
            role="dialog"
            ref={refs.setFloating}
            {...getFloatingProps()}
          />
        )}
      </>
    );
  });

  render(<App />);
  await flushMicrotasks();

  await userEvent.hover(screen.getByRole('button'));
  await act(async () => {});
  await flushMicrotasks();

  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('onOpenChange is passed an event as second param', async () => {
  const onOpenChange = vi.fn();

  const App = defineComponent(function () {
    const isOpen = ref(false);
    const {refs, context} = useFloating({
      open: isOpen,
      onOpenChange(open, event) {
        onOpenChange(open, event);
        isOpen.value = open;
      },
    });

    const hover = useHover(context, {
      move: false,
    });

    const {getReferenceProps, getFloatingProps} = useInteractions([hover]);

    return () => (
      <>
        <button ref={refs.setReference} {...getReferenceProps()} />
        {isOpen.value && (
          <div ref={refs.setFloating} {...getFloatingProps()} />
        )}
      </>
    );
  });

  render(<App />);
  await flushMicrotasks();

  await userEvent.hover(screen.getByRole('button'));
  await act(async () => {});
  await flushMicrotasks();

  expect(onOpenChange.mock.calls[0][0]).toBe(true);
  expect(onOpenChange.mock.calls[0][1]).toBeInstanceOf(MouseEvent);

  await userEvent.unhover(screen.getByRole('button'));
  await flushMicrotasks();

  expect(onOpenChange.mock.calls[1][0]).toBe(false);
  expect(onOpenChange.mock.calls[1][1]).toBeInstanceOf(MouseEvent);
});

test('refs.domReference.current is synchronized with external reference', async () => {
  let isSameNode = false;

  const App = defineComponent(function () {
    const referenceEl = ref<Element | null>(null);
    const {refs} = useFloating<HTMLButtonElement>({
      elements: {
        reference: referenceEl,
      },
    });

    return () => (
      <button
        ref={(el) => {
          referenceEl.value = el;
        }}
        onClick={(event) => {
          isSameNode = event.currentTarget === refs.domReference.value;
        }}
      />
    );
  });

  render(<App />);
  await flushMicrotasks();

  fireEvent.click(screen.getByRole('button'));
  await flushMicrotasks();

  expect(isSameNode).toBe(true);
});
