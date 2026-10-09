import type { APIRoute } from 'astro';
import { isSupportedCurrency, resolveSnapshot } from '../../lib/fx';

/**
 * T10 · GET /api/fx?base=USD[&date=YYYY-MM-DD] — 汇率 SSR 代理（薄壳）。
 *
 * 实时优先（Frankfurter），失败/缺币种降级 static-fx.json。
 * date 存在时打 Frankfurter 历史端点（T3 汇率时间机）；非法日期 → 400。
 * base 不在 6 币种内 → 400；其余情况恒 200 且返回合法 FxSnapshot。
 * 逻辑全在 lib/fx.ts（可测），这里只做参数校验 + JSON 响应。
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url }) => {
  const base = url.searchParams.get('base') ?? 'USD';

  if (!isSupportedCurrency(base)) {
    return Response.json(
      { error: `Unsupported base currency: ${base}` },
      { status: 400 },
    );
  }

  const date = url.searchParams.get('date') ?? undefined;
  if (date !== undefined && !ISO_DATE.test(date)) {
    return Response.json(
      { error: `Invalid date: ${date} (expected YYYY-MM-DD)` },
      { status: 400 },
    );
  }

  const snapshot = await resolveSnapshot(base, date);
  return Response.json(snapshot, {
    status: 200,
    headers: {
      // 代理的是假设数据，按会话级缓存即可；降级快照日期进假设清单。
      'cache-control': 'public, max-age=3600',
    },
  });
};
