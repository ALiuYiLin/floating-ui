import {createContext, defineComponent, ref, type Ref} from '@actview/core';
import {flip, offset, size} from '@floating-ui/dom';

import {
  FloatingFocusManager,
  FloatingList,
  useDismiss,
  useFloating,
  useFocus,
  useInteractions,
  useListItem,
  useListNavigation,
  useRole,
} from '../../../src';

interface SelectContextValue {
  activeIndex: Ref<number | null>;
  getItemProps: ReturnType<typeof useInteractions>['getItemProps'];
}

const SelectContext = createContext<SelectContextValue>(
  null as unknown as SelectContextValue,
);

const SearchOption = defineComponent(function (props: {
  value: string;
  onClick: () => void;
  onRemove: () => void;
}) {
  const {ref, index} = useListItem();
  const ctx = SelectContext.use();

  return () => {
    const isActive = index.value === ctx.activeIndex.value;

    return (
      <div
        ref={ref}
        tabIndex={0}
        role="option"
        aria-selected={isActive}
        className={`p-4 outline-none cursor-default flex justify-between align-items-center${
          isActive ? ' bg-slate-50' : ''
        }`}
        {...ctx.getItemProps({
          onClick: props.onClick,
          onKeyDown(e: any) {
            if (e.currentTarget !== e.target) return;

            if (e.key === 'Backspace') {
              props.onRemove();
            } else if (e.key === ' ' || e.key === 'Enter') {
              props.onClick();
            }
          },
        })}
      >
        {props.value}
        <button
          className="flex justify-center items-center text-blue-600 w-8 h-8 text-xl hover:bg-sky-100 transition-colors rounded-full"
          onClick={(e: any) => {
            e.stopPropagation();
            props.onRemove();
          }}
          aria-label="Remove"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>
    );
  };
});

export const Main = defineComponent(function () {
  const isOpen = ref(false);
  const activeIndex = ref<number | null>(null);
  const isFocusEnabled = ref(true);

  const options = ref(['bun 1.0', 'floating-ui', 'ariakit', 'react']);

  const removedIndexRef = ref<number | null>(null);

  const {refs, floatingStyles, context} = useFloating({
    open: isOpen,
    onOpenChange: (o) => {
      isOpen.value = o;
    },
    middleware: [
      offset(2),
      flip({padding: 15}),
      size({
        apply({availableHeight, elements, rects}) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
            maxHeight: `${availableHeight}px`,
          });
        },
        padding: 15,
      }),
    ],
  });

  const elementsRef = ref<Array<HTMLElement | null>>([]);

  const hasOptions = options.value.length > 0;

  const focus = useFocus(context, {
    enabled: hasOptions && isFocusEnabled.value,
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, {enabled: hasOptions, role: 'listbox'});
  const listNavigation = useListNavigation(context, {
    listRef: elementsRef,
    activeIndex,
    onNavigate: (i) => {
      activeIndex.value = i;
    },
    virtual: true,
    allowEscape: true,
    loop: true,
  });

  const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
    focus,
    dismiss,
    role,
    listNavigation,
  ]);

  function handleKeyDown(e: any) {
    const value = e.currentTarget.value.trim();

    if (e.key !== 'Enter' && !e.key.startsWith('Arrow')) {
      activeIndex.value = null;
      return;
    }

    if (e.key === 'Enter' && value && !options.value.includes(value)) {
      options.value = [value, ...options.value];
    }

    if (e.key === 'Enter' && activeIndex.value !== null) {
      e.currentTarget.value = options.value[activeIndex.value];
      isOpen.value = false;
    }
  }

  return () => {
    const hasOptionsValue = options.value.length > 0;

    return (
      <>
        <h1 className="text-5xl font-bold mb-8">Omnibox</h1>
        <div className="grid place-items-center border border-slate-400 rounded lg:w-[40rem] h-[20rem] mb-4">
          <input
            ref={refs.setReference}
            className="rounded-full sm:w-48 md:w-96 bg-gray-100 px-4 py-2 border border-transparent focus:bg-white focus focus:border-blue-500 outline-none"
            placeholder="Search"
            {...getReferenceProps({
              onKeyDown: handleKeyDown,
              onBlur() {
                isFocusEnabled.value = true;
              },
            })}
          />
          {isOpen.value && (
            <FloatingFocusManager
              context={context}
              initialFocus={-1}
              restoreFocus
              modal={false}
            >
              <div
                className="bg-white bg-clip-padding rounded-lg shadow-md border border-slate-900/10 text-left overflow-y-auto"
                ref={refs.setFloating}
                style={floatingStyles}
                {...getFloatingProps()}
              >
                <div className="flex justify-between align-items-center p-4">
                  <h3 className="font-bold text-xl">Recent</h3>
                  {hasOptionsValue && (
                    <button
                      className="text-blue-500 font-bold px-2 py-1 rounded-lg hover:bg-sky-50"
                      onClick={() => {
                        options.value = [];
                        isOpen.value = false;
                      }}
                      onKeyDown={(e: any) => {
                        if (e.key !== 'Escape') {
                          e.stopPropagation();
                        }
                      }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {!hasOptionsValue && (
                  <p className="px-4 pb-4">No recent searches.</p>
                )}
                <FloatingList elementsRef={elementsRef}>
                  <SelectContext.Provider value={{activeIndex, getItemProps}}>
                    {options.value.map((option, index) => (
                      <SearchOption
                        key={option}
                        value={option}
                        onRemove={() => {
                          removedIndexRef.value = index;
                          options.value = options.value.filter(
                            (o) => o !== option,
                          );
                        }}
                        onClick={() => {
                          if (
                            activeIndex.value === null ||
                            !refs.domReference.value
                          ) {
                            return;
                          }

                          isOpen.value = false;
                          isFocusEnabled.value = false;
                          refs.domReference.value.value =
                            options.value[activeIndex.value];
                        }}
                      />
                    ))}
                  </SelectContext.Provider>
                </FloatingList>
              </div>
            </FloatingFocusManager>
          )}
        </div>
      </>
    );
  };
});
