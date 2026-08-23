import {defineComponent, ref, watch, type Ref} from '@actview/core';
import type {SideObject} from '@floating-ui/dom';
import {flip, offset, shift, size} from '@floating-ui/dom';

import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  inner,
  useClick,
  useDismiss,
  useFloating,
  useInnerOffset,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
} from '../../../src';

import {Button} from '../lib/Button';
import {clearTimeoutIfSet} from '../../../src/utils/clearTimeoutIfSet';

const fruits = [
  '🍒 Cherry',
  '🍓 Strawberry',
  '🍇 Grape',
  '🍎 Apple',
  '🍉 Watermelon',
  '🍑 Peach',
  '🍊 Orange',
  '🍋 Lemon',
  '🍍 Pineapple',
  '🍌 Banana',
  '🥑 Avocado',
  '🍏 Green Apple',
  '🍈 Melon',
  '🍐 Pear',
  '🥝 Kiwifruit',
  '🥭 Mango',
  '🥥 Coconut',
  '🍅 Tomato',
  '🫐 Blueberry',
];

const getParts = (fruitString: string) => ({
  emoji: fruitString.slice(0, 3),
  text: fruitString.slice(3),
});
// Padding for .scrollTop for when to show the scroll arrow
const SCROLL_ARROW_PADDING = 10;

const shouldShowArrow = (
  scrollRef: Ref<HTMLDivElement | null>,
  dir: 'down' | 'up',
) => {
  if (scrollRef.value) {
    const {scrollTop, scrollHeight, clientHeight} = scrollRef.value;
    if (dir === 'up') {
      return scrollTop >= SCROLL_ARROW_PADDING;
    }

    if (dir === 'down') {
      return scrollTop <= scrollHeight - clientHeight - SCROLL_ARROW_PADDING;
    }
  }

  return false;
};

export const ScrollArrow = defineComponent(function (props: {
  open: boolean;
  dir: 'up' | 'down';
  scrollRef: Ref<HTMLDivElement | null>;
  scrollTop: number;
  innerOffset: number;
  onScroll: (amount: number) => void;
  onHide: () => void;
}) {
  const show = ref(false);
  const frameRef = ref(-1);
  const statusRef = ref<'idle' | 'active'>('idle');

  // Updates the visibility state of the arrow when necessary.
  // React 版 useLayoutEffect（依赖 open/innerOffset/scrollTop/scrollRef/dir）。
  watch(
    () => [props.open, props.innerOffset, props.scrollTop, props.scrollRef.value],
    () => {
      if (props.open) {
        // Wait for the floating element to be positioned, and
        // the item to be scrolled to.
        requestAnimationFrame(() => {
          // actview 无 flushSync：直接同步状态。
          if (statusRef.value !== 'active') {
            show.value = shouldShowArrow(props.scrollRef, props.dir);
          }
        });
      }
    },
    {immediate: true},
  );

  // While pressing the scroll arrows on touch devices,
  // prevent selection once they disappear (lift finger)
  watch(
    () => [show.value, props.scrollTop],
    () => {
      if (!show.value && statusRef.value === 'active') {
        props.onHide();
      }
    },
    {immediate: true},
  );

  const handlePointerEnter = () => {
    statusRef.value = 'active';
    let prevNow = Date.now();

    function frame() {
      if (props.scrollRef.value) {
        const currentNow = Date.now();
        const msElapsed = currentNow - prevNow;
        prevNow = currentNow;

        const pixelsToScroll = msElapsed / 2;

        const remainingPixels =
          props.dir === 'up'
            ? props.scrollRef.value.scrollTop
            : props.scrollRef.value.scrollHeight -
              props.scrollRef.value.clientHeight -
              props.scrollRef.value.scrollTop;

        const scrollRemaining =
          props.dir === 'up'
            ? props.scrollRef.value.scrollTop - pixelsToScroll > 0
            : props.scrollRef.value.scrollTop + pixelsToScroll <
              props.scrollRef.value.scrollHeight -
                props.scrollRef.value.clientHeight;

        props.onScroll(
          props.dir === 'up'
            ? Math.min(pixelsToScroll, remainingPixels)
            : Math.max(-pixelsToScroll, -remainingPixels),
        );

        if (scrollRemaining) {
          frameRef.value = requestAnimationFrame(frame);
        } else {
          show.value = shouldShowArrow(props.scrollRef, props.dir);
        }
      }
    }

    cancelAnimationFrame(frameRef.value);
    frameRef.value = requestAnimationFrame(frame);
  };

  const handlePointerLeave = () => {
    statusRef.value = 'idle';
    cancelAnimationFrame(frameRef.value);
  };

  return () => (
    <div
      className={`absolute text-center flex justify-center items-center py-1 cursor-default bg-white${
        props.dir === 'up' ? ' top-0' : ' bottom-0'
      }`}
      data-dir={props.dir}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      style={{
        visibility: show.value ? 'visible' : 'hidden',
        width: 'calc(100% - 4px)',
      }}
    >
      {props.dir === 'up' ? '▲' : '▼'}
    </div>
  );
});

