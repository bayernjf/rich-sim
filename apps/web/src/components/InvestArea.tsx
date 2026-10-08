/**
 * P3 投资线 · 起始金按资产类别分配（`/app/sim` 页内客户端岛，不新增路由）。
 *
 * 红线（homepage-claim-experience.md §5）在这一个组件里的落点：
 * - 只有五个资产类别，没有任何标的 / 基金名 / 代码；
 * - 没有"推荐配置"按钮——权重与收益率全部用户自填；
 * - 收益率缺失按 0% 推演并显式标注「你假设 x%」；
 * - 只读写 `rich-sim:sim:v1` 的可选 `invest` 字段，与 REAL 账零耦合。
 *
 * 与 ClaimRunway 同一模式：SSR 首帧返回 null，挂载后读本机账本；
 * 没领过起始金的人看不到这块（没有可分配的钱）。
 */
import { useEffect, useMemo, useState } from 'react';
import Interpolated from './Interpolated';
import {
  ASSET_CLASSES,
  type AssetClass,
  emptyAllocation,
  isComplete,
  monteCarloRows,
  projectAllocation,
  weightTotal,
  type InvestAllocation,
} from '../lib/sim-invest';
import { readInvest, readSimState, saveInvest } from '../lib/sim-draft';
import { format, t } from '../lib/messages';
import type { Locale } from '../lib/i18n';
import { track } from '../lib/analytics';

type Props = { locale?: Locale };

