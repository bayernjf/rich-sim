#!/usr/bin/env node
// B1 · 由 apps/web/public/icon.svg / icon-maskable.svg 生成 PWA 所需 PNG：
//   icon-192.png / icon-512.png（any）
//   icon-maskable-192.png / icon-maskable-512.png（Android 自适应图标，全出血）
//   apple-touch-icon.png（180×180，iOS 主屏图标，全出血，系统自行裁圆角）
// 源图为纯几何图形（无文字 glyph，避免 libvips 缺中文字体）。
// 改图后重跑：node scripts/generate-pwa-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'apps', 'web', 'public');
mkdirSync(pub, { recursive: true });

const anySvg = readFileSync(join(pub, 'icon.svg'));
const maskSvg = readFileSync(join(pub, 'icon-maskable.svg'));

const targets = [
  ['icon-192.png', anySvg, 192],
  ['icon-512.png', anySvg, 512],
  ['icon-maskable-192.png', maskSvg, 192],
  ['icon-maskable-512.png', maskSvg, 512],
  ['apple-touch-icon.png', maskSvg, 180],
];

for (const [name, svg, size] of targets) {
  const buf = await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(join(pub, name), buf);
  console.log(`wrote ${name} (${size}×${size}, ${buf.length} bytes)`);
}
