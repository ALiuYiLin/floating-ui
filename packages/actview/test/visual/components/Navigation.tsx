import {defineComponent, ref} from '@actview/core';
import {flip, offset, shift} from '@floating-ui/dom';

import {
  FloatingFocusManager,
  FloatingNode,
  FloatingPortal,
  safePolygon,
  useDismiss,
  useFloating,
  useFloatingNodeId,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
} from '../../../src';

interface SubItemProps {
  label: string;
  href: string;
}

export const NavigationSubItem = defineComponent(function (
  props: SubItemProps & any,
) {
  return () => (
    <a {...props} href={props.href} className="NavigationItem">
      {props.label}
    </a>
  );
});

interface ItemProps {
  label: string;
  href: string;
  children?: any;
}

export const NavigationItem = defineComponent(function (props: ItemProps) {
  const open = ref(false);
  const hasChildren = !!props.children;

  const nodeId = useFloatingNodeId();

  const {floatingStyles, refs, context} = useFloating({
    open,
    nodeId,
    onOpenChange: (o) => {
      open.value = o;
    },
    middleware: [offset(8), flip(), shift()],
    placement: 'right-start',
  });

  const {getReferenceProps, getFloatingProps} = useInteractions([
    useHover(context, {
      handleClose: safePolygon(),
      enabled: hasChildren,
    }),
    useFocus(context, {
      enabled: hasChildren,
    }),
    useDismiss(context, {
      enabled: hasChildren,
    }),
  ]);

  const mergedReferenceRef = useMergeRefs([refs.setReference]);

  return () => (
    <FloatingNode id={nodeId}>
      <li>
        <a
          href={props.href}
          ref={mergedReferenceRef}
          className="w-48 bg-slate-100 p-2 rounded my-1 flex justify-between items-center"
          {...getReferenceProps(props)}
        >
          {props.label}
          {hasChildren && <span aria-hidden>▸</span>}
        </a>
      </li>
      <FloatingPortal>
        {open.value && (
          <FloatingFocusManager
            context={context}
            modal={false}
            initialFocus={-1}
          >
            <div
              data-testid="subnavigation"
              ref={refs.setFloating}
              className="flex flex-col bg-slate-100 overflow-y-auto rounded outline-none px-4 py-2 backdrop-blur-sm"
              style={floatingStyles}
              {...getFloatingProps()}
            >
              <button type="button" onClick={() => (open.value = false)}>
                Close
              </button>
              <ul className="flex flex-col">{props.children}</ul>
            </div>
          </FloatingFocusManager>
        )}
      </FloatingPortal>
    </FloatingNode>
  );
});

interface NavigationProps {
  children?: any;
}

export const Navigation = defineComponent(function (props: NavigationProps) {
  return () => (
    <nav className="Navigation">
      <ul className="NavigationList">{props.children}</ul>
    </nav>
  );
});

export const Main = defineComponent(function () {
  return () => (
    <>
      <h1 className="text-5xl font-bold mb-8">Navigation</h1>
      <div className="grid place-items-center border border-slate-400 rounded lg:w-[40rem] h-[20rem] mb-4">
        <Navigation>
          <NavigationItem label="Home" href="#" />
          <NavigationItem label="Product" href="#">
            <NavigationSubItem label="Link 1" href="#" />
            <NavigationSubItem label="Link 2" href="#" />
            <NavigationSubItem label="Link 3" href="#" />
          </NavigationItem>
          <NavigationItem label="About" href="#" />
        </Navigation>
      </div>
    </>
  );
});
