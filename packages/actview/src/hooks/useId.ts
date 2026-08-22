import {onMounted, ref, type Ref} from '@actview/core';

/**
 * actview 版（upstream 为 React hook：React.useId / useFloatingId）。
 *
 * 与 upstream 的差异：
 * - 无 React.useId / SafeReact：统一使用 floating-ui 自生成的唯一 id
 * - 返回 `Ref<string | undefined>`（actview 渲染期读 `.value`）；React 版返回
 *   渲染期 string（每次渲染更新），actview 中 setup 调用一次后由 onMounted 赋值，
 *   渲染函数读取该 Ref 建立依赖，赋值后自动重渲染
 */

let serverHandoffComplete = false;
let count = 0;
const genId = () =>
  // Ensure the id is unique with multiple independent versions of Floating UI
  // on <React 18
  `floating-ui-${Math.random().toString(36).slice(2, 6)}${count++}`;

/**
 * Returns a stable unique id for the floating element.
 * @see https://floating-ui.com/docs/react-utils#useid
 */
export function useId(): Ref<string | undefined> {
  const id = ref<string | undefined>(serverHandoffComplete ? genId() : undefined);

  onMounted(() => {
    serverHandoffComplete = true;
    if (id.value == null) {
      id.value = genId();
    }
  });

  return id;
}
