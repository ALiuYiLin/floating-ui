import type {Ref} from '@actview/core';

// actview: `React.MutableRefObject<number>` → actview 框架类型 `Ref<number>`（.value）
export function clearTimeoutIfSet(timeoutRef: Ref<number>) {
  if (timeoutRef.value !== -1) {
    clearTimeout(timeoutRef.value);
    timeoutRef.value = -1;
  }
}
