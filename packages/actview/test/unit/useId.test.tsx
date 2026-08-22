import {defineComponent} from '@actview/core';

import {useId} from '../../src';
import {flushMicrotasks, render, screen} from './utils';

const App = defineComponent(function () {
  const id = useId();
  return () => <div data-testid="useId">{id.value}</div>;
});

test('generates a random string', async () => {
  render(<App />);
  // actview 的 useId 用 onMounted 赋值（挂载后微任务），需 flush 后断言
  await flushMicrotasks();
  expect(screen.getByTestId('useId').textContent).not.toBe('');
});
