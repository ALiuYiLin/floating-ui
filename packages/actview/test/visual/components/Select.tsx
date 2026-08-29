import {createContext, defineComponent, ref, watch, type Ref} from '@actview/core';
import {flip, offset, size} from '@floating-ui/dom';

import {
  FloatingFocusManager,
  FloatingList,
  FloatingPortal,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListItem,
  useListNavigation,
  useRole,
  useTypeahead,
} from '../../../src';

import {Button} from '../lib/Button';

function ColorSwatch({color}: {color?: string}) {
  return (
    <div
      aria-hidden
      className="rounded-full w-4 h-4 border border-slate-900/20 bg-clip-padding"
      style={{background: color?.toLowerCase()}}
    />
  );
}

interface SelectContextData {
  getItemProps: ReturnType<typeof useInteractions>['getItemProps'];
  activeIndex: Ref<number | null>;
  selectedIndex: Ref<number | null>;
  setActiveIndex: (i: number | null) => void;
  setSelectedIndex: (i: number | null) => void;
  isTypingRef: Ref<boolean>;
  setSelectedValue: (value: string, index: number) => void;
  selectedValue: Ref<string>;
}

const SelectContext = createContext<SelectContextData>(
  null as unknown as SelectContextData,
);

const Select = defineComponent(function (props: {
  children?: any;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const isOpen = ref(false);
  const activeIndex = ref<number | null>(null);
  const selectedIndex = ref<number | null>(null);
  const uncontrolledValue = ref('');

  const selectedValue = ref(props.value ?? uncontrolledValue.value);
  const setSelectedValue = (value: string, index: number) => {
    selectedIndex.value = index;
    uncontrolledValue.value = value;
    selectedValue.value = value;
    props.onChange?.(value);
    isOpen.value = false;
  };

  const {refs, floatingStyles, context} = useFloating({
    placement: 'bottom-start',
    open: isOpen,
    onOpenChange: (o) => {
      isOpen.value = o;
    },
    middleware: [
      offset(5),
      flip({padding: 10}),
      size({
        apply({rects, elements, availableHeight}) {
          Object.assign(elements.floating.style, {
            maxHeight: `${availableHeight}px`,
            width: `${rects.reference.width}px`,
          });
        },
        padding: 10,
      }),
    ],
  });

  const elementsRef = ref<Array<HTMLElement | null>>([]);
  const labelsRef = ref<Array<string | null>>([]);
  const isTypingRef = ref(false);

  const click = useClick(context, {event: 'mousedown'});
  const dismiss = useDismiss(context);
  const role = useRole(context, {role: 'select'});
  const listNav = useListNavigation(context, {
    listRef: elementsRef,
    activeIndex,
    selectedIndex,
    onNavigate: (i) => {
      activeIndex.value = i;
    },
    // This is a large list, allow looping.
    loop: true,
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    selectedIndex,
    onMatch: (index) => {
      if (isOpen.value) {
        activeIndex.value = index;
      } else {
        setSelectedValue(labelsRef.value[index] || '', index);
      }
    },
    onTypingChange(isTyping: boolean) {
      isTypingRef.value = isTyping;
    },
  });

  const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
    click,
    dismiss,
    role,
    listNav,
    typeahead,
  ]);

  return () => (
    <>
      <h1 className="text-5xl font-bold mb-8">Select</h1>
      <div className="grid place-items-center border border-slate-400 rounded lg:w-[40rem] h-[20rem] mb-4">
        <div>
          <label className="flex flex-col items-center" id="select-label">
            Select balloon color
          </label>
          <Button
            ref={refs.setReference}
            aria-labelledby="select-label"
            data-open={isOpen.value ? '' : undefined}
            className="flex items-center gap-2 bg-slate-200 rounded w-[10rem]"
            {...getReferenceProps()}
          >
            {selectedValue.value && (
              <ColorSwatch color={selectedValue.value} />
            )}
            {selectedValue.value || 'Select...'}
          </Button>
        </div>
        <FloatingList elementsRef={elementsRef} labelsRef={labelsRef}>
          <SelectContext.Provider
            value={{
              getItemProps,
              activeIndex,
              selectedIndex,
              setActiveIndex: (i) => {
                activeIndex.value = i;
              },
              setSelectedIndex: (i) => {
                selectedIndex.value = i;
              },
              isTypingRef,
              selectedValue,
              setSelectedValue,
            }}
          >
            {isOpen.value ? (
              <FloatingPortal>
                <FloatingFocusManager context={context} modal={false}>
                  <div
                    ref={refs.setFloating}
                    style={floatingStyles}
                    className="bg-slate-200/50 max-h-[20rem] overflow-y-auto rounded outline-none p-1 backdrop-blur-sm"
                    {...getFloatingProps()}
                  >
                    {props.children}
                  </div>
                </FloatingFocusManager>
              </FloatingPortal>
            ) : (
              <div hidden>{props.children}</div>
            )}
          </SelectContext.Provider>
        </FloatingList>
      </div>
    </>
  );
});

const MemoOption = defineComponent(function (props: {
  children?: any;
  active: boolean;
  selected: boolean;
  getItemProps: (userProps?: any) => Record<string, unknown>;
  onSelect: () => void;
  isTypingRef: Ref<boolean>;
} & any) {
  return () => (
    <div
      ref={props.ref}
      className={`flex gap-2 items-center p-2 rounded outline-none cursor-default scroll-my-1${
        props.active ? ' bg-cyan-200' : ''
      }`}
      tabIndex={props.active ? 0 : -1}
      {...props.getItemProps({
        active: props.active,
        selected: props.selected,
        // Handle pointer select.
        onClick: props.onSelect,
        // Handle keyboard select.
        onKeyDown(event: any) {
          if (event.key === 'Enter') {
            event.preventDefault();
            props.onSelect();
          }

          // Only if not using typeahead.
          if (event.key === ' ' && !props.isTypingRef.value) {
            event.preventDefault();
            props.onSelect();
          }
        },
      })}
    >
      <ColorSwatch color={String(props.children)?.toLowerCase()} />
      {props.children}
      <span aria-hidden className="absolute right-4">
        {props.selected ? '✓' : ''}
      </span>
    </div>
  );
});

const Option = defineComponent(function (props: {children?: any; value: string}) {
  const ctx = SelectContext.use();
  const {ref, index} = useListItem({label: props.value});

  // React 版 useLayoutEffect：受控值变化时同步 selectedIndex。
  watch(
    [() => props.value, () => ctx.selectedValue.value, index],
    () => {
      if (index.value !== ctx.selectedIndex.value &&
          props.value === ctx.selectedValue.value) {
        ctx.setSelectedIndex(index.value);
      }
    },
    {immediate: true},
  );

  return () => {
    const context = ctx;
    const isActive = index.value === context.activeIndex.value;
    const isSelected = index.value === context.selectedIndex.value;
    const onSelect = () => {
      context.setSelectedValue(props.value, index.value);
    };

    return (
      <MemoOption
        ref={ref}
        active={isActive}
        selected={isSelected}
        getItemProps={context.getItemProps}
        onSelect={onSelect}
        isTypingRef={context.isTypingRef}
      >
        {props.children}
      </MemoOption>
    );
  };
});

export const Main = defineComponent(function () {
  return () => (
    <Select>
      <Option value="Red">Red</Option>
      <Option value="Orange">Orange</Option>
      <Option value="Yellow">Yellow</Option>
      <Option value="Green">Green</Option>
      <Option value="Blue">Blue</Option>
    </Select>
  );
});
