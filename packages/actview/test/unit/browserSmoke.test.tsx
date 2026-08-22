import {defineComponent, ref} from '@actview/core';

import {isJSDOM} from '../../src/utils';

import {fireEvent, flushMicrotasks, render, screen} from './utils';

// browser mode 流程小案例（全新）：
// 同一批测试文件由两个 runner 执行（对齐 React 版双环境矩阵）——
// - `pnpm test`（jsdom）：skipIf(!isJSDOM) 执行，skipIf(isJSDOM) 跳过
// - `pnpm test:browser`（Playwright Chromium）：skipIf(isJSDOM) 执行，
//   skipIf(!isJSDOM) 跳过
// 跑通流程即可：验证两环境下各有一条专属测试被执行、无 skip 的测试都跑。

const Toggle = defineComponent(function () {
  const on = ref(false);

  return () => (
    <button data-testid="toggle" onClick={() => (on.value = !on.value)}>
      {on.value ? 'ON' : 'OFF'}
    </button>
  );
});

describe('browser mode smoke（browser 环境小案例）', () => {
  test('无 skip：jsdom 与 Chromium 都执行', async () => {
    render(<Toggle />);
    await flushMicrotasks();

    expect(screen.getByTestId('toggle')).toHaveTextContent('OFF');
    fireEvent.click(screen.getByTestId('toggle'));
    await flushMicrotasks();
    expect(screen.getByTestId('toggle')).toHaveTextContent('ON');
  });

  // 仅真实浏览器：jsdom 的 getBoundingClientRect 恒为零，真实布局才有尺寸。
  test.skipIf(isJSDOM())('仅真实浏览器：真实布局 + 非 jsdom UA', () => {
    expect(navigator.userAgent).not.toContain('jsdom/');

    const el = document.createElement('div');
    document.body.appendChild(el);
    el.style.width = '100px';
    expect(el.getBoundingClientRect().width).toBe(100);
    el.remove();
  });

  // 仅 jsdom：chromium 的 UA 不含 jsdom/。
  test.skipIf(!isJSDOM())('仅 jsdom：UA 含 jsdom', () => {
    expect(navigator.userAgent).toContain('jsdom/');
  });
});
