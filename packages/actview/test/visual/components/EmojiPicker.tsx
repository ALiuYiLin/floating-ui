import {computed, defineComponent, nextTick, ref, watch} from '@actview/core';
import {arrow, flip, offset} from '@floating-ui/dom';
import type {Placement} from '@floating-ui/dom';

import {
  FloatingArrow,
  FloatingFocusManager,
  FloatingPortal,
  useClick,
  useDismiss,
  useFloating,
  useId,
  useInteractions,
  useListNavigation,
  useRole,
} from '../../../src';

import {Button} from '../lib/Button';

const emojis = [
  {name: 'apple', emoji: '🍎'},
  {name: 'orange', emoji: '🍊'},
  {name: 'watermelon', emoji: '🍉'},
  {name: 'strawberry', emoji: '🍓'},
  {name: 'pear', emoji: '🍐'},
  {name: 'banana', emoji: '🍌'},
  {name: 'pineapple', emoji: '🍍'},
  {name: 'cherry', emoji: '🍒'},
  {name: 'peach', emoji: '🍑'},
];

const Option = defineComponent(function (props: {
  name: string;
  active: boolean;
  selected: boolean;
  children?: any;
} & any) {
  const id = useId();
  return () => (
    <button
      {...props}
      ref={props.ref}
      id={id.value}
      role="option"
      className={`rounded text-3xl text-center cursor-default select-none aspect-square${
        props.selected && !props.active ? ' bg-cyan-100' : ''
      }${props.active ? ' bg-cyan-200' : ''}${
        props.name === 'orange' ? ' opacity-40' : ''
      }`}
      aria-selected={props.selected}
      disabled={props.name === 'orange'}
      aria-label={props.name}
      tabIndex={-1}
      data-active={props.active ? '' : undefined}
    >
      {props.children}
    </button>
  );
});

