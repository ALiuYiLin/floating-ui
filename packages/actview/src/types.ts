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
  Strategy,
  VirtualElement,
} from '@floating-ui/dom';

export type {Dimensions};

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
 * actview 版在 hooks 阶段实现，此处仅提供 utils 层需要的结构。
 */
export interface UsePositionFloatingReturn {
  x: number;
  y: number;
  placement: Placement;
  strategy: Strategy;
  middlewareData: MiddlewareData;
  isPositioned: boolean;
  update(): void;
  floatingStyles: Record<string, string | number>;
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
  reference: ReferenceType | null;
  floating: HTMLElement | null;
  domReference: NarrowedElement<RT> | null;
}

export type OpenChangeReason =
  | 'click'
  | 'hover'
  | 'focus'
  | 'dismiss'
  | 'safe-polygon'
  | 'list-navigation'
  | 'focus-out';

export interface FloatingRootContext<RT extends ReferenceType = ReferenceType> {
  dataRef: Ref<ContextData>;
  open: boolean;
  onOpenChange(open: boolean, event?: Event, reason?: OpenChangeReason): void;
  elements: {
    domReference: Element | null;
    reference: RT | null;
    floating: HTMLElement | null;
  };
  events: FloatingEvents;
  floatingId: string | undefined;
  refs: {
    setPositionReference(node: ReferenceType | null): void;
  };
}

export type FloatingContext<RT extends ReferenceType = ReferenceType> = Omit<
  UsePositionFloatingReturn,
  'refs' | 'elements'
> & {
  open: boolean;
  onOpenChange(open: boolean, event?: Event, reason?: OpenChangeReason): void;
  events: FloatingEvents;
  dataRef: Ref<ContextData>;
  nodeId: string | undefined;
  floatingId: string | undefined;
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
