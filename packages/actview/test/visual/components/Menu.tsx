import {createContext, defineComponent, onUnmounted, ref, watch, type Ref} from '@actview/core';
import {flip, offset, shift} from '@floating-ui/dom';

import {
  FloatingFocusManager,
  FloatingList,
  FloatingNode,
  FloatingPortal,
  FloatingTree,
  safePolygon,
  useClick,
  useDismiss,
  useFloating,
  useFloatingNodeId,
  useFloatingParentNodeId,
  useFloatingTree,
  useFocus,
  useHover,
  useInteractions,
  useListItem,
  useListNavigation,
  useMergeRefs,
  useRole,
  useTypeahead,
} from '../../../src';

type MenuContextType = {
  getItemProps: ReturnType<typeof useInteractions>['getItemProps'];
  activeIndex: Ref<number | null>;
  setActiveIndex: (i: number | null) => void;
  setHasFocusInside: (v: boolean) => void;
  allowHover: Ref<boolean>;
  isOpen: Ref<boolean>;
  setIsOpen: (v: boolean) => void;
  parent: MenuContextType | null;
};

const MenuContext = createContext<MenuContextType>(
  null as unknown as MenuContextType,
);

interface MenuProps {
  label: string;
  nested?: boolean;
  children?: any;
  keepMounted?: boolean;
  orientation?: 'vertical' | 'horizontal' | 'both';
  cols?: number;
  openOnFocus?: boolean;
}

