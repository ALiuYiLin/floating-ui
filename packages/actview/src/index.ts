/**
 * @floating-ui/actview — @floating-ui/react 的 actview 版。
 *
 * 导出面与 upstream `packages/react/src/index.ts` 对齐：
 * - utils 工具（`./utils` 子路径同 `@floating-ui/react/utils`）
 * - 交互 hooks（useClick / useDismiss / useHover / useListNavigation / ...）
 * - 组件（FloatingTree / FloatingPortal / FloatingFocusManager / Composite / ...）
 * - safePolygon / inner / useInnerOffset
 */
export {Composite, CompositeItem} from './components/Composite';
export {FloatingArrow} from './components/FloatingArrow';
export {
  FloatingDelayGroup,
  useDelayGroup,
  useDelayGroupContext,
} from './components/FloatingDelayGroup';
export {
  NextFloatingDelayGroup,
  useNextDelayGroup,
} from './components/NextFloatingDelayGroup';
export {FloatingFocusManager} from './components/FloatingFocusManager';
export {FloatingList, useListItem} from './components/FloatingList';
export {FloatingOverlay} from './components/FloatingOverlay';
export {
  FloatingPortal,
  useFloatingPortalNode,
} from './components/FloatingPortal';
export {
  FloatingNode,
  FloatingTree,
  useFloatingNodeId,
  useFloatingParentNodeId,
  useFloatingTree,
} from './components/FloatingTree';
export {useClick} from './hooks/useClick';
export {useClientPoint} from './hooks/useClientPoint';
export {useDismiss} from './hooks/useDismiss';
export {useFloating} from './hooks/useFloating';
export {useFloatingRootContext} from './hooks/useFloatingRootContext';
export {useFocus} from './hooks/useFocus';
export {useHover} from './hooks/useHover';
export {useId} from './hooks/useId';
export {useInteractions} from './hooks/useInteractions';
export {useListNavigation} from './hooks/useListNavigation';
export {useMergeRefs} from './hooks/useMergeRefs';
export {useRole} from './hooks/useRole';
export {useTransitionStatus, useTransitionStyles} from './hooks/useTransition';
export {useTypeahead} from './hooks/useTypeahead';
export {inner, useInnerOffset} from './_deprecated-inner';
export {safePolygon} from './safePolygon';
export type * from './types';
export * from './utils';
