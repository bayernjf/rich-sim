#!/usr/bin/env node
// T10 · 拉一次 Frankfurter（USD base）实时快照，刷新离线兜底文件
// apps/web/src/lib/static-fx.json。
//
// 口径（CONVENTIONS §币种口径）：
//   - source 固定 'static-snapshot'（构建期/离线兜底，参与假设清单展示）；
//   - date / version 用抓取当天；
//   - base 恒 USD（Catalog 以 USD 建模；convert 为比率换算，任意 base 都对）。
//
// 网络不通时脚本以非零码退出，保留现有文件——由调用方在汇报中说明。
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'apps', 'web', 'src', 'lib', 'static-fx.json');

const SYMBOLS = ['EUR', 'GBP', 'JPY', 'CNY', 'HKD'];
const url = `https://api.frankfurter.dev/v1/latest?from=USD&symbols=${SYMBOLS.join(',')}`;

const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
  now.getDate(),
).padStart(2, '0')}`;

const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Frankfurter HTTP ${res.status} — 保留现有 static-fx.json`);
}
const raw = await res.json();

const rates = { USD: 1 };
for (const c of SYMBOLS) {
  const v = raw.rates?.[c];
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`Frankfurter 缺 ${c} 汇率，保留现有 static-fx.json`);
  }
  rates[c] = v;
}

const snapshot = {
  base: 'USD',
  rates,
  date,
  source: 'static-snapshot',
  version: date,
};

writeFileSync(outFile, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`✓ wrote ${outFile}`);
console.log(JSON.stringify(snapshot, null, 2));
