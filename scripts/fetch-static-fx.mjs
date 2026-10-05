#!/usr/bin/env node
// T10 · 拉一次 Frankfurter（USD base）实时快照，刷新离线兜底文件
// apps/web/src/lib/static-fx.json。
//
// 口径（CONVENTIONS §币种口径）：
//   - source 固定 'static-snapshot'（构建期/离线兜底，参与假设清单展示）；
//   - date / version 用上游返回的 ECB 定价日，不是抓取当天；
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

const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Frankfurter HTTP ${res.status} — 保留现有 static-fx.json`);
}
const raw = await res.json();

// The date shown to users must be the ECB fixing date, not the day we fetched.
// ECB only publishes on weekdays, so "today" would routinely be 1-3 days newer
// than the rates - and CONVENTIONS §币种口径 requires the assumption list to
// carry the rate's own date.
if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
  throw new Error(`Frankfurter 未返回合法 date（${JSON.stringify(raw.date)}）— 保留现有 static-fx.json`);
}
const date = raw.date;

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
