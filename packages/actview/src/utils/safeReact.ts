/**
 * actview 占位（upstream: `export const SafeReact = {...React}`，
 * https://github.com/mui/material-ui/issues/41190 —— useInsertionEffect shim）。
 *
 * actview 无 React / useInsertionEffect 概念，此文件保留以对齐 upstream 结构；
 * 无消费者（actview 版 hooks.ts 不引用 SafeReact）。
 */
export const SafeReact = {} as never;
