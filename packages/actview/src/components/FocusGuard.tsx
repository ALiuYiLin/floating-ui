import {defineComponent, onMounted, ref, type Ref} from '@actview/core';
import {isSafari} from '@floating-ui/actview/utils';

import {createAttribute} from '../utils/createAttribute';

/**
 * actview 版（upstream 为 React 组件）。
 *
 * 与 upstream 的差异：
 * - `React.forwardRef` → `defineComponent`（`ref` 作为 prop 透传给底层 span）
 * - `React.useState` → `ref()` + `onMounted`（Safari 检测）
 * - `React.CSSProperties` → `Record<string, string | number>`
 */

// See Diego Haz's Sandbox for making this logic work well on Safari/iOS:
// https://codesandbox.io/s/tabbable-portal-f4tng?file=/src/FocusTrap.tsx

export const HIDDEN_STYLES: Record<string, string | number> = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'fixed',
  whiteSpace: 'nowrap',
  width: '1px',
  top: 0,
  left: 0,
};

export interface FocusGuardProps {
  children?: any;
  ref?:
    | Ref<HTMLSpanElement | null>
    | ((el: HTMLSpanElement | null) => void)
    | undefined;
  [key: string]: unknown;
}

export const FocusGuard = defineComponent(function (
  props: FocusGuardProps,
) {
  const role = ref<'button' | undefined>(undefined);

  onMounted(() => {
    if (isSafari()) {
      // Unlike other screen readers such as NVDA and JAWS, the virtual cursor
      // on VoiceOver does trigger the onFocus event, so we can use the focus
      // trap element. On Safari, only buttons trigger the onFocus event.
      // NB: "group" role in the Sandbox no longer appears to work, must be a
      // button role.
      role.value = 'button';
    }
  });

  const {ref: refProp, ...restProps} = props;

  return () => (
    <span
      ref={refProp as Ref<HTMLSpanElement | null> | undefined}
      {...restProps}
      tabIndex={0}
      // Role is only for VoiceOver
      role={role.value}
      aria-hidden={role.value ? undefined : true}
      {...{[createAttribute('focus-guard')]: ''}}
      style={HIDDEN_STYLES}
    />
  );
});