export const Main = defineComponent(function () {
  const listRef = ref<Array<HTMLElement | null>>([]);
  const listContentRef = ref<Array<string | null>>([]);
  const overflowRef = ref<SideObject | null>(null);
  const allowSelectRef = ref(false);
  const allowMouseUpRef = ref(true);
  const selectTimeoutRef = ref(-1);
  const scrollRef = ref<HTMLDivElement | null>(null);

  const open = ref(false);
  const selectedIndex = ref(12);
  const activeIndex = ref<number | null>(null);
  const fallback = ref(false);
  const innerOffset = ref(0);
  const touch = ref(false);
  const scrollTop = ref(0);
  const blockSelection = ref(false);

  const {floatingStyles, refs, context} = useFloating({
    placement: 'bottom-start',
    open,
    onOpenChange: (o) => {
      open.value = o;
    },
    // actview setup 一次：middleware 分支按 setup 时 fallback 快照选择，
    // 后续 fallback 变化不再重建（React 版每次渲染重建）。
    middleware: fallback.value
      ? [
          offset(5),
          touch.value
            ? shift({crossAxis: true, padding: 10})
            : flip({padding: 10}),
          size({
            apply({availableHeight, rects}) {
              Object.assign(scrollRef.value?.style ?? {}, {
                maxHeight: `${availableHeight}px`,
                minWidth: `${rects.reference.width}px`,
              });
            },
            padding: 10,
          }),
        ]
      : [
          size({
            apply({elements, rects}) {
              Object.assign(elements.floating.style, {
                minWidth: `${rects.reference.width + 8}px`,
              });
            },
          }),
          inner({
            listRef,
            overflowRef,
            scrollRef,
            index: selectedIndex.value,
            offset: innerOffset,
            onFallbackChange: (f) => {
              fallback.value = f;
            },
            padding: 10,
            minItemsVisible: touch.value ? 10 : 4,
            referenceOverflowThreshold: 20,
          }),
          offset({crossAxis: -5}),
        ],
  });

  const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
    useClick(context, {event: 'mousedown'}),
    useDismiss(context),
    useRole(context, {role: 'select'}),
    useInnerOffset(context, {
      enabled: !fallback.value,
      onChange: (v) => {
        innerOffset.value = v;
      },
      overflowRef,
      scrollRef,
    }),
    useListNavigation(context, {
      listRef,
      activeIndex,
      selectedIndex,
      onNavigate: (i) => {
        activeIndex.value = i;
      },
    }),
    useTypeahead(context, {
      listRef: listContentRef,
      activeIndex,
      onMatch: (i) => {
        if (open.value) {
          activeIndex.value = i;
        } else {
          selectedIndex.value = i;
        }
      },
    }),
  ]);

  watch(
    open,
    () => {
      if (open.value) {
        selectTimeoutRef.value = window.setTimeout(() => {
          allowSelectRef.value = true;
        }, 300);

        return () => {
          clearTimeoutIfSet(selectTimeoutRef);
        };
      }

      allowSelectRef.value = false;
      allowMouseUpRef.value = true;
      innerOffset.value = 0;
      fallback.value = false;
      blockSelection.value = false;
    },
    {immediate: true},
  );

  const handleArrowScroll = (amount: number) => {
    if (fallback.value) {
      if (scrollRef.value) {
        scrollRef.value.scrollTop -= amount;
        scrollTop.value = scrollRef.value?.scrollTop ?? 0;
      }
    } else {
      innerOffset.value -= amount;
    }
  };

  const handleArrowHide = () => {
    if (touch.value) {
      clearTimeoutIfSet(selectTimeoutRef);
      blockSelection.value = true;
      selectTimeoutRef.value = window.setTimeout(() => {
        blockSelection.value = false;
      }, 400);
    }
  };

  return () => {
    const {emoji, text} = getParts(fruits[selectedIndex.value]);

    return (
      <>
        <h1 className="text-5xl font-bold mb-8">macOS Select</h1>
        <div className="grid place-items-center border border-slate-400 rounded lg:w-[40rem] h-[20rem] mb-4">
          <Button
            ref={refs.setReference}
            className="flex gap-2 items-center"
            {...getReferenceProps({
              onTouchStart() {
                touch.value = true;
              },
              onPointerMove({pointerType}: any) {
                if (pointerType === 'mouse') {
                  touch.value = false;
                }
              },
            })}
          >
            <span aria-hidden>{emoji}</span>
            <span>{text}</span>
            <span aria-hidden>▼</span>
          </Button>
          <FloatingPortal>
            {open.value && (
              <FloatingOverlay lockScroll={!touch.value} style={{zIndex: 1}}>
                <FloatingFocusManager context={context} modal={false}>
                  <div
                    ref={refs.setFloating}
                    style={floatingStyles}
                    className="bg-white shadow-lg border border-slate-900/15 bg-clip-padding rounded-lg outline-none"
                  >
                    <div
                      className="overflow-y-auto p-1 scrollbar-none"
                      ref={scrollRef}
                      {...getFloatingProps({
                        onScroll({currentTarget}: any) {
                          scrollTop.value = currentTarget.scrollTop;
                        },
                        onContextMenu(e: any) {
                          e.preventDefault();
                        },
                      })}
                    >
                      {fruits.map((fruit, i) => {
                        const {emoji, text} = getParts(fruit);
                        return (
                          <Button
                            key={fruit}
                            className="flex justify-between items-center gap-2 w-full outline-none text-left scroll-my-6 transition-none"
                            // Prevent immediate selection on touch devices when
                            // pressing the ScrollArrows
                            disabled={blockSelection.value}
                            style={{
                              background:
                                activeIndex.value === i
                                  ? 'rgba(0,200,255,0.2)'
                                  : i === selectedIndex.value
                                    ? 'rgba(0,0,50,0.05)'
                                    : 'transparent',
                              fontWeight:
                                i === selectedIndex.value ? 'bold' : 'normal',
                            }}
                            tabIndex={i === activeIndex.value ? 0 : -1}
                            ref={(node: HTMLElement | null) => {
                              listRef.value[i] = node;
                              listContentRef.value[i] = text;
                            }}
                            {...getItemProps({
                              active: activeIndex.value === i,
                              selected: selectedIndex.value === i,
                              onTouchStart() {
                                allowSelectRef.value = true;
                                allowMouseUpRef.value = false;
                              },
                              onKeyDown() {
                                allowSelectRef.value = true;
                              },
                              onClick() {
                                if (allowSelectRef.value) {
                                  selectedIndex.value = i;
                                  open.value = false;
                                }
                              },
                              onMouseUp() {
                                if (!allowMouseUpRef.value) {
                                  return;
                                }

                                if (allowSelectRef.value) {
                                  selectedIndex.value = i;
                                  open.value = false;
                                }

                                // On touch devices, prevent the element from
                                // immediately closing `onClick` by deferring it
                                clearTimeoutIfSet(selectTimeoutRef);
                                selectTimeoutRef.value = window.setTimeout(
                                  () => {
                                    allowSelectRef.value = true;
                                  },
                                );
                              },
                            })}
                          >
                            <div className="flex gap-2">
                              <span aria-hidden>{emoji}</span>
                              <span>{text}</span>
                            </div>
                            {selectedIndex.value === i && (
                              <span aria-hidden>✓</span>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                    {!fallback.value &&
                      (['up', 'down'] as Array<'up' | 'down'>).map((dir) => (
                        <ScrollArrow
                          key={dir}
                          dir={dir}
                          scrollTop={scrollTop.value}
                          scrollRef={scrollRef}
                          innerOffset={innerOffset.value}
                          open={open.value}
                          onScroll={handleArrowScroll}
                          onHide={handleArrowHide}
                        />
                      ))}
                  </div>
                </FloatingFocusManager>
              </FloatingOverlay>
            )}
          </FloatingPortal>
        </div>
      </>
    );
  };
});
