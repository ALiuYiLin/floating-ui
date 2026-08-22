import {act, cleanup, fireEvent, flushMicrotasks, render, screen} from './utils';
import {defineComponent, onMounted, ref} from '@actview/core';

import {FloatingPortal, useFloating} from '../../src';

const App = defineComponent(function (props: {
  root?: HTMLElement | null | Ref<HTMLElement | null>;
  id?: string;
}) {
  const open = ref(false);
  const {refs} = useFloating({
    open,
    onOpenChange: (o) => {
      open.value = o;
    },
  });

  return () => (
    <>
      <button
        data-testid="reference"
        ref={refs.setReference}
        onClick={() => {
          open.value = !open.value;
        }}
      />
      <FloatingPortal {...props}>
        {open.value && <div ref={refs.setFloating} data-testid="floating" />}
      </FloatingPortal>
    </>
  );
});

test('creates a custom id node', () => {
  render(<App id="custom-id" />);
  expect(document.querySelector('#custom-id')).toBeInTheDocument();
  cleanup();
});

test('uses a custom id node as the root', async () => {
  const customRoot = document.createElement('div');
  customRoot.id = 'custom-root';
  document.body.appendChild(customRoot);
  render(<App id="custom-root" />);
  await flushMicrotasks();
  fireEvent.click(screen.getByTestId('reference'));
  await act(async () => {});
  await flushMicrotasks();
  expect(screen.getByTestId('floating').parentElement?.parentElement).toBe(
    customRoot,
  );
  customRoot.remove();
});

test('creates a custom id node as the root', async () => {
  render(<App id="custom-id" />);
  await flushMicrotasks();
  fireEvent.click(screen.getByTestId('reference'));
  await act(async () => {});
  await flushMicrotasks();
  expect(screen.getByTestId('floating').parentElement?.parentElement?.id).toBe(
    'custom-id',
  );
});

test('allows custom roots', async () => {
  const customRoot = document.createElement('div');
  customRoot.id = 'custom-root';
  document.body.appendChild(customRoot);
  render(<App root={customRoot} />);
  await flushMicrotasks();
  fireEvent.click(screen.getByTestId('reference'));
  await flushMicrotasks();
  await act(async () => {});

  const parent = screen.getByTestId('floating').parentElement;
  expect(parent?.hasAttribute('data-floating-ui-portal')).toBe(true);
  expect(parent?.parentElement).toBe(customRoot);
  customRoot.remove();
});

test('allows refs as roots', async () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const rootRef = ref<HTMLElement | null>(el);
  render(<App root={rootRef} />);
  await flushMicrotasks();
  fireEvent.click(screen.getByTestId('reference'));
  await act(async () => {});
  await flushMicrotasks();
  const parent = screen.getByTestId('floating').parentElement;
  expect(parent?.hasAttribute('data-floating-ui-portal')).toBe(true);
  expect(parent?.parentElement).toBe(el);
  document.body.removeChild(el);
});

test('allows roots to be initially null', async () => {
  const RootApp = defineComponent(function () {
    const root = ref<HTMLElement | null>(null);
    const renderRoot = ref(false);

    onMounted(() => {
      renderRoot.value = true;
    });

    return () => (
      <>
        {renderRoot.value && <div ref={root} data-testid="root" />}
        <App root={root} />
      </>
    );
  });

  render(<RootApp />);
  await flushMicrotasks();

  fireEvent.click(screen.getByTestId('reference'));
  await act(async () => {});
  await flushMicrotasks();

  const subRoot = screen.getByTestId('floating').parentElement;
  const root = screen.getByTestId('root');
  expect(root).toBe(subRoot?.parentElement);
});
