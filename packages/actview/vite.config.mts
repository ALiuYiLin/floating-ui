import {defineConfig} from 'vitest/config';

// 不用 config 包的 defineViteConfig：其在 Windows 上 basePath 计算错误
// （path.resolve 产生 E:\E:\... 双盘符）。
// workspace 包（utils/core/dom）已构建 dist，vite 经 node_modules exports
// 正常解析；actview 包自身 src 内部用相对路径 import。
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    root: './test/unit',
    setupFiles: ['./setupTests.ts'],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@actview/jsx',
  },
  define: {
    __DEV__: true,
  },
});
