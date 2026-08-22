import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  toValue,
  watch,
  type Ref,
} from '@actview/core';
import {
  computePosition,
  type ComputePositionConfig,
  type Middleware,
  type MiddlewareData,
  type Placement,
  type Platform,
  type Strategy,
} from '@floating-ui/dom';
import {useLatestRef} from './utils';

import type {ReferenceType} from './types';
import {deepEqual} from './utils/deepEqual';
import {getDPR} from './utils/getDPR';
import {roundByDPR} from './utils/roundByDPR';

/**
 * 定位核心（upstream 为 @floating-ui/react-dom 的 useFloating）。
 *
 * 与 upstream 的差异：
 * - 无 React：状态（x / y / placement / strategy / middlewareData / isPositioned）
 *   为 `Ref<T>`，update 结果直接赋值（actview 依赖追踪自动触发渲染）
 * - 无 `ReactDOM.flushSync`（actview 自行调度渲染）
 * - `useModernLayoutEffect` → `watch`（referenceEl / floatingEl 变化时定位 +
 *   whileElementsMounted 管理，immediate 首跑）
 * - `open` 支持 `Ref<boolean> | boolean`（`isPositioned` 同步）
 * - `elements.reference` / `elements.floating` 支持 `Ref`（toValue 读取）
 * - 元素/引用统一用宽类型 `ReferenceType`（定位层面无需 RT 细分，
 *   `computePosition` 接受 Element | VirtualElement）
 * - `middleware` 固定（setup 一次），无需 latestMiddleware 状态
 * - `floatingStyles` 为 `computed`（`Record<string, string | number>`）
 */

export interface UseFloatingOptions {
  placement?: Placement | undefined;
  strategy?: Strategy | undefined;
  middleware?: Array<Middleware> | undefined;
  platform?: Platform | undefined;
  elements?:
    | {
        reference?: ReferenceType | null | Ref<ReferenceType | null> | undefined;
        floating?: HTMLElement | null | Ref<HTMLElement | null> | undefined;
      }
    | undefined;
  transform?: boolean | undefined;
  whileElementsMounted?:
    | ((
        reference: ReferenceType,
        floating: HTMLElement,
        update: () => void,
      ) => () => void)
    | undefined;
  open?: boolean | Ref<boolean> | undefined;
}

interface UseFloatingData {
  x: number;
  y: number;
  strategy: Strategy;
  placement: Placement;
  middlewareData: MiddlewareData;
  isPositioned: boolean;
}

export interface UseFloatingReturn {
  x: Ref<number | null>;
  y: Ref<number | null>;
  strategy: Ref<Strategy>;
  placement: Ref<Placement>;
  middlewareData: Ref<MiddlewareData>;
  isPositioned: Ref<boolean>;
  update(): void;
  floatingStyles: Ref<Record<string, string | number>>;
  refs: {
    reference: Ref<ReferenceType | null>;
    floating: Ref<HTMLElement | null>;
    setReference(node: ReferenceType | null): void;
    setFloating(node: HTMLElement | null): void;
  };
  elements: {
    reference: Ref<ReferenceType | null>;
    floating: Ref<HTMLElement | null>;
  };
}

/**
 * Provides data to position a floating element.
 * @see https://floating-ui.com/docs/useFloating
 */
