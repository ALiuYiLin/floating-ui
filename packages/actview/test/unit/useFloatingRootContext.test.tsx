import {defineComponent, ref, type Ref} from '@actview/core';

import {
  useClick,
  useFloating,
  useFloatingRootContext,
  useInteractions,
} from '../../src';
import {act, fireEvent, render, screen} from './utils';

test('interaction hooks accept root context', async () => {
  const Root = defineComponent(function () {
    const isOpen = ref(false);
    const anchor = ref<Element | null>(null);
    const tooltip = ref<HTMLElement | null>(null);

    const context = useFloatingRootContext({
      open: isOpen,
      onOpenChange: (o) => {
        isOpen.value = o;
      },
      elements: {
        reference: anchor,
        floating: tooltip,
      },
    });

    const hover = useClick(context);

    const {getReferenceProps, getFloatingProps} = useInteractions([hover]);

    return () => (
      <>
        <button
          ref={(el) => {
            anchor.value = el;
          }}
          {...getReferenceProps()}
        />
        {isOpen.value && (
          <Tooltip
            setTooltip={(el) => {
              tooltip.value = el;
            }}
            getFloatingProps={getFloatingProps}
            context={context}
          />
        )}
      </>
    );
  });

  const Tooltip = defineComponent(function (props: {
    setTooltip: (tooltip: HTMLElement | null) => void;
    getFloatingProps: () => Record<string, any>;
    context: ReturnType<typeof useFloatingRootContext>;
  }) {
    const {floatingStyles} = useFloating({rootContext: props.context});
    return () => (
      <div
        ref={(el) => {
          props.setTooltip(el);
        }}
        style={floatingStyles.value}
        {...props.getFloatingProps()}
      >
        Tooltip
      </div>
    );
  });

  render(<Root />);

  fireEvent.click(screen.getByRole('button'));
  await act(async () => {});

  expect(screen.getByText('Tooltip')).toBeInTheDocument();
});
