import type {Coords} from '@floating-ui/utils';
import {defineComponent, ref} from '@actview/core';
import {test} from 'vitest';

import {useClientPoint, useFloating, useInteractions} from '../../src';
import {isJSDOM} from '../../src/utils';
import {
  act,
  fireEvent,
  flushMicrotasks,
  render,
  screen,
} from './utils';

function expectLocation({x, y}: Coords) {
  expect(Number(screen.getByTestId('x')?.textContent)).toBe(x);
  expect(Number(screen.getByTestId('y')?.textContent)).toBe(y);
  expect(Number(screen.getByTestId('width')?.textContent)).toBe(0);
  expect(Number(screen.getByTestId('height')?.textContent)).toBe(0);
}

const App = defineComponent(function (props: {
  enabled?: boolean;
  point?: Coords;
  axis?: 'both' | 'x' | 'y';
}) {
  const isOpen = ref(false);
  const {refs, elements, context} = useFloating({
    open: isOpen,
    onOpenChange: (o) => {
      isOpen.value = o;
    },
  });
  const clientPoint = useClientPoint(context, {
    enabled: props.enabled ?? true,
    ...(props.point ?? {}),
    axis: props.axis,
  });
  const {getReferenceProps, getFloatingProps} = useInteractions([
    clientPoint,
  ]);

  return () => {
    const rect = elements.reference.value?.getBoundingClientRect();

    return (
      <>
        <div
          data-testid="reference"
          ref={refs.setReference}
          {...getReferenceProps()}
          style={{width: 0, height: 0}}
        >
          Reference
        </div>
        {isOpen.value && (
          <div
            data-testid="floating"
            ref={refs.setFloating}
            {...getFloatingProps()}
          >
            Floating
          </div>
        )}
        <button
          onClick={() => {
            isOpen.value = !isOpen.value;
          }}
        />
        <span data-testid="x">{rect?.x}</span>
        <span data-testid="y">{rect?.y}</span>
        <span data-testid="width">{rect?.width}</span>
        <span data-testid="height">{rect?.height}</span>
      </>
    );
  };
});

// jsdom 无布局引擎：getBoundingClientRect 恒返回 0 坐标，这些断言依赖
// 真实布局（rect.x === clientX），与 useFocus 的 shadow root 测试同理
// 仅在浏览器模式验证（upstream 在 TEST_ENV=browser 跑）
test.skipIf(isJSDOM())('renders at explicit client point and can be updated', async () => {
  const {rerender} = render(<App point={{x: 0, y: 0}} />);

  fireEvent.click(screen.getByRole('button'));
  await flushMicrotasks();

  expectLocation({x: 0, y: 0});

  rerender({point: {x: 1000, y: 1000}});
  await act(async () => {});

  expectLocation({x: 1000, y: 1000});
});

test.skipIf(isJSDOM())('renders at mouse event coords', async () => {
  render(<App />);

  await act(async () => {});

  fireEvent(
    screen.getByTestId('reference'),
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
    }),
  );
  await act(async () => {});

  expectLocation({x: 500, y: 500});

  fireEvent(
    screen.getByTestId('reference'),
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 1000,
      clientY: 1000,
    }),
  );
  await act(async () => {});

  expectLocation({x: 1000, y: 1000});

  // Window listener isn't registered unless the floating element is open.
  fireEvent(
    window,
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 700,
      clientY: 700,
    }),
  );
  await act(async () => {});

  expectLocation({x: 1000, y: 1000});

  fireEvent.click(screen.getByRole('button'));
  await act(async () => {});

  fireEvent(
    screen.getByTestId('reference'),
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 700,
      clientY: 700,
    }),
  );
  await act(async () => {});

  expectLocation({x: 700, y: 700});

  fireEvent(
    document.body,
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 0,
      clientY: 0,
    }),
  );
  await act(async () => {});

  expectLocation({x: 0, y: 0});
});

test('ignores mouse events when explicit coords are specified', async () => {
  render(<App point={{x: 0, y: 0}} />);

  fireEvent(
    screen.getByTestId('reference'),
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
    }),
  );
  await act(async () => {});

  expectLocation({x: 0, y: 0});
});

test.skipIf(isJSDOM())('cleans up window listener when closing or disabling', async () => {
  const {rerender} = render(<App />);

  fireEvent.click(screen.getByRole('button'));
  await flushMicrotasks();

  fireEvent(
    screen.getByTestId('reference'),
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
    }),
  );
  await act(async () => {});

  fireEvent.click(screen.getByRole('button'));
  await flushMicrotasks();

  fireEvent(
    document.body,
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 0,
      clientY: 0,
    }),
  );
  await act(async () => {});

  expectLocation({x: 500, y: 500});

  fireEvent.click(screen.getByRole('button'));
  await flushMicrotasks();

  fireEvent(
    document.body,
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
    }),
  );
  await act(async () => {});

  expectLocation({x: 500, y: 500});

  rerender({enabled: false});
  await act(async () => {});

  fireEvent(
    document.body,
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 0,
      clientY: 0,
    }),
  );
  await act(async () => {});

  expectLocation({x: 500, y: 500});
});

test.skipIf(isJSDOM())('axis x', async () => {
  render(<App axis="x" />);

  fireEvent.click(screen.getByRole('button'));
  await flushMicrotasks();

  fireEvent(
    screen.getByTestId('reference'),
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
    }),
  );
  await act(async () => {});

  expectLocation({x: 500, y: 0});
});

test.skipIf(isJSDOM())('axis y', async () => {
  render(<App axis="y" />);

  fireEvent.click(screen.getByRole('button'));
  await flushMicrotasks();

  fireEvent(
    screen.getByTestId('reference'),
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
    }),
  );
  await act(async () => {});

  expectLocation({x: 0, y: 500});
});

test.skipIf(isJSDOM())('removes window listener when cursor lands on floating element', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button'));
  await flushMicrotasks();

  fireEvent(
    screen.getByTestId('reference'),
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
    }),
  );

  fireEvent(
    screen.getByTestId('floating'),
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 500,
      clientY: 500,
    }),
  );

  fireEvent(
    document.body,
    new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 0,
      clientY: 0,
    }),
  );
  await act(async () => {});

  expectLocation({x: 500, y: 500});
});
