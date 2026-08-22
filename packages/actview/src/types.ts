/**
 * @floating-ui/actview — 第一阶段类型子集。
 *
 * 只包含 utils 层（nodes.ts / composite.ts）实际引用的类型；
 * hooks/components 阶段将按 upstream `packages/react/src/types.ts` 逐步补全。
 *
 * 与 upstream 的差异：
 * - `React.MutableRefObject<T>` → actview 框架类型 `Ref<T>`（来自 @actview/core，只能读 .value）
 * - `UsePositionFloatingReturn` 为最小结构（upstream 从 @floating-ui/react-dom 导入，
 *   actview 在 hooks 阶段实现 useFloating 时补全）
 */
import type {Ref} from '@actview/core';
import type {
  Dimensions,
  MiddlewareData,
  Placement,
  Side,
  Strategy,
  VirtualElement,
} from '@floating-ui/dom';

export type {Dimensions, Placement, Side};

export type ReferenceType = Element | VirtualElement;

export type NarrowedElement<T> = T extends Element ? T : Element;

export interface FloatingEvents {
  emit<T extends string>(event: T, data?: any): void;
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
}

export interface ContextData {
  openEvent?: Event | undefined;
  floatingContext?: FloatingContext | undefined;
  /** @deprecated use `onTypingChange` prop in `useTypeahead` */
  typing?: boolean | undefined;
  [key: string]: any;
}

/**
 * 定位返回值子集（upstream 来自 @floating-ui/react-dom 的 UsePositionFloatingReturn）。
 * actview 版响应式字段为 `Ref<T>`（.value），hooks 阶段实现 useFloating 时补全。
 */
export interface UsePositionFloatingReturn {
  x: Ref<number>;
  y: Ref<number>;
  placement: Ref<Placement>;
  strategy: Ref<Strategy>;
  middlewareData: Ref<MiddlewareData>;
  isPositioned: Ref<boolean>;
  update(): void;
  floatingStyles: Ref<Record<string, string | number>>;
}

export interface ExtendedRefs<RT extends ReferenceType = ReferenceType> {
  reference: Ref<ReferenceType | null>;
  floating: Ref<HTMLElement | null>;
  domReference: Ref<NarrowedElement<RT> | null>;
  setReference(node: RT | null): void;
  setFloating(node: HTMLElement | null): void;
  setPositionReference(node: ReferenceType | null): void;
}

export interface ExtendedElements<RT extends ReferenceType = ReferenceType> {
  reference: Ref<ReferenceType | null>;
  floating: Ref<HTMLElement | null>;
  domReference: Ref<Element | null>;
}

export type OpenChangeReason =
  | 'outside-press'
  | 'escape-key'
  | 'ancestor-scroll'
  | 'reference-press'
  | 'click'
  | 'hover'
  | 'focus'
  | 'focus-out'
  | 'list-navigation'
  | 'safe-polygon';

export interface FloatingRootContext<RT extends ReferenceType = ReferenceType> {
  dataRef: Ref<ContextData>;
  open: Ref<boolean>;
  onOpenChange(open: boolean, event?: Event, reason?: OpenChangeReason): void;
  elements: {
    domReference: Ref<Element | null>;
    reference: Ref<RT | null>;
    floating: Ref<HTMLElement | null>;
  };
  events: FloatingEvents;
  floatingId: Ref<string | undefined>;
  refs: {
    setPositionReference(node: ReferenceType | null): void;
  };
}

export type FloatingContext<RT extends ReferenceType = ReferenceType> = Omit<
  UsePositionFloatingReturn,
  'refs' | 'elements'
> & {
  open: Ref<boolean>;
  onOpenChange(open: boolean, event?: Event, reason?: OpenChangeReason): void;
  events: FloatingEvents;
  dataRef: Ref<ContextData>;
  nodeId: Ref<string | undefined>;
  floatingId: Ref<string | undefined>;
  refs: ExtendedRefs<RT>;
  elements: ExtendedElements<RT>;
};

export interface FloatingNodeType<RT extends ReferenceType = ReferenceType> {
  id: string | undefined;
  parentId: string | null;
  context?: FloatingContext<RT> | undefined;
}

export interface FloatingTreeType<RT extends ReferenceType = ReferenceType> {
  nodesRef: Ref<Array<FloatingNodeType<RT>>>;
  events: FloatingEvents;
  addNode(node: FloatingNodeType): void;
  removeNode(node: FloatingNodeType): void;
}

/** 事件处理器 props 中用于标记 active/selected 的自定义键（ACTIVE_KEY / SELECTED_KEY） */
export type ExtendedUserProps = {
  active?: boolean | undefined;
  selected?: boolean | undefined;
};

/**
 * 交互 hook（useClick / useHover / useDismiss / useListNavigation 等）返回的
 * 事件处理器集合，由调用方 spread 到 reference / floating / item 元素上。
 * reference / floating 可为 `Ref`（响应式派生，如 useRole 的 aria 属性随 open 变化）；
 * mergeProps 用 `unref` 统一解包。item 的函数形态按调用传入的 active/selected 派生。
 */
export interface ElementProps {
  reference?: Record<string, unknown> | Ref<Record<string, unknown>> | undefined;
  floating?: Record<string, unknown> | Ref<Record<string, unknown>> | undefined;
  item?:
    | Record<string, unknown>
    | Ref<Record<string, unknown>>
    | ((props: ExtendedUserProps) => Record<string, unknown>)
    | undefined;
}
