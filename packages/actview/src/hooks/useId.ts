import {ref, type Ref} from '@actview/core';

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
 *
 * actview 为客户端渲染（无 hydration 匹配需求），id 在 setup 同步生成，
 * 保证父组件的 nodeId 在子组件挂载前就绪（FloatingNode 的 value.id /
 * useFloatingParentNodeId 依赖它；延迟到 onMounted 会让嵌套 FloatingTree
 * 判断读到 null，产生双 FloatingTree）。
 */
export function useId(): Ref<string | undefined> {
  const id = ref<string | undefined>(genId());
  serverHandoffComplete = true;

  return id;
}
