import {act, fireEvent, flushMicrotasks, render, screen} from './utils';
import {createElement, isValidElement} from '@actview/jsx';
import {defineComponent, ref} from '@actview/core';
import {vi} from 'vitest';

import {
  FloatingDelayGroup,
  useDelayGroup,
  useFloating,
  useHover,
  useInteractions,
} from '../../src';

vi.useFakeTimers();

const Tooltip = defineComponent(function (props: {
  label: string;
  children?: any;
}) {
  const open = ref(false);

  const {x, y, refs, strategy, context} = useFloating({
    open,
    onOpenChange: (o) => {
      open.value = o;
    },
  });

  // useDelayGroup 返回 Ref<GroupContext>；delay 随 group 状态变化
  // （如切换到新的 reference 时变为 {open: 1, close: ...}），
  // 用函数形式让 useHover 每次事件处理时读取最新值（React 版靠重渲染传值）。
  const groupContext = useDelayGroup(context);
  const hover = useHover(context, {delay: () => groupContext.value.delay});
  const {getReferenceProps} = useInteractions([hover]);

  return () => {
    const child = props.children;
    const referenceProps = getReferenceProps({ref: refs.setReference});
    const referenceEl =
      isValidElement(child) && typeof child.type === 'string'
        ? createElement(child.type, {
            ...child.props,
            ...referenceProps,
          })
        : child;

    return (
      <>
        {referenceEl}
        {open.value && (
          <div
            data-testid={`floating-${props.label}`}
            ref={refs.setFloating}
            style={{
              position: strategy.value,
              top: y.value ?? '',
              left: x.value ?? '',
            }}
          >
            {props.label}
          </div>
        )}
      </>
    );
  };
});

const App = defineComponent(function () {
  return () => (
    <FloatingDelayGroup delay={{open: 1000, close: 200}}>
      <Tooltip label="one">
        <button data-testid="reference-one" />
      </Tooltip>
      <Tooltip label="two">
        <button data-testid="reference-two" />
      </Tooltip>
      <Tooltip label="three">
        <button data-testid="reference-three" />
      </Tooltip>
    </FloatingDelayGroup>
  );
});

test('groups delays correctly', async () => {
  render(<App />);
  await flushMicrotasks();

  fireEvent.mouseEnter(screen.getByTestId('reference-one'));
  await flushMicrotasks();

  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-one')).not.toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(999);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-one')).toBeInTheDocument();

  fireEvent.mouseEnter(screen.getByTestId('reference-two'));
  await flushMicrotasks();

  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-one')).not.toBeInTheDocument();
  expect(screen.queryByTestId('floating-two')).toBeInTheDocument();

  fireEvent.mouseEnter(screen.getByTestId('reference-three'));
  await flushMicrotasks();

  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-two')).not.toBeInTheDocument();
  expect(screen.queryByTestId('floating-three')).toBeInTheDocument();

  fireEvent.mouseLeave(screen.getByTestId('reference-three'));
  await flushMicrotasks();

  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-three')).toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(199);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-three')).not.toBeInTheDocument();
});

test('timeoutMs', async () => {
  const AppWithTimeout = defineComponent(function () {
    return () => (
      <FloatingDelayGroup delay={{open: 1000, close: 100}} timeoutMs={500}>
        <Tooltip label="one">
          <button data-testid="reference-one" />
        </Tooltip>
        <Tooltip label="two">
          <button data-testid="reference-two" />
        </Tooltip>
        <Tooltip label="three">
          <button data-testid="reference-three" />
        </Tooltip>
      </FloatingDelayGroup>
    );
  });

  render(<AppWithTimeout />);
  await flushMicrotasks();

  fireEvent.mouseEnter(screen.getByTestId('reference-one'));
  await flushMicrotasks();

  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
  await flushMicrotasks();

  fireEvent.mouseLeave(screen.getByTestId('reference-one'));
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-one')).toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(499);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-one')).not.toBeInTheDocument();

  fireEvent.mouseEnter(screen.getByTestId('reference-two'));
  await flushMicrotasks();

  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-two')).toBeInTheDocument();

  fireEvent.mouseEnter(screen.getByTestId('reference-three'));
  await flushMicrotasks();

  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-two')).not.toBeInTheDocument();
  expect(screen.queryByTestId('floating-three')).toBeInTheDocument();

  fireEvent.mouseLeave(screen.getByTestId('reference-three'));
  await flushMicrotasks();

  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-three')).toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(99);
  });
  await flushMicrotasks();

  expect(screen.queryByTestId('floating-three')).not.toBeInTheDocument();
});
