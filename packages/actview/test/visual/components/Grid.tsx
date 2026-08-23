import {defineComponent, ref} from '@actview/core';

import {
  FloatingFocusManager,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
} from '../../../src';

interface Props {
  orientation?: 'horizontal' | 'both';
  loop?: boolean;
}

export const Main = defineComponent(function (props: Props) {
  const open = ref(false);
  const activeIndex = ref<number | null>(null);

  const listRef = ref<Array<HTMLElement | null>>([]);

  const {floatingStyles, refs, context} = useFloating({
    open,
    onOpenChange: (o) => {
      open.value = o;
    },
    placement: 'bottom-start',
  });

  const disabledIndices = [0, 1, 2, 3, 4, 5, 6, 7, 10, 15, 45, 48];

  const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
    useClick(context),
    useListNavigation(context, {
      listRef,
      activeIndex,
      onNavigate: (i) => {
        activeIndex.value = i;
      },
      cols: 5,
      orientation: props.orientation ?? 'horizontal',
      loop: props.loop ?? false,
      openOnArrowKeyDown: false,
      disabledIndices,
    }),
    useDismiss(context),
  ]);

  return () => (
    <>
      <h1>Grid</h1>
      <div className="container">
        <button ref={refs.setReference} {...getReferenceProps()}>
          Reference
        </button>
        {open.value && (
          <FloatingFocusManager context={context}>
            <div
              role="menu"
              ref={refs.setFloating}
              data-testid="floating"
              className="grid gap-2"
              style={{
                ...floatingStyles,
                gridTemplateColumns: '100px 100px 100px 100px 100px',
                zIndex: 999,
              }}
              {...getFloatingProps()}
            >
              {[...Array(49)].map((_, index) => (
                <button
                  role="option"
                  key={index}
                  aria-selected={activeIndex.value === index}
                  tabIndex={activeIndex.value === index ? 0 : -1}
                  disabled={disabledIndices.includes(index)}
                  ref={(node) => {
                    listRef.value[index] = node;
                  }}
                  className="border border-black disabled:opacity-20"
                  {...getItemProps()}
                >
                  Item {index}
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        )}
      </div>
    </>
  );
});
