import {createContext, defineComponent, ref, type Ref} from '@actview/core';

import {
  FloatingList,
  useFloating,
  useInteractions,
  useListItem,
  useListNavigation,
  useRole,
  useTypeahead,
} from '../../../src';

interface SelectContextValue {
  activeIndex: Ref<number | null>;
  selectedIndex: Ref<number | null>;
  getItemProps: ReturnType<typeof useInteractions>['getItemProps'];
  handleSelect: (index: number | null) => void;
}

const SelectContext = createContext<SelectContextValue>(
  null as unknown as SelectContextValue,
);

const Listbox = defineComponent(function (props: {children?: any}) {
  const activeIndex = ref<number | null>(1);
  const selectedIndex = ref<number | null>(null);

  const {refs, context} = useFloating({
    open: true,
  });

  const elementsRef = ref<Array<HTMLElement | null>>([]);
  const labelsRef = ref<Array<string | null>>([]);

  const handleSelect = (index: number | null) => {
    selectedIndex.value = index;
  };

  function handleTypeaheadMatch(index: number | null) {
    activeIndex.value = index;
  }

  const listNav = useListNavigation(context, {
    listRef: elementsRef,
    activeIndex,
    selectedIndex,
    onNavigate: (i) => {
      activeIndex.value = i;
    },
    focusItemOnHover: false,
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    selectedIndex,
    onMatch: handleTypeaheadMatch,
  });
  const role = useRole(context, {role: 'listbox'});

  const {getFloatingProps, getItemProps} = useInteractions([
    listNav,
    typeahead,
    role,
  ]);

  const selectContext: SelectContextValue = {
    activeIndex,
    selectedIndex,
    getItemProps,
    handleSelect,
  };

  return () => (
    <>
      <SelectContext.Provider value={selectContext}>
        <button
          onClick={() => {
            selectedIndex.value = 1;
          }}
          data-testid="reference"
        >
          Select
        </button>
        <div ref={refs.setFloating} {...getFloatingProps()}>
          <FloatingList elementsRef={elementsRef} labelsRef={labelsRef}>
            {props.children}
          </FloatingList>
        </div>
      </SelectContext.Provider>
    </>
  );
});

const Option = defineComponent(function (props: {label: string}) {
  const ctx = SelectContext.use();

  const {ref, index} = useListItem({label: props.label});

  return () => {
    const activeIndex = ctx.activeIndex.value;
    const selectedIndex = ctx.selectedIndex.value;

    const isActive = activeIndex === index.value;
    const isSelected = selectedIndex === index.value;

    const isFocusable =
      activeIndex !== null
        ? isActive
        : selectedIndex !== null
          ? isSelected
          : index.value === 0;

    return (
      <button
        ref={ref}
        role="option"
        aria-selected={isActive && isSelected}
        tabIndex={isFocusable ? 0 : -1}
        style={{
          background: isActive ? 'cyan' : '',
          fontWeight: isSelected ? 'bold' : '',
        }}
        {...ctx.getItemProps({
          onClick: () => ctx.handleSelect(index.value),
        })}
      >
        {props.label}
      </button>
    );
  };
});

export const Main = defineComponent(function () {
  return () => (
    <Listbox>
      <Option label="Apple" />
      <Option label="Blueberry" />
      <Option label="Watermelon" />
      <Option label="Banana" />
    </Listbox>
  );
});
