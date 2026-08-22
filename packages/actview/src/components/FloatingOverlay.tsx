import {defineComponent, onWatcherCleanup, watch, type Ref} from '@actview/core';
import {getPlatform} from '@floating-ui/actview/utils';

/**
 * actview 版（upstream 为 React 组件）。
 *
 * 与 upstream 的差异：
 * - `React.forwardRef` → `defineComponent`（`ref` 作为 prop 透传给底层 div）
 * - `useModernLayoutEffect` + 手动 cleanup → `watch` + `onWatcherCleanup`
 *   （actview 的 Vue 风格 watch 清理：下次触发 / 卸载时自动执行）
 * - `lockScroll` 为响应式 props（watch 源 `() => props.lockScroll`）
 * - `React.CSSProperties` → `Record<string, string | number>`
 */

let lockCount = 0;
const scrollbarProperty = '--floating-ui-scrollbar-width';

export interface FloatingOverlayProps {
  /**
   * Whether the overlay should lock scrolling on the document body.
   * @default false
   */
  lockScroll?: boolean | undefined;
  [key: string]: unknown;
}

function enableScrollLock() {
  const platform = getPlatform();
  const isIOS =
    /iP(hone|ad|od)|iOS/.test(platform) ||
    // iPads can claim to be MacIntel
    (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const bodyStyle = document.body.style;
  // RTL <body> scrollbar
  const scrollbarX =
    Math.round(document.documentElement.getBoundingClientRect().left) +
    document.documentElement.scrollLeft;
  const paddingProp = scrollbarX ? 'paddingLeft' : 'paddingRight';
  const scrollbarWidth =
    window.innerWidth - document.documentElement.clientWidth;
  const scrollX = bodyStyle.left ? parseFloat(bodyStyle.left) : window.scrollX;
  const scrollY = bodyStyle.top ? parseFloat(bodyStyle.top) : window.scrollY;

  bodyStyle.overflow = 'hidden';
  bodyStyle.setProperty(scrollbarProperty, `${scrollbarWidth}px`);

  if (scrollbarWidth) {
    bodyStyle[paddingProp] = `${scrollbarWidth}px`;
  }

  // Only iOS doesn't respect `overflow: hidden` on document.body, and this
  // technique has fewer side effects.
  if (isIOS) {
    // iOS 12 does not support `visualViewport`.
    const offsetLeft = window.visualViewport?.offsetLeft || 0;
    const offsetTop = window.visualViewport?.offsetTop || 0;

    Object.assign(bodyStyle, {
      position: 'fixed',
      top: `${-(scrollY - Math.floor(offsetTop))}px`,
      left: `${-(scrollX - Math.floor(offsetLeft))}px`,
      right: '0',
    });
  }

  return () => {
    Object.assign(bodyStyle, {
      overflow: '',
      [paddingProp]: '',
    });
    bodyStyle.removeProperty(scrollbarProperty);

    if (isIOS) {
      Object.assign(bodyStyle, {
        position: '',
        top: '',
        left: '',
        right: '',
      });
      window.scrollTo(scrollX, scrollY);
    }
  };
}

let cleanup = () => {};

/**
 * Provides base styling for a fixed overlay element to dim content or block
 * pointer events behind a floating element.
 * It's a regular `<div>`, so it can be styled via any CSS solution you prefer.
 * @see https://floating-ui.com/docs/FloatingOverlay
 */
export const FloatingOverlay = defineComponent(function (
  props: FloatingOverlayProps,
) {
  // React 版 `useModernLayoutEffect` [lockScroll]：锁滚动（计数共享）
  watch(
    () => props.lockScroll,
    (value) => {
      const lockScroll = value ?? false;
      if (!lockScroll) return;

      lockCount++;

      if (lockCount === 1) {
        cleanup = enableScrollLock();
      }

      onWatcherCleanup(() => {
        lockCount--;
        if (lockCount === 0) {
          cleanup();
        }
      });
    },
    {immediate: true},
  );

  return () => {
    const {ref: refProp, lockScroll, ...rest} = props;

    return (
      <div
        ref={refProp as Ref<HTMLDivElement | null> | undefined}
        {...rest}
        style={{
          position: 'fixed',
          overflow: 'auto',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          ...(rest.style as Record<string, unknown> | undefined),
        }}
      />
    );
  };
});
