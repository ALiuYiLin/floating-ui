import {defineComponent, ref} from '@actview/core';

import userEvent from '@testing-library/user-event';

import {useClick, useFloating, useHover, useInteractions} from '../../src';
import type {UseClickProps} from '../../src/hooks/useClick';
import {
  act,
  cleanup,
  fireEvent,
  flushMicrotasks,
  render,
  screen,
} from './utils';

const App = defineComponent(function (
  props: UseClickProps & {
    referenceElement?: string;
    typeable?: boolean;
    initialOpen?: boolean;
  },
) {
  const referenceElement = props.referenceElement ?? 'button';
  const typeable = props.typeable ?? false;
  const open = ref(props.initialOpen ?? false);
  const {refs, context} = useFloating({
    open,
    onOpenChange: (o) => {
      open.value = o;
    },
  });
  const {getReferenceProps, getFloatingProps} = useInteractions([
    useClick(context, props),
  ]);

  const Tag = typeable ? 'input' : referenceElement;

  return () => (
    <>
      <Tag
        {...getReferenceProps({ref: refs.setReference})}
        data-testid="reference"
        // @ts-expect-error
        href={referenceElement === 'a' ? '#' : undefined}
      />
      {open.value && (
        <div role="tooltip" {...getFloatingProps({ref: refs.setFloating})} />
      )}
    </>
  );
});

describe('default', () => {
  test('changes `open` state to `true` after click', async () => {
    render(<App />);
    const button = screen.getByRole('button');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    cleanup();
  });

  test('changes `open` state to `false` after two clicks', async () => {
    render(<App />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    cleanup();
  });
});

describe('mousedown `event` prop', () => {
  test('changes `open` state to `true` after click', async () => {
    render(<App event="mousedown" />);
    const button = screen.getByRole('button');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    cleanup();
  });

  test('changes `open` state to `false` after two clicks', async () => {
    render(<App event="mousedown" />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    cleanup();
  });
});

describe('`toggle` prop', () => {
  test('changes `open` state to `true` after click', async () => {
    render(<App toggle={false} />);
    const button = screen.getByRole('button');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    cleanup();
  });

  test('`open` state remains `true` after two clicks', async () => {
    render(<App toggle={false} />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    cleanup();
  });

  test('`open` state remains `true` after two clicks with `mousedown`', async () => {
    render(<App toggle={false} event="mousedown" />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    cleanup();
  });

  test('`open` state becomes `false` after clicking when initially open', async () => {
    render(<App initialOpen={true} />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    cleanup();
  });
});

describe('`stickIfOpen` prop', async () => {
  const AppStick = defineComponent(function (props: {stickIfOpen?: boolean}) {
    const open = ref(false);
    const {refs, context} = useFloating({
      open,
      onOpenChange: (o) => {
        open.value = o;
      },
    });
    const {getReferenceProps, getFloatingProps} = useInteractions([
      useHover(context),
      useClick(context, {stickIfOpen: props.stickIfOpen}),
    ]);

    return () => (
      <>
        <button
          {...getReferenceProps({ref: refs.setReference})}
          data-testid="reference"
        />
        {open.value && (
          <div role="tooltip" {...getFloatingProps({ref: refs.setFloating})} />
        )}
      </>
    );
  });

  test('true: `open` state remains `true` after click and mouseleave', async () => {
    render(<AppStick stickIfOpen />);
    await flushMicrotasks();

    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    await flushMicrotasks();

    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    cleanup();
  });

  test('false: `open` state becomes `false` after click and mouseleave', async () => {
    render(<AppStick stickIfOpen={false} />);
    await flushMicrotasks();

    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    await flushMicrotasks();

    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    fireEvent.click(button);
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    cleanup();
  });
});

describe('non-buttons', () => {
  test('adds Enter keydown', async () => {
    render(<App referenceElement="div" />);

    const button = screen.getByTestId('reference');
    fireEvent.keyDown(button, {key: 'Enter'});
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();
    cleanup();
  });

  test('anchor does not add Enter keydown', async () => {
    render(<App referenceElement="a" />);

    const button = screen.getByTestId('reference');

    button.focus();
    await userEvent.keyboard('{Enter}');
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    cleanup();
  });

  test('adds Space keyup', async () => {
    render(<App referenceElement="div" />);

    const button = screen.getByTestId('reference');
    fireEvent.keyDown(button, {key: ' '});
    fireEvent.keyUp(button, {key: ' '});
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();
    cleanup();
  });

  test('typeable reference does not receive space key handler', async () => {
    render(<App typeable={true} />);

    const button = screen.getByTestId('reference');
    fireEvent.keyDown(button, {key: ' '});
    fireEvent.keyUp(button, {key: ' '});
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    cleanup();
  });

  test('typeable reference does receive Enter key handler', async () => {
    render(<App typeable={true} />);

    const button = screen.getByTestId('reference');
    fireEvent.keyDown(button, {key: 'Enter'});
    await flushMicrotasks();

    expect(screen.queryByRole('tooltip')).toBeInTheDocument();
    cleanup();
  });
});

test('ignores Space keydown on another element then keyup on the button', async () => {
  render(<App />);
  await act(async () => {});

  const button = screen.getByRole('button');
  fireEvent.keyDown(document.body, {key: ' '});
  fireEvent.keyUp(button, {key: ' '});
  await flushMicrotasks();

  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

test('reason string', async () => {
  const ReasonApp = defineComponent(function () {
    const isOpen = ref(false);
    const {refs, context} = useFloating({
      open: isOpen,
      onOpenChange(open, _, reason) {
        isOpen.value = open;
        expect(reason).toBe('click');
      },
    });

    const focus = useClick(context);
    const {getReferenceProps, getFloatingProps} = useInteractions([focus]);

    return () => (
      <>
        <button ref={refs.setReference} {...getReferenceProps()} />
        {isOpen.value && (
          <div
            role="tooltip"
            ref={refs.setFloating}
            {...getFloatingProps()}
          />
        )}
      </>
    );
  });

  render(<ReasonApp />);
  const button = screen.getByRole('button');
  fireEvent.click(button);
  await act(async () => {});
  fireEvent.click(button);
});
