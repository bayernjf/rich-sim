import { CORE_VERSION } from '@rich-sim/core';

/**
 * Designer shell — temporary placeholder (T06 is implemented in Wave 1 by
 * Agent C against this mount point).
 */
export default function DesignerShell() {
  return (
    <section>
      <p className="text-xs font-medium uppercase tracking-widest text-accent">设计器</p>
      <h2 className="mt-2 text-2xl font-semibold">理想生活设计器</h2>
      <p className="mt-2 text-sm text-muted">
        此页将在 Wave 1 实现：7 维度可点选 + 年成本实时预览 + 本地保存。
      </p>
      <p className="mt-4 text-xs text-muted">core {CORE_VERSION}</p>
    </section>
  );
}
