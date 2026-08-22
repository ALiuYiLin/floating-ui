import {defineComponent, ref, watch, type Ref} from '@actview/core';
import {getComputedStyle} from '@floating-ui/utils/dom';

import {useId} from '../hooks/useId';
import type {Alignment, FloatingContext, Side} from '../types';
import {warn} from '../utils/log';

/**
 * actview 版（upstream 为 React 组件）。
 *
 * 与 upstream 的差异：
 * - `React.forwardRef` → `defineComponent`（`ref` 作为 prop 透传给 svg）
 * - `React.useState` → `ref()`；`useModernLayoutEffect` → `watch`
 * - context 字段为 `Ref`：`placement.value` / `elements.floating.value` /
 *   `middlewareData.value.{arrow,shift}`
 * - `useId` 返回 `Ref<string | undefined>`（clipPathId.value）
 * - `style` 在渲染闭包内解构（props 响应式）
 */

export interface FloatingArrowProps {
  // Omit the original `refs` property from the context to avoid issues with
  // generics: https://github.com/floating-ui/floating-ui/issues/2483
  /**
   * The floating context.
   */
  context: Omit<FloatingContext, 'refs'> & {refs: any};
  /**
   * Width of the arrow.
   * @default 14
   */
  width?: number | undefined;
  /**
   * Height of the arrow.
   * @default 7
   */
  height?: number | undefined;
  /**
   * The corner radius (rounding) of the arrow tip.
   * @default 0 (sharp)
   */
  tipRadius?: number | undefined;
  /**
   * Forces a static offset over dynamic positioning under a certain condition.
   * If the shift() middleware causes the popover to shift, this value will be
   * ignored.
   */
  staticOffset?: string | number | null | undefined;
  /**
   * Custom path string.
   */
  d?: string | undefined;
  /**
   * Stroke (border) color of the arrow.
   */
  stroke?: string | undefined;
  /**
   * Stroke (border) width of the arrow.
   */
  strokeWidth?: number | undefined;
  ref?:
    | Ref<SVGSVGElement | null>
    | ((el: SVGSVGElement | null) => void)
    | undefined;
  style?: Record<string, unknown> | undefined;
  fill?: unknown;
  [key: string]: unknown;
}

/**
 * Renders a pointing arrow triangle.
 * @see https://floating-ui.com/docs/FloatingArrow
 */
export const FloatingArrow = defineComponent(function (
  props: FloatingArrowProps,
) {
  const {
    context: {
      placement,
      elements: {floating},
      middlewareData,
    },
    width = 14,
    height = 7,
    tipRadius = 0,
    strokeWidth = 0,
    staticOffset,
    stroke,
    d,
    ref: refProp,
  } = props;

  if (__DEV__) {
    if (!refProp) {
      warn('The `ref` prop is required for `FloatingArrow`.');
    }
  }

  const clipPathId = useId();
  const isRTL = ref(false);

  // https://github.com/floating-ui/floating-ui/issues/2932
  watch(
    () => floating.value,
    () => {
      if (!floating.value) return;
      const rtl = getComputedStyle(floating.value).direction === 'rtl';
      if (rtl) {
        isRTL.value = true;
      }
    },
  );

  return () => {
    if (!floating.value) {
      return null;
    }

    const [side, alignment] = placement.value.split('-') as [Side, Alignment];
    const isVerticalSide = side === 'top' || side === 'bottom';
    const {arrow, shift} = middlewareData.value;

    let computedStaticOffset = staticOffset;
    if ((isVerticalSide && shift?.x) || (!isVerticalSide && shift?.y)) {
      computedStaticOffset = null;
    }

    // Strokes must be double the border width, this ensures the stroke's width
    // works as you'd expect.
    const computedStrokeWidth = strokeWidth * 2;
    const halfStrokeWidth = computedStrokeWidth / 2;

    const svgX = (width / 2) * (tipRadius / -8 + 1);
    const svgY = ((height / 2) * tipRadius) / 4;

    const isCustomShape = !!d;

    const yOffsetProp =
      computedStaticOffset && alignment === 'end' ? 'bottom' : 'top';
    let xOffsetProp =
      computedStaticOffset && alignment === 'end' ? 'right' : 'left';
    if (computedStaticOffset && isRTL.value) {
      xOffsetProp = alignment === 'end' ? 'left' : 'right';
    }

    const arrowX = arrow?.x != null ? computedStaticOffset || arrow.x : '';
    const arrowY = arrow?.y != null ? computedStaticOffset || arrow.y : '';

    const dValue =
      d ||
      'M0,0' +
        ` H${width}` +
        ` L${width - svgX},${height - svgY}` +
        ` Q${width / 2},${height} ${svgX},${height - svgY}` +
        ' Z';

    const rotation = {
      top: isCustomShape ? 'rotate(180deg)' : '',
      left: isCustomShape ? 'rotate(90deg)' : 'rotate(-90deg)',
      bottom: isCustomShape ? '' : 'rotate(180deg)',
      right: isCustomShape ? 'rotate(-90deg)' : 'rotate(90deg)',
    }[side];

    const {transform, ...restStyle} = (props.style ?? {}) as Record<
      string,
      unknown
    >;
    const {ref: _, context: __, style: ___, ...rest} = props;

    // actview 的 SVGAttributes 为精简类型（缺 ref/id/style 等），
    // 运行时支持任意属性，此处整体 cast 绕过
    const svgProps = {
      ...rest,
      ref: refProp,
      'aria-hidden': true,
      width: isCustomShape ? width : width + computedStrokeWidth,
      height: width,
      viewBox: `0 0 ${width} ${height > width ? height : width}`,
      style: {
        position: 'absolute',
        pointerEvents: 'none',
        [xOffsetProp]: arrowX,
        [yOffsetProp]: arrowY,
        [side]:
          isVerticalSide || isCustomShape
            ? '100%'
            : `calc(100% - ${computedStrokeWidth / 2}px)`,
        transform: [rotation, transform].filter((t) => !!t).join(' '),
        ...restStyle,
      },
    } as any;

    return (
      <svg {...svgProps}>
        {computedStrokeWidth > 0 && (
          <path
            clipPath={`url(#${clipPathId.value})`}
            fill="none"
            stroke={stroke}
            // Account for the stroke on the fill path rendered below.
            strokeWidth={computedStrokeWidth + (d ? 0 : 1)}
            d={dValue}
          />
        )}
        {/* In Firefox, for left/right placements there's a ~0.5px gap where the
        border can show through. Adding a stroke on the fill removes it. */}
        <path
          stroke={
            (computedStrokeWidth && !d ? rest.fill : 'none') as
              | string
              | undefined
          }
          d={dValue}
        />
        {/* Assumes the border-width of the floating element matches the
        stroke. */}
        <clipPath {...({id: clipPathId.value} as Record<string, unknown>)}>
          <rect
            x={-halfStrokeWidth}
            y={halfStrokeWidth * (isCustomShape ? -1 : 1)}
            width={width + computedStrokeWidth}
            height={width}
          />
        </clipPath>
      </svg>
    );
  };
});