const PROJ_YEARS = [1, 5, 10];
const MC_PATHS = 300;

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export default function InvestArea({ locale = 'zh' }: Props) {
  const [capital, setCapital] = useState<number | null>(null);
  const [alloc, setAlloc] = useState<InvestAllocation>(emptyAllocation());
  const [seed, setSeed] = useState(42);

  useEffect(() => {
    const sim = readSimState();
    if (!sim) return;
    setCapital(sim.startingCapital);
    const saved = readInvest();
    if (saved) setAlloc(saved);
  }, []);

  const total = useMemo(() => weightTotal(alloc.weights), [alloc]);
  const complete = isComplete(alloc.weights);
  const over = total > 100.01;
  const rows = useMemo(
    () => (capital === null || over ? [] : projectAllocation(capital, alloc, PROJ_YEARS)),
    [capital, alloc, over],
  );
  const hasVol = useMemo(
    () => ASSET_CLASSES.some((cls) => alloc.weights[cls] > 0 && (alloc.volatility[cls] ?? 0) > 0),
    [alloc],
  );
  const mcRows = useMemo(
    () => (capital === null || over || !hasVol ? [] : monteCarloRows(capital, alloc, PROJ_YEARS, MC_PATHS, seed)),
    [capital, alloc, over, hasVol, seed],
  );

  if (capital === null) return null;

  const update = (next: InvestAllocation) => {
    setAlloc(next);
    saveInvest(next);
  };

  const setWeight = (cls: AssetClass, raw: string) => {
    const value = Number.parseFloat(raw);
    update({ ...alloc, weights: { ...alloc.weights, [cls]: Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0 } });
  };

  const setVolatility = (cls: AssetClass, raw: string) => {
    if (raw.trim() === '') {
      update({ ...alloc, volatility: { ...alloc.volatility, [cls]: null } });
      return;
    }
    const value = Number.parseFloat(raw);
    update({
      ...alloc,
      volatility: { ...alloc.volatility, [cls]: Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : alloc.volatility[cls] },
    });
  };

  const setReturn = (cls: AssetClass, raw: string) => {
    if (raw.trim() === '') {
      update({ ...alloc, returns: { ...alloc.returns, [cls]: null } });
      return;
    }
    const value = Number.parseFloat(raw);
    update({
      ...alloc,
      returns: { ...alloc.returns, [cls]: Number.isFinite(value) ? Math.min(100, Math.max(-100, value)) : alloc.returns[cls] },
    });
  };

  return (
    <section aria-labelledby="invest-heading" data-invest-area className="mt-8">
      <h2 id="invest-heading" className="text-base font-semibold text-ink">{t('invest.title', locale)}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{t('invest.intro', locale)}</p>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="px-4 py-2 font-medium"></th>
              <th scope="col" className="px-4 py-2 font-medium">{t('invest.weight', locale)}</th>
              <th scope="col" className="px-4 py-2 font-medium">{t('invest.return', locale)}</th>
              <th scope="col" className="px-4 py-2 font-medium">{t('invest.vol', locale)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ASSET_CLASSES.map((cls) => (
              <tr key={cls}>
                <th scope="row" className="px-4 py-2 text-left font-medium text-ink">
                  {t(`invest.cls.${cls}`, locale)}
                </th>
                <td className="px-4 py-2">
                  <input
                    type="number" min={0} max={100} step={1} inputMode="decimal"
                    aria-label={`${t(`invest.cls.${cls}`, locale)} ${t('invest.weight', locale)}`}
                    value={alloc.weights[cls]}
                    onChange={(e) => setWeight(cls, e.target.value)}
                    className="w-20 rounded-md border border-line bg-panel px-2 py-1 font-mono tabular-nums text-ink"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number" min={-100} max={100} step={0.5} inputMode="decimal"
                    aria-label={`${t(`invest.cls.${cls}`, locale)} ${t('invest.return', locale)}`}
                    placeholder={t('invest.unfilled', locale)}
                    value={alloc.returns[cls] ?? ''}
                    onChange={(e) => setReturn(cls, e.target.value)}
                    onBlur={() => track('invest:edit')}
                    className="w-28 rounded-md border border-line bg-panel px-2 py-1 font-mono tabular-nums text-ink placeholder:text-xs placeholder:text-muted/70"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number" min={0} max={100} step={1} inputMode="decimal"
                    aria-label={`${t(`invest.cls.${cls}`, locale)} ${t('invest.vol', locale)}`}
                    placeholder={t('invest.volBlank', locale)}
                    value={alloc.volatility[cls] ?? ''}
                    onChange={(e) => setVolatility(cls, e.target.value)}
                    className="w-24 rounded-md border border-line bg-panel px-2 py-1 font-mono tabular-nums text-ink placeholder:text-xs placeholder:text-muted/70"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p
          data-invest-total
          className={`border-t border-line px-4 py-2 text-xs ${over ? 'text-danger' : complete ? 'text-muted' : 'text-ink'}`}
        >
          <Interpolated template={t('invest.total', locale)} vars={{ total: String(Math.round(total * 100) / 100) }} className="font-mono tabular-nums" />
          {!complete && !over && (
            <Interpolated
              template={t('invest.incomplete', locale)}
              vars={{ rest: String(Math.round((100 - total) * 100) / 100) }}
              className="ml-2 font-mono tabular-nums"
            />
          )}
          {over && <span className="ml-2">{t('invest.over', locale)}</span>}
        </p>
      </div>

      {!over && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink">{t('invest.projH', locale)}</h3>
          <dl className="mt-2 flex flex-wrap gap-3">
            {rows.map((row) => (
              <div key={row.years} className="rounded-xl border border-line bg-panel px-4 py-3">
                <dt className="text-xs text-muted">{format(t('invest.projYears', locale), { years: String(row.years) })}</dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">{money(row.total)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {!over && hasVol && (
        <div className="mt-4" data-invest-mc>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{t('invest.mcH', locale)}</h3>
            <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{t('invest.mcBadge', locale)}</span>
            <button
              type="button"
              onClick={() => { setSeed((v) => v + 1); track('invest:resample'); }}
              className="ml-auto inline-flex min-h-11 items-center rounded-full border border-line-strong px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-panel-2"
            >
              {t('invest.mcResample', locale)}
            </button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {format(t('invest.mcLead', locale), { paths: String(MC_PATHS) })}
          </p>
          <dl className="mt-2 flex flex-wrap gap-3">
            {mcRows.map((row) => (
              <div key={row.years} className="rounded-xl border border-line bg-panel px-4 py-3">
                <dt className="text-xs text-muted">{format(t('invest.projYears', locale), { years: String(row.years) })}</dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">{money(row.median)}</dd>
                <dd className="mt-0.5 font-mono text-xs tabular-nums text-muted">
                  {money(row.p10)} – {money(row.p90)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <ul className="mt-3 space-y-0.5 text-xs text-muted">
        {ASSET_CLASSES.filter((cls) => alloc.weights[cls] > 0).map((cls) => (
          <li key={cls}>
            {alloc.returns[cls] === null
              ? t('invest.assumptionZero', locale).replace('{cls}', t(`invest.cls.${cls}`, locale))
              : format(t('invest.assumption', locale), { cls: t(`invest.cls.${cls}`, locale), pct: String(alloc.returns[cls]) })}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-muted">{t('invest.disclaimer', locale)}</p>
    </section>
  );
}
