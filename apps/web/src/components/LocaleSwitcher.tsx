import { setLocaleCookie, type Locale } from '../lib/i18n';
import { track } from '../lib/analytics';
import { t } from '../lib/messages';

const OPTIONS: { value: Locale; text: string }[] = [
  { value: 'zh', text: '中文' },
  { value: 'en', text: 'English' },
];

/**
 * M4-i18n · 语言切换（client:load 岛）。
 *
 * 为什么写 Cookie 然后刷新，而不是在客户端就地改写文案：语言决定 `<html lang>`
 * 和**合规文本**（假设清单、免责声明是纯 SSR 的红线要求），客户端改写会先渲染
 * 一种语言再跳成另一种，还让「关掉 JS 也要看得见免责声明」这条打折。
 * 刷新保留 ?lang 之外的查询参数没有意义，所以切语言时把 `lang` 去掉——
 * 否则 URL 参数优先级高于 Cookie，用户会发现切不动。
 */
export default function LocaleSwitcher({ locale }: { locale: Locale }) {
  const pick = (next: Locale) => {
    if (next === locale) return;
    setLocaleCookie(next);
    const url = new URL(window.location.href);
    url.searchParams.delete('lang');
    track('locale:switch', { to: next });
    window.location.assign(url.toString());
  };

  return (
    <div data-locale-switcher className="flex items-center gap-2">
      <span id="locale-label" className="text-xs font-medium text-muted">
        {t('locale.label', locale)}
      </span>
      <div role="group" aria-labelledby="locale-label" className="flex gap-1">
        {OPTIONS.map((option) => {
          const active = option.value === locale;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => pick(option.value)}
              className={[
                'min-h-11 rounded-lg px-3 py-1.5 text-xs transition-colors',
                active
                  ? 'bg-ink text-canvas'
                  : 'border border-line text-muted hover:text-ink',
              ].join(' ')}
            >
              {option.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
