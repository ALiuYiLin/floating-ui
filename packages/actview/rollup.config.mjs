// @ts-check
import babel from '@rollup/plugin-babel';
import {
  defineComponentPlugin,
  solidPlugin,
} from '@actview/plugin-babel';
import {defineRollupConfig} from 'config';

export default defineRollupConfig({
  input: [
    // NOTE: actview.utils should be built first, as actview depends on it
    {
      name: 'actview.utils',
      path: './src/utils.ts',
      globalVariableName: 'FloatingUIActviewUtils',
    },
    {
      name: 'actview',
      path: './src/index.ts',
      globalVariableName: 'FloatingUIActview',
    },
  ],
  plugins: {
    // ActView 的 JSX 编译核心（与 @actview/plugin-vite 一致）：
    // defineComponentPlugin 转换 JSX + 自动 defineComponent 包装，
    // 不需要 React 的 @babel/preset-react。
    babel: babel({
      babelHelpers: 'bundled',
      extensions: ['.ts', '.tsx'],
      plugins: [defineComponentPlugin, solidPlugin],
    }),
  },
  globals: {
    '@actview/core': 'ActviewCore',
    '@actview/jsx': 'ActviewJsx',
    '@floating-ui/dom': 'FloatingUIDOM',
    '@floating-ui/utils': 'FloatingUIUtils',
    tabbable: 'tabbable',
  },
  outputs: {
    cjs: false,
    browser: false,
    umd: {
      globals: {
        '@actview/core': 'ActviewCore',
        '@actview/jsx': 'ActviewJsx',
        '@floating-ui/dom': 'FloatingUIDOM',
        '@floating-ui/utils': 'FloatingUIUtils',
        tabbable: 'tabbable',
      },
    },
  },
});