export const MenuComponent = defineComponent(function (props: MenuProps & any) {
  const isOpen = ref(false);
  const activeIndex = ref<number | null>(null);
  const allowHover = ref(false);
  const hasFocusInside = ref(false);

  const elementsRef = ref<Array<HTMLButtonElement | null>>([]);
  const labelsRef = ref<Array<string | null>>([]);

  const tree = useFloatingTree();
  const nodeId = useFloatingNodeId();
  const parentId = useFloatingParentNodeId();
  const isNested = parentId != null;
  const orientation =
    props.orientation ?? (props.cols ? 'both' : 'vertical');

  const parent = MenuContext.use();
  const item = useListItem();

  const {floatingStyles, refs, context} = useFloating({
    nodeId,
    open: isOpen,
    onOpenChange: (o) => {
      isOpen.value = o;
    },
    placement: isNested ? 'right-start' : 'bottom-start',
    middleware: [
      offset({mainAxis: isNested ? 0 : 4, alignmentAxis: isNested ? -4 : 0}),
      flip(),
      shift(),
    ],
  });

  const hover = useHover(context, {
    enabled: isNested && allowHover.value,
    delay: {open: 75},
    handleClose: safePolygon({blockPointerEvents: true}),
  });
  const click = useClick(context, {
    event: 'mousedown',
    toggle: !isNested || !allowHover.value,
    ignoreMouse: isNested,
  });
  const focus = useFocus(context, {enabled: props.openOnFocus ?? false});
  const role = useRole(context, {role: 'menu'});
  const dismiss = useDismiss(context, {bubbles: true});
  const listNavigation = useListNavigation(context, {
    listRef: elementsRef,
    activeIndex,
    nested: isNested,
    onNavigate: (i) => {
      activeIndex.value = i;
    },
    orientation,
    cols: props.cols,
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    onMatch: (i) => {
      if (isOpen.value) {
        activeIndex.value = i;
      }
    },
    activeIndex,
  });

  const {getReferenceProps, getFloatingProps, getItemProps} = useInteractions([
    hover,
    click,
    role,
    dismiss,
    focus,
    listNavigation,
    typeahead,
  ]);

  // Event emitter allows you to communicate across tree components.
  // This effect closes all menus when an item gets clicked anywhere
  // in the tree.
  if (tree) {
    function handleTreeClick() {
      isOpen.value = false;
    }

    function onSubMenuOpen(event: {nodeId: string; parentId: string}) {
      if (event.nodeId !== nodeId.value && event.parentId === parentId) {
        isOpen.value = false;
      }
    }

    tree.events.on('click', handleTreeClick);
    tree.events.on('menuopen', onSubMenuOpen);

    onUnmounted(() => {
      tree.events.off('click', handleTreeClick);
      tree.events.off('menuopen', onSubMenuOpen);
    });
  }

  watch(
    [isOpen],
    () => {
      if (isOpen.value && tree) {
        tree.events.emit('menuopen', {parentId, nodeId: nodeId.value});
      }
    },
    {immediate: true},
  );

  // Determine if "hover" logic can run based on the modality of input. This
  // prevents unwanted focus synchronization as menus open and close with
  // keyboard navigation and the cursor is resting on the menu.
  let cleanupModality: (() => void) | undefined;
  watch(
    allowHover,
    () => {
      cleanupModality?.();

      function onPointerMove(e: PointerEvent) {
        if (e.pointerType !== 'touch') {
          allowHover.value = true;
        }
      }

      function onKeyDown() {
        allowHover.value = false;
      }

      window.addEventListener('pointermove', onPointerMove, {
        once: true,
        capture: true,
      });
      window.addEventListener('keydown', onKeyDown, true);
      cleanupModality = () => {
        window.removeEventListener('pointermove', onPointerMove, {
          capture: true,
        } as EventListenerOptions);
        window.removeEventListener('keydown', onKeyDown, true);
      };
    },
    {immediate: true},
  );

  const mergedRef = useMergeRefs([refs.setReference, item.ref, props.ref]);

  return () => {
    const ctx = parent.value;
    const parentActive = ctx ? ctx.activeIndex.value : null;
    const parentAllowHover = ctx ? ctx.allowHover.value : false;
    const parentIsOpen = ctx ? ctx.isOpen.value : false;
    const parentGetItemProps = ctx ? ctx.getItemProps : null;
    const keepMounted = props.keepMounted ?? false;

    return (
      <FloatingNode id={nodeId}>
        <button
          ref={mergedRef}
          data-open={isOpen.value ? '' : undefined}
          tabIndex={
            !isNested
              ? props.tabIndex
              : parentActive === item.index.value
                ? 0
                : -1
          }
          className={`text-left flex gap-4 justify-between items-center rounded py-1 px-2${
            isNested ? ' focus:bg-blue-500 focus:text-white outline-none' : ''
          }${
            isOpen.value && isNested && !hasFocusInside.value
              ? ' bg-blue-500 text-white'
              : ''
          }${
            isNested && isOpen.value && hasFocusInside.value
              ? ' bg-slate-200 rounded py-1 px-2'
              : ''
          }${!isNested && isOpen.value ? ' bg-slate-200' : ''}`}
          {...getReferenceProps(
            parentGetItemProps
              ? {
                  ...props,
                  onFocus(event: any) {
                    props.onFocus?.(event);
                    hasFocusInside.value = false;
                    ctx.setHasFocusInside(true);
                  },
                  onMouseEnter(event: any) {
                    props.onMouseEnter?.(event);
                    if (parentAllowHover && parentIsOpen) {
                      ctx.setActiveIndex(item.index.value);
                    }
                  },
                }
              : {},
          )}
        >
          {props.label}
          {isNested && (
            <span aria-hidden className="ml-4">
              ▸
            </span>
          )}
        </button>
        <MenuContext.Provider
          value={{
            activeIndex,
            setActiveIndex: (i) => {
              activeIndex.value = i;
            },
            getItemProps,
            setHasFocusInside: (v) => {
              hasFocusInside.value = v;
            },
            allowHover,
            isOpen,
            setIsOpen: (v) => {
              isOpen.value = v;
            },
            parent: ctx,
          }}
        >
          <FloatingList elementsRef={elementsRef} labelsRef={labelsRef}>
            {(keepMounted || isOpen.value) && (
              <FloatingPortal>
                <FloatingFocusManager
                  context={context}
                  modal={false}
                  initialFocus={isNested ? -1 : 0}
                  returnFocus={!isNested}
                >
                  <div
                    ref={refs.setFloating}
                    className={`rounded bg-white shadow-lg outline-none p-1 border border-slate-900/10 bg-clip-padding${
                      !props.cols ? ' flex flex-col' : ''
                    }${
                      props.cols
                        ? ' grid grid-cols-[repeat(var(--cols),_minmax(0,_1fr))] gap-3'
                        : ''
                    }`}
                    style={{
                      ...floatingStyles,
                      '--cols': props.cols,
                      visibility: !keepMounted
                        ? undefined
                        : isOpen.value
                          ? 'visible'
                          : 'hidden',
                    }}
                    aria-hidden={!isOpen.value}
                    {...getFloatingProps()}
                  >
                    {props.children}
                  </div>
                </FloatingFocusManager>
              </FloatingPortal>
            )}
          </FloatingList>
        </MenuContext.Provider>
      </FloatingNode>
    );
  };
});

