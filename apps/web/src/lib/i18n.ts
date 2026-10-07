/**
 * i18n 切片 · 界面语言的解析与持久化。
 *
 * 三条约束决定了这里的设计：
 * 1. **SSR 必须读得到**：假设清单与免责声明要服务端渲染（CONVENTIONS §红线），
 *    语言在 SSR 阶段就得生效，所以偏好存 **Cookie** 而不是 localStorage——
 *    localStorage 进不了请求，`<html lang>` 与合规文案只能先渲染中文再由 JS 改写，
 *    那是闪烁也是不达标。顺带也避开「新增 localStorage key」这道冻结闸门。
 * 2. 优先级：URL 参数 > Cookie > Accept-Language > 默认 `en`
 *    （目标市场先海外，见 technical-design §9；`?lang=` 让冒烟和分享链接可固定语言）。
 * 3. **目录内容的英文名不在这里**，在 core 的 `CATALOG_LABELS_EN`——内容数值与
 *    UI 文案各归一处，别把 23 个档位名塞进 UI 词典。
 */

export type Locale = 'zh' | 'en';

export const LOCALE_COOKIE = 'rich-sim-locale';
const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const isLocale = (value: unknown): value is Locale => value === 'zh' || value === 'en';

/** 自己解析 Cookie，不用 js-cookie 之类依赖（core 零依赖纪律同样适用于 web 侧）。 */
export function parseCookie(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Accept-Language 中第一个能识别的语言；只有 zh* 才回中文。 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (tag.startsWith('zh')) return 'zh';
    if (tag.startsWith('en')) return 'en';
  }
  return null;
}

/** 纯函数：把三个来源的优先级排一遍。默认 en。 */
export function resolveLocale(input: {
  searchParam?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
  defaultLocale?: Locale;
}): Locale {
  if (isLocale(input.searchParam)) return input.searchParam;
  if (isLocale(input.cookie)) return input.cookie;
  const fromHeader = localeFromAcceptLanguage(input.acceptLanguage);
  if (fromHeader) return fromHeader;
  return input.defaultLocale ?? 'en';
}

/** SSR 侧唯一入口：页面不要把三段解析各写一遍，否则优先级迟早写歪。 */
export function localeFromRequest(request: Request, url: URL): Locale {
  return resolveLocale({
    searchParam: url.searchParams.get('lang'),
    cookie: parseCookie(request.headers.get('cookie'), LOCALE_COOKIE),
    acceptLanguage: request.headers.get('accept-language'),
  });
}

/** 客户端写偏好；SameSite=Lax 对本用途足够（只在本域导航带回，不涉及第三方）。 */
export function setLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${LOCALE_COOKIE}=${locale};path=/;max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS};samesite=Lax`;
}

/** `<html lang>` 用 BCP 47，不是内部枚举值。 */
export const HTML_LANG: Record<Locale, string> = { zh: 'zh-CN', en: 'en' };