export const Main = defineComponent(function () {
  const open = ref(false);
  const search = ref('');
  const selectedEmoji = ref<string | null>(null);
  const activeIndex = ref<number | null>(null);
  const placement = ref<Placement | null>(null);

  const arrowRef = ref<SVGSVGElement | null>(null);

  const listRef = ref<Array<HTMLElement | null>>([]);

  const noResultsId = useId();

  const {floatingStyles, refs, context, placement: resultantPlacement} =
    useFloating({
      placement: placement.value ?? 'bottom-start',
      open,
      onOpenChange: (o) => {
        open.value = o;
      },
      // We don't want flipping to occur while searching, as the floating element
      // will resize and cause disorientation.
      middleware: [
        offset(8),
        ...(placement.value ? [] : [flip()]),
        // actview Ref 无 getBoundingClientRect（React 版 Ref 有 current 被 dom
        // 的 arrow 解包）；传 .value（初始 null 时 arrow 中间件跳过，不报错）。
        arrow({
          element: arrowRef.value,
          padding: 20,
        }),
      ],
    });

  // Handles opening the floating element via the Choose Emoji button.
  const {getReferenceProps, getFloatingProps} = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, {role: 'menu'}),
  ]);

  // Handles the list navigation where the reference is the inner input, not
  // the button that opens the floating element.
  const {
    getReferenceProps: getInputProps,
    getFloatingProps: getListFloatingProps,
    getItemProps,
  } = useInteractions([
    useListNavigation(context, {
      listRef,
      onNavigate: (i) => {
        activeIndex.value = i;
      },
      activeIndex,
      cols: 3,
      orientation: 'horizontal',
      loop: true,
      focusItemOnOpen: false,
      virtual: true,
      allowEscape: true,
    }),
  ]);

  watch(open, (o) => {
    if (o) {
      placement.value = resultantPlacement.value;
    } else {
      search.value = '';
      activeIndex.value = null;
      placement.value = null;
    }
  });

  const filteredEmojis = computed(() =>
    emojis.filter(({name}) =>
      name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
    ),
  );

  const handleEmojiClick = () => {
    if (activeIndex.value !== null) {
      selectedEmoji.value = filteredEmojis.value[activeIndex.value].emoji;
      open.value = false;
    }
  };

  const handleKeyDown = (event: any) => {
    if (event.key === 'Enter') {
      handleEmojiClick();
    }
  };

  const handleInputChange = (event: any) => {
    activeIndex.value = null;
    search.value = event.target.value;
  };

  // React 版 Option 的 ref 回调在每次渲染调用（先 null 后 node），重渲染后
  // listRef 反映最新列表；actview 的 ref 回调仅在挂载/卸载时调用，filtered
  // 变化后复用节点不会重设 listRef。渲染后按 DOM 顺序重建 listRef。
  watch(filteredEmojis, async () => {
    await nextTick();
    listRef.value = Array.from(
      document.querySelectorAll('[role="option"]'),
    );
  });

  return () => {
    const filtered = filteredEmojis.value;

    return (
      <>
        <h1 className="text-5xl font-bold mb-8">Emoji Picker</h1>
        <div className="grid place-items-center border border-slate-400 rounded lg:w-[40rem] h-[20rem] mb-4">
          <div className="text-center">
            <Button
              ref={refs.setReference}
              className="text-2xl"
              aria-label="Choose emoji"
              aria-describedby="emoji-label"
              data-open={open.value ? '' : undefined}
              {...getReferenceProps()}
            >
              ☻
            </Button>
            <br />
            {selectedEmoji.value && (
              <span id="emoji-label">
                <span
                  style={{fontSize: 30}}
                  aria-label={
                    emojis.find(({emoji}) => emoji === selectedEmoji.value)
                      ?.name
                  }
                >
                  {selectedEmoji.value}
                </span>{' '}
                selected
              </span>
            )}
            <FloatingPortal>
              {open.value && (
                <FloatingFocusManager context={context} modal={false}>
                  <div
                    ref={refs.setFloating}
                    className="bg-white/70 backdrop-blur-sm border border-slate-900/10 shadow-md rounded-lg p-4 bg-clip-padding"
                    style={floatingStyles}
                    {...getFloatingProps(getListFloatingProps())}
                  >
                    <FloatingArrow
                      ref={arrowRef}
                      context={context}
                      fill="white"
                      stroke="rgba(0,0,0,0.1)"
                      strokeWidth={1}
                      height={8}
                      tipRadius={1}
                    />
                    <span className="opacity-40 text-sm uppercase">
                      Emoji Picker
                    </span>
                    <input
                      className="block w-36 my-2 p-1 border border-slate-300 outline-none focus:border-blue-600 rounded"
                      placeholder="Search emoji"
                      value={search.value}
                      aria-controls={
                        filtered.length === 0 ? noResultsId.value : undefined
                      }
                      {...getInputProps({
                        onChange: handleInputChange,
                        onKeyDown: handleKeyDown,
                      })}
                    />
                    {filtered.length === 0 && (
                      <p
                        key={search.value}
                        id={noResultsId.value}
                        role="region"
                        aria-atomic="true"
                        aria-live="assertive"
                      >
                        No results.
                      </p>
                    )}
                    {filtered.length > 0 && (
                      <div className="grid grid-cols-3" role="listbox">
                        {filtered.map(({name, emoji}, index) => (
                          <Option
                            key={name}
                            name={name}
                            ref={(node: any) => {
                              listRef.value[index] = node;
                            }}
                            selected={selectedEmoji.value === emoji}
                            active={activeIndex.value === index}
                            {...getItemProps({
                              onClick: handleEmojiClick,
                            })}
                          >
                            {emoji}
                          </Option>
                        ))}
                      </div>
                    )}
                  </div>
                </FloatingFocusManager>
              )}
            </FloatingPortal>
          </div>
        </div>
      </>
    );
  };
});
