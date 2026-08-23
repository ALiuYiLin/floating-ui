// @ts-check
/**
 * 把 `tsc -p tsconfig.lib.json` 生成的声明（out-tsc/src/**）复制到 dist/，
 * 并按 package.json 的 exports 重命名入口声明：
 *   - out-tsc/src/index.d.ts  → dist/floating-ui.actview.d.ts / .d.mts
 *   - out-tsc/src/utils.d.ts  → dist/floating-ui.actview.utils.d.ts / .d.mts
 * 其余声明文件（components/hooks/utils 等）原样复制，保证内部相对 import 可解析。
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(root, '..');
const outTsc = join(packageRoot, 'out-tsc', 'src');
const dist = join(packageRoot, 'dist');

if (!existsSync(outTsc)) {
  console.error('out-tsc/src not found — run `tsc -p tsconfig.lib.json` first');
  process.exit(1);
}

// 清理旧的声明产物（保留 js 产物）
for (const file of ['floating-ui.actview.d.ts', 'floating-ui.actview.d.mts', 'floating-ui.actview.utils.d.ts', 'floating-ui.actview.utils.d.mts']) {
  rmSync(join(dist, file), { force: true });
}

// 复制全部声明（保留目录结构），覆盖同名旧声明
cpSync(outTsc, dist, { recursive: true, force: true });

// 重命名入口声明
const copies = [
  ['index.d.ts', 'floating-ui.actview.d.ts'],
  ['index.d.ts', 'floating-ui.actview.d.mts'],
  ['utils.d.ts', 'floating-ui.actview.utils.d.ts'],
  ['utils.d.ts', 'floating-ui.actview.utils.d.mts'],
];
for (const [from, to] of copies) {
  copyFileSync(join(dist, from), join(dist, to));
}

console.log('declarations copied to dist/');
