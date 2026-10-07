import { Fragment, type ReactNode } from 'react';

/**
 * 把文案里的 `{name}` 占位符换成带等宽样式的节点。
 *
 * 存在的理由有两个：
 * 1. 语序。为了让数字保持 `font-mono tabular-nums`（CONVENTIONS 的金额呈现约定）
 *    而把句子拆成「前缀 + 数字 + 后缀」三段文案，英文就得照中文语序写——那样
 *    译文是假的。占位符让每种语言自己决定数字放在哪。
 * 2. 未知占位符**原样留着**而不是吞掉：漏传一个变量时页面上会看见 `{amount}`，
 *    这比静默少一个数字好查得多。
 */
export default function Interpolated({
  template,
  vars,
  className = 'font-mono tabular-nums text-ink',
  dataAttr,
}: {
  template: string;
  vars: Record<string, string | number>;
  className?: string;
  /**
   * 变量名 → data 属性名。句子翻成另一种语言时数字的位置会变，所以「给某个数字
   * 挂一个稳定钩子」不能靠写死的 JSX 结构——冒烟就靠这两个钩子读购物车。
   */
  dataAttr?: Record<string, string>;
}) {
  const parts: ReactNode[] = [];
  template.split(/(\{\w+\})/g).forEach((chunk, index) => {
    const name = /^\{(\w+)\}$/.exec(chunk)?.[1];
    if (!name) {
      if (chunk) parts.push(<Fragment key={index}>{chunk}</Fragment>);
      return;
    }
    const hook = dataAttr?.[name];
    parts.push(
      <span
        key={index}
        className={className}
        {...(hook ? { [hook]: '' } : {})}
      >
        {name in vars ? vars[name] : chunk}
      </span>,
    );
  });
  return <>{parts}</>;
}
