import {defineConfig} from 'vitest/config';
import {playwright} from '@vitest/browser-playwright';

// 不用 config 包的 defineViteConfig：其在 Windows 上 basePath 计算错误
// （path.resolve 产生 E:\E:\... 双盘符）。
// workspace 包（utils/core/dom）已构建 dist，vite 经 node_modules exports
// 正常解析；actview 包自身 src 内部用相对路径 import。
//
// 双环境（对齐 React 版）：
// - `pnpm test`（默认）：jsdom 环境跑 test/unit——skipIf(!isJSDOM) 的测试执行，
//   skipIf(isJSDOM) 的跳过
// - `pnpm test:browser`（TEST_ENV=browser）：vitest browser mode 用 Playwright
//   Chromium 跑同一批 test/unit——skipIf(isJSDOM) 的测试执行（真实布局/动画帧/
//   Shadow DOM 等 jsdom 无法模拟的能力），skipIf(!isJSDOM) 的跳过
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    root: './test/unit',
    setupFiles: ['./setupTests.ts'],
    browser: {
      provider: playwright(),
      enabled: process.env.TEST_ENV === 'browser',
      instances: [{browser: 'chromium'}],
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@actview/jsx',
  },
  define: {
    __DEV__: true,
  },
});