interface MenuItemProps {
  label: string;
  disabled?: boolean;
}

export const MenuItem = defineComponent(function (props: MenuItemProps & any) {
  const menu = MenuContext.use();
  const item = useListItem({label: props.disabled ? null : props.label});
  const tree = useFloatingTree();

  return () => {
    const ctx = menu.value;
    const isActive = item.index.value === (ctx ? ctx.activeIndex.value : null);

    return (
      <button
        {...props}
        ref={item.ref}
        type="button"
        role="menuitem"
        disabled={props.disabled}
        tabIndex={isActive ? 0 : -1}
        className={`text-left flex py-1 px-2 focus:bg-blue-500 focus:text-white outline-none rounded${
          props.disabled ? ' opacity-40' : ''
        }`}
        {...ctx.getItemProps({
          active: isActive,
          onClick(event: any) {
            props.onClick?.(event);
            tree?.events.emit('click');
          },
          onFocus(event: any) {
            props.onFocus?.(event);
            ctx.setHasFocusInside(true);
          },
          onMouseEnter(event: any) {
            props.onMouseEnter?.(event);
            if (ctx.allowHover.value && ctx.isOpen.value) {
              ctx.setActiveIndex(item.index.value);
            }
          },
          onKeyDown(event: any) {
            function closeParents(parent: MenuContextType | null) {
              parent?.setIsOpen(false);
              if (parent?.parent) {
                closeParents(parent.parent);
              }
            }

            if (
              event.key === 'ArrowRight' &&
              // If the root reference is in a menubar, close parents
              tree?.nodesRef.value[0]?.context?.elements.domReference.value?.closest(
                '[role="menubar"]',
              )
            ) {
              closeParents(ctx.parent);
            }
          },
        })}
      >
        {props.label}
      </button>
    );
  };
});

export const Menu = defineComponent(function (props: MenuProps & any) {
  const parentId = useFloatingParentNodeId();

  if (parentId === null) {
    return () => (
      <FloatingTree>
        <MenuComponent {...props} />
      </FloatingTree>
    );
  }

  return () => <MenuComponent {...props} />;
});

export const Main = defineComponent(function () {
  return () => (
    <>
      <h1 className="text-5xl font-bold mb-8">Menu</h1>
      <div className="grid place-items-center border border-slate-400 rounded lg:w-[40rem] h-[20rem] mb-4">
        <Menu label="Edit">
          <MenuItem label="Undo" onClick={() => console.log('Undo')} />
          <MenuItem label="Redo" />
          <MenuItem label="Cut" disabled />
          <Menu label="Copy as" keepMounted>
            <MenuItem label="Text" />
            <MenuItem label="Video" />
            <Menu label="Image" keepMounted cols={2} orientation="horizontal">
              <MenuItem label=".png" />
              <MenuItem label=".jpg" />
              <MenuItem label=".svg" />
              <MenuItem label=".gif" />
            </Menu>
            <MenuItem label="Audio" />
          </Menu>
          <Menu label="Share">
            <MenuItem label="Mail" />
            <MenuItem label="Instagram" />
          </Menu>
        </Menu>
      </div>
    </>
  );
});
