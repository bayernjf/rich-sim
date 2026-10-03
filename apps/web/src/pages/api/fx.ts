import type { APIRoute } from 'astro';
import { isSupportedCurrency, resolveSnapshot } from '../../lib/fx';

/**
 * T10 · GET /api/fx?base=USD — 汇率 SSR 代理（薄壳）。
 *
 * 实时优先（Frankfurter），失败/缺币种降级 static-fx.json。
 * base 不在 6 币种内 → 400；其余情况恒 200 且返回合法 FxSnapshot。
 * 逻辑全在 lib/fx.ts（可测），这里只做参数校验 + JSON 响应。
 */
export const GET: APIRoute = async ({ url }) => {
  const base = url.searchParams.get('base') ?? 'USD';

  if (!isSupportedCurrency(base)) {
    return Response.json(
      { error: `Unsupported base currency: ${base}` },
      { status: 400 },
    );
  }

  const snapshot = await resolveSnapshot(base);
  return Response.json(snapshot, {
    status: 200,
    headers: {
      // 代理的是假设数据，按会话级缓存即可；降级快照日期进假设清单。
      'cache-control': 'public, max-age=3600',
    },
  });
};
