import {defineComponent, ref} from '@actview/core';
import {flip, offset, shift} from '@floating-ui/dom';
import type {Placement} from '@floating-ui/dom';

import {
  FloatingFocusManager,
  FloatingNode,
  FloatingPortal,
  FloatingTree,
  safePolygon,
  useClick,
  useDismiss,
  useFloating,
  useFloatingNodeId,
  useFloatingParentNodeId,
  useHover,
  useId,
  useInteractions,
  useRole,
} from '../../../src';

import {Button} from '../lib/Button';

interface RenderData {
  close: () => void;
  labelId: string;
  descriptionId: string;
}

interface PopoverProps {
  render: (data: RenderData) => any;
  placement?: Placement;
  modal?: boolean;
  children?: any;
  bubbles?: boolean;
  hover?: boolean;
}

const PopoverComponent = defineComponent(function (props: PopoverProps) {
  const open = ref(false);

  const nodeId = useFloatingNodeId();
  const {floatingStyles, refs, context} = useFloating({
    nodeId,
    open,
    placement: props.placement,
    onOpenChange: (o) => {
      open.value = o;
    },
    middleware: [offset(10), flip(), shift()],
  });

  const id = useId();
  const labelId = `${id.value}-label`;
  const descriptionId = `${id.value}-description`;

  const {getReferenceProps, getFloatingProps} = useInteractions([
    useHover(context, {
      enabled: props.hover ?? false,
      handleClose: safePolygon({blockPointerEvents: true}),
    }),
    useClick(context),
    useRole(context),
    useDismiss(context, {
      bubbles: props.bubbles ?? true,
    }),
  ]);

  const renderContent = () =>
    props.render({
      labelId,
      descriptionId,
      close: () => {
        open.value = false;
      },
    });

  return () => {
    const child = props.children;
    // cloneElement(children, getReferenceProps({ref, 'data-open'})) 的
    // actview 等价：重建 VNode 并合并 reference props。
    const clonedChild = child
      ? {
          ...child,
          props: {
            ...child.props,
            ...getReferenceProps({
              ref: refs.setReference,
              'data-open': open.value ? '' : undefined,
            }),
          },
        }
      : null;

    return (
      <FloatingNode id={nodeId}>
        {clonedChild}
        <FloatingPortal>
          {open.value && (
            <FloatingFocusManager context={context} modal={props.modal ?? true}>
              <div
                className="bg-white border border-slate-900/10 shadow-md rounded px-4 py-6 bg-clip-padding"
                ref={refs.setFloating}
                style={floatingStyles}
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                {...getFloatingProps()}
              >
                {renderContent()}
              </div>
            </FloatingFocusManager>
          )}
        </FloatingPortal>
      </FloatingNode>
    );
  };
});

export const Popover = defineComponent(function (props: PopoverProps) {
  // useFloatingParentNodeId 返回 string | null（非 Ref）
  const parentId = useFloatingParentNodeId();

  // This is a root, so we wrap it with the tree
  if (parentId === null) {
    return () => (
      <FloatingTree>
        <PopoverComponent {...props} />
      </FloatingTree>
    );
  }

  return () => <PopoverComponent {...props} />;
});

export const Main = defineComponent(function () {
  const modal = ref(true);

  return () => (
    <>
      <h1 className="text-5xl font-bold mb-8">Popover</h1>
      <div className="grid place-items-center border border-slate-400 rounded lg:w-[40rem] h-[20rem] mb-4">
        <Popover
          modal={modal.value}
          bubbles={true}
          render={({labelId, descriptionId, close}) => (
            <>
              <h2 id={labelId} className="text-2xl font-bold mb-2">
                Title
              </h2>
              <p id={descriptionId} className="mb-2">
                Description
              </p>
              <Popover
                modal={modal.value}
                bubbles={true}
                render={({labelId, descriptionId, close}) => (
                  <>
                    <h2 id={labelId} className="text-2xl font-bold mb-2">
                      Title
                    </h2>
                    <p id={descriptionId} className="mb-2">
                      Description
                    </p>
                    <Popover
                      modal={modal.value}
                      bubbles={false}
                      render={({labelId, descriptionId, close}) => (
                        <>
                          <h2 id={labelId} className="text-2xl font-bold mb-2">
                            Title
                          </h2>
                          <p id={descriptionId} className="mb-2">
                            Description
                          </p>
                          <button onClick={close} className="font-bold">
                            Close
                          </button>
                        </>
                      )}
                    >
                      <Button>My button</Button>
                    </Popover>
                    <button onClick={close} className="font-bold">
                      Close
                    </button>
                  </>
                )}
              >
                <Button>My button</Button>
              </Popover>
              <button onClick={close} className="font-bold">
                Close
              </button>
            </>
          )}
        >
          <Button>My button</Button>
        </Popover>
      </div>

      {/* Radix Checkbox → 原生 checkbox（语义等价：modal 切换） */}
      <label className="flex items-center">
        <input
          type="checkbox"
          checked={modal.value}
          onChange={(e: any) => {
            modal.value = e.target.checked;
          }}
          className="bg-slate-900 text-white rounded w-5 h-5 mr-2 grid place-items-center shadow"
        />
        Modal focus management
      </label>
    </>
  );
});
