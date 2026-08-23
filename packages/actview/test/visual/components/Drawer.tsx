import {defineComponent, ref} from '@actview/core';

import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useClick,
  useDismiss,
  useFloating,
  useId,
  useInteractions,
  useRole,
} from '../../../src';

import {Button} from '../lib/Button';

export const Main = defineComponent(function (props: {modal?: boolean}) {
  return () => (
    <>
      <h1 className="text-5xl font-bold mb-8">Drawer</h1>
      <div className="grid place-items-center border border-slate-400 rounded lg:w-[40rem] h-[20rem] mb-4">
        <Drawer
          modal={props.modal}
          render={({labelId, descriptionId, close}) => (
            <>
              <h2 id={labelId} className="text-xl font-bold">
                Title
              </h2>
              <p id={descriptionId}>Description</p>
              <Button className="bg-white mt-4" onClick={close}>
                Close
              </Button>
            </>
          )}
        >
          <Button>My button</Button>
        </Drawer>
        <Button>Next button</Button>
        <div id="drawer-root"></div>
      </div>
    </>
  );
});

interface Props {
  render: (data: {
    close: () => void;
    labelId: string;
    descriptionId: string;
  }) => any;
  children?: any;
  // actview 适配：React 版用 react-responsive 的 useMediaQuery 控制 modal；
  // actview 简化为 prop（默认 true = React 版无 matchMedia 时的行为）。
  modal?: boolean;
}

export const Drawer = defineComponent(function (props: Props) {
  const open = ref(false);

  const {refs, context} = useFloating({
    open,
    onOpenChange: (o) => {
      open.value = o;
    },
  });

  const id = useId();
  const labelId = `${id.value}-label`;
  const descriptionId = `${id.value}-description`;

  const modal = props.modal ?? true;

  const {getReferenceProps, getFloatingProps} = useInteractions([
    useClick(context),
    useRole(context),
    useDismiss(context, {
      outsidePress: modal,
      outsidePressEvent: 'mousedown',
    }),
  ]);

  const content = (
    <FloatingFocusManager
      context={context}
      modal={modal}
      closeOnFocusOut={modal}
    >
      <div
        ref={refs.setFloating}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className="absolute top-0 right-0 h-full w-48 bg-slate-100 p-4"
        {...getFloatingProps()}
      >
        {props.render({
          labelId,
          descriptionId,
          close: () => {
            open.value = false;
          },
        })}
      </div>
    </FloatingFocusManager>
  );

  return () => {
    const child = props.children;
    const referenceChild =
      child && typeof child === 'object' && (child as any).$$typeof
        ? {
            ...(child as any),
            props: {
              ...(child as any).props,
              ...getReferenceProps({ref: refs.setReference}),
            },
          }
        : child;

    return (
      <>
        {referenceChild}
        <FloatingPortal id="drawer-root">
          {open.value &&
            (modal ? (
              <FloatingOverlay
                lockScroll
                style={{background: 'rgba(0, 0, 0, 0.8)', zIndex: 1}}
              >
                {content}
              </FloatingOverlay>
            ) : (
              content
            ))}
        </FloatingPortal>
      </>
    );
  };
});
