module.exports = {
  presets: [
    ['@babel/env', {loose: true}],
    // isTSX: true 让 parser 解析 .tsx 的 JSX 语法；
    // JSX 转换（defineComponent 包装 + _jsx）由 @actview/plugin-babel
    // 的 defineComponentPlugin 完成（见 rollup.config.mjs），无需 @babel/react。
    ['@babel/typescript', {isTSX: true, allExtensions: true}],
  ],
};
