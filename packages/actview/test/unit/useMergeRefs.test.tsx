import {defineComponent, ref, watch} from '@actview/core';
import {vi} from 'vitest';

import {useMergeRefs} from '../../src/hooks/useMergeRefs';
import {flushMicrotasks, render} from './utils';

test('merges refs and cleans up', async () => {
  const callbackSpy = vi.fn();
  let refSpy: HTMLElement | null = null;

  const App = defineComponent(function (props: {show: boolean}) {
    // 注意：合并函数变量不能命名为 `ref`（会遮蔽 @actview/core 的 ref()）
    const ref1 = ref<HTMLDivElement | null>(null);
    const ref2 = callbackSpy;
    const mergedRef = useMergeRefs([ref1, ref2]);

    watch(
      ref1,
      () => {
        refSpy = ref1.value;
      },
      {immediate: true},
    );

    return () => (props.show ? <div id="test" ref={mergedRef} /> : null);
  });

  const {rerender} = render(<App />, {props: {show: true}});
  // actview 的 watch 回调异步 flush
  await flushMicrotasks();

  expect(refSpy?.id).toBe('test');
  expect(callbackSpy.mock.calls[0][0]?.id).toBe('test');
  callbackSpy.mockReset();

  rerender({show: false});
  await flushMicrotasks();

  expect(refSpy).toBe(null);
  expect(callbackSpy.mock.calls[0][0]).toBe(null);
});

test('conditional refs', async () => {
  const callbackSpy = vi.fn();
  const callbackSpy2 = vi.fn();
  const callbackSpy3 = vi.fn();

  const App = defineComponent(function (props: {change: boolean}) {
    // React 版靠重渲染重建 useMergeRefs 的 refs 数组（change 切换 ref2/ref3）。
    // actview 的 setup 只跑一次——用 v-if 分支 + 不同 key 切换：
    // change 变化时旧分支卸载（旧合并函数收 null）+ 新分支挂载（新合并函数
    // 绑定）。同 key 会走 patch 更新（ref 不变），必须 key 区分强制重建。
    const refA = useMergeRefs([callbackSpy, callbackSpy2]);
    const refB = useMergeRefs([callbackSpy, callbackSpy3]);

    return () =>
      props.change ? (
        <div key="b" id="test" ref={refB} />
      ) : (
        <div key="a" id="test" ref={refA} />
      );
  });

  const {rerender} = render(<App />, {props: {change: false}});
  await flushMicrotasks();

  expect(callbackSpy.mock.calls[0][0]?.id).toBe('test');
  expect(callbackSpy2.mock.calls[0][0]?.id).toBe('test');
  expect(callbackSpy3.mock.calls.length).toBe(0);
  callbackSpy.mockReset();
  callbackSpy2.mockReset();

  rerender({change: true});
  await flushMicrotasks();

  expect(callbackSpy.mock.calls[0][0]).toBe(null);
  expect(callbackSpy2.mock.calls[0][0]).toBe(null);
  expect(callbackSpy.mock.calls[1][0]?.id).toBe('test');
  expect(callbackSpy2.mock.calls.length).toBe(1);
  expect(callbackSpy3.mock.calls[0][0]?.id).toBe('test');
});

test('calls clean up function if it exists', () => {
  const cleanUp = vi.fn();
  const setup = vi.fn();
  const setup2 = vi.fn();
  const nullHandler = vi.fn();

  function onRefChangeWithCleanup(ref: HTMLDivElement | null) {
    if (ref) {
      setup(ref.id);
    } else {
      nullHandler();
    }
    return cleanUp;
  }

  function onRefChangeWithoutCleanup(ref: HTMLDivElement | null) {
    if (ref) {
      setup2(ref.id);
    } else {
      nullHandler();
    }
  }

  // useMergeRefs 是纯函数（无响应式依赖），直接调用模拟 React 的挂载/卸载：
  // actview 的组件卸载不会把 ref(null) 回调到子元素，这里显式驱动合并函数
  // 验证 React 的 cleanup 语义（有 cleanup 的 ref 卸载时只调 cleanup）。
  const mergedRef = useMergeRefs([
    onRefChangeWithCleanup,
    onRefChangeWithoutCleanup,
  ])!;

  const el = document.createElement('div');
  el.id = 'test';
  mergedRef(el);

  expect(setup).toHaveBeenCalledWith('test');
  expect(setup).toHaveBeenCalledTimes(1);
  expect(cleanUp).toHaveBeenCalledTimes(0);

  expect(setup2).toHaveBeenCalledWith('test');
  expect(setup2).toHaveBeenCalledTimes(1);

  mergedRef(null);

  expect(setup).toHaveBeenCalledTimes(1);
  expect(cleanUp).toHaveBeenCalledTimes(1);

  // Setup was not called again
  expect(setup2).toHaveBeenCalledTimes(1);
  // Null handler hit because no cleanup is returned
  expect(nullHandler).toHaveBeenCalledTimes(1);
});
