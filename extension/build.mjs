// 打包扩展到 dist/：background.js 带上 Anthropic SDK，其余文件原样复制。
// 用法: node build.mjs   然后在 chrome://extensions 「加载已解压的扩展程序」选 dist 文件夹。
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
await build({
  entryPoints: ['src/background.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  outfile: 'dist/background.js',
  legalComments: 'none',
});
for (const f of ['manifest.json', 'match.js', 'content-htr.js', 'content-htr.css', 'content-cellar.js',
  'popup.html', 'popup.js', 'options.html', 'options.js', 'ui.css']) cpSync('src/' + f, 'dist/' + f);
console.log('已打包到 dist/');
