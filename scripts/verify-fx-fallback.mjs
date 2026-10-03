#!/usr/bin/env node
// T10 · 降级路径实测证据（一次性验证脚本，不进 CI）。
//
// 用 esbuild 把真实的 apps/web/src/lib/fx.ts（含其依赖 @rich-sim/core、
// defaults、static-fx.json）打包成临时 mjs，再注入三种 fetchImpl 跑：
//   A. 正常返回 Frankfurter 原始响应 → 规范化成 FxSnapshot（source=Frankfurter）
//   B. fetch 抛错（网络断）          → 降级 static-fx.json（source=static-snapshot）
//   C. HTTP 200 但缺币种             → toFxSnapshot 抛错 → 同样降级
// 任一断言失败即以非零码退出。
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

const entry = `
import { resolveSnapshot } from ${JSON.stringify(join(srcRoot, 'apps/web/src/lib/fx.ts'))};

// A. 正常：模拟 Frankfurter base=CNY 原始响应（不含 base 自身）
const okRaw = { amount: 1, base: 'CNY', date: '2026-10-02', rates: { USD: 0.14915, EUR: 0.13287, GBP: 0.11299, JPY: 23.517, HKD: 1.1704 } };
const okFetch = async () => ({ ok: true, status: 200, json: async () => okRaw });
const live = await resolveSnapshot('CNY', okFetch);
console.log('A live      =', live.base, live.source, 'CNY=' + live.rates.CNY, 'USD=' + live.rates.USD);
if (live.source !== 'Frankfurter (ECB)') throw new Error('A: source wrong');
if (live.rates.CNY !== 1) throw new Error('A: base rate not normalized to 1');
if (live.rates.USD !== 0.14915) throw new Error('A: USD rate wrong');

// B. fetch 抛错（网络断）→ 静态兜底
const badFetch = async () => { throw new Error('network down'); };
const fb = await resolveSnapshot('CNY', badFetch);
console.log('B fallback  =', fb.base, fb.source, fb.date);
if (fb.source !== 'static-snapshot') throw new Error('B: not static fallback: ' + fb.source);
if (!(fb.rates.CNY > 0) || !(fb.rates.USD > 0) || !(fb.rates.EUR > 0)) throw new Error('B: missing rates');

// C. 200 但缺币种 → toFxSnapshot 抛错 → 同样降级
const incompleteRaw = { amount: 1, base: 'USD', date: '2026-10-02', rates: { EUR: 0.89 } };
const incompleteFetch = async () => ({ ok: true, status: 200, json: async () => incompleteRaw });
const fb2 = await resolveSnapshot('USD', incompleteFetch);
console.log('C fallback  =', fb2.base, fb2.source, '(upstream missing GBP/JPY/CNY/HKD)');
if (fb2.source !== 'static-snapshot') throw new Error('C: did not fall back on missing rates');

console.log('FALLBACK_OK');
`;

const dir = mkdtempSync(join(tmpdir(), 'fx-verify-'));
const entryFile = join(dir, 'entry.ts');
const outFile = join(dir, 'entry.mjs');
writeFileSync(entryFile, entry);

await build({
  entryPoints: [entryFile],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: outFile,
  logLevel: 'warning',
});

await import(outFile);