export function useFloating(
  options: UseFloatingOptions = {},
): UseFloatingReturn {
  const {
    placement = 'bottom',
    strategy = 'absolute',
    middleware = [],
    platform,
    elements: {reference: externalReference, floating: externalFloating} = {},
    transform = true,
    whileElementsMounted,
    open,
  } = options;

  const x = ref<number | null>(0);
  const y = ref<number | null>(0);
  const placementRef = ref<Placement>(placement);
  const strategyRef = ref<Strategy>(strategy);
  const middlewareDataRef = ref<MiddlewareData>({});
  const isPositionedRef = ref(false);

  const _reference = ref<ReferenceType | null>(null);
  const _floating = ref<HTMLElement | null>(null);

  const setReference = (node: ReferenceType | null) => {
    if (node !== referenceRef.value) {
      referenceRef.value = node;
      _reference.value = node;
    }
  };

  const setFloating = (node: HTMLElement | null) => {
    if (node !== floatingRef.value) {
      floatingRef.value = node;
      _floating.value = node;
    }
  };

  const referenceEl = computed(
    () => toValue(externalReference) ?? _reference.value,
  );
  const floatingEl = computed(
    () => toValue(externalFloating) ?? _floating.value,
  );

  const referenceRef = ref<ReferenceType | null>(null);
  const floatingRef = ref<HTMLElement | null>(null);
  const dataRef = ref<UseFloatingData>({
    x: 0,
    y: 0,
    strategy,
    placement,
    middlewareData: {},
    isPositioned: false,
  });

  const openRef = computed(() => toValue(open));
  const platformRef = useLatestRef(platform);

  const update = () => {
    if (!referenceRef.value || !floatingRef.value) {
      return;
    }

    const config: ComputePositionConfig = {
      placement: placementRef.value,
      strategy: strategyRef.value,
      middleware,
    };

    if (platformRef.value) {
      config.platform = platformRef.value;
    }

    computePosition(referenceRef.value, floatingRef.value, config).then(
      (data) => {
        const fullData = {
          ...data,
          // The floating element's position may be recomputed while it's closed
          // but still mounted (such as when transitioning out). To ensure
          // `isPositioned` will be `false` initially on the next open, avoid
          // setting it to `true` when `open === false` (must be specified).
          isPositioned: openRef.value !== false,
        };
        if (isMountedRef.value && !deepEqual(dataRef.value, fullData)) {
          dataRef.value = fullData;
          x.value = fullData.x;
          y.value = fullData.y;
          placementRef.value = fullData.placement;
          strategyRef.value = fullData.strategy;
          middlewareDataRef.value = fullData.middlewareData;
          isPositionedRef.value = fullData.isPositioned;
        }
      },
    );
  };

  // React 版 `useModernLayoutEffect` [open]：关闭时重置 isPositioned
  watch(openRef, () => {
    if (openRef.value === false && dataRef.value.isPositioned) {
      dataRef.value.isPositioned = false;
      isPositionedRef.value = false;
    }
  });

  const isMountedRef = ref(false);

  // React 版 `useModernLayoutEffect`：[referenceEl, floatingEl, update, ...]。
  // actview 语义（同 Vue）：
  // - 首次定位在 `onMounted`（DOM 挂载完成、元素就绪后）执行，
  //   而非 `watch(..., {immediate: true})`——后者在 setup 同步执行时元素未挂载；
  // - 元素变化（setReference / setFloating / 外部 elements Ref 更新）由
  //   `watch` 追踪，重建 whileElementsMounted 或重新定位。
  let cleanupWhileMounted: (() => void) | undefined;

  const syncAndPosition = () => {
    cleanupWhileMounted?.();
    cleanupWhileMounted = undefined;

    if (referenceEl.value) referenceRef.value = referenceEl.value;
    if (floatingEl.value) floatingRef.value = floatingEl.value;

    if (referenceRef.value && floatingRef.value) {
      if (whileElementsMounted) {
        cleanupWhileMounted = whileElementsMounted(
          referenceRef.value,
          floatingRef.value,
          update,
        );
      } else {
        update();
      }
    }
  };

  watch([referenceEl, floatingEl], syncAndPosition);

  onMounted(() => {
    isMountedRef.value = true;
    syncAndPosition();
  });

  onUnmounted(() => {
    isMountedRef.value = false;
    cleanupWhileMounted?.();
  });

  const floatingStyles = computed<Record<string, string | number>>(() => {
    const initialStyles = {
      position: strategyRef.value,
      left: 0,
      top: 0,
    };

    if (!floatingEl.value) {
      return initialStyles;
    }

    const fx = roundByDPR(floatingEl.value, x.value ?? 0);
    const fy = roundByDPR(floatingEl.value, y.value ?? 0);

    if (transform) {
      return {
        ...initialStyles,
        transform: `translate(${fx}px, ${fy}px)`,
        ...(getDPR(floatingEl.value) >= 1.5 && {willChange: 'transform'}),
      };
    }

    return {
      position: strategyRef.value,
      left: fx,
      top: fy,
    };
  });

  return {
    x,
    y,
    strategy: strategyRef,
    placement: placementRef,
    middlewareData: middlewareDataRef,
    isPositioned: isPositionedRef,
    update,
    floatingStyles,
    refs: {
      reference: referenceRef,
      floating: floatingRef,
      setReference,
      setFloating,
    },
    elements: {
      reference: referenceEl,
      floating: floatingEl,
    },
  };
}
