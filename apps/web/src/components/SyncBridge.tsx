/**
 * M5 S2/S3 · 草稿云端同步桥（不可见岛，随 AuthButton 挂载）。
 *
 * 两本账同构同步（kind='plan' REAL / kind='sim' SIM），互不读写对方：
 * - **登录/冷启动对时**：各账按 decideSync 拉或推一次（sync.ts 头注释的规则；
 *   SIM 的对时戳用 updatedAt，旧状态兜底 claimedAt）。
 * - **本机写入后防抖上行**：订阅两账的更新事件，2s 防抖后各推各的——
 *   写方（设计器/财务/购物区）都不用知道云的存在。
 *
 * 渲染 null：没有任何 UI，未配置 Supabase / 未登录时连网络请求都不发。
 * 事件 sync:push / sync:pull 只带 kind，不带任何内容（草稿不出埋点）。
 */
import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { DRAFT_UPDATED_EVENT, readDraft, writeDraft, type Draft } from '../lib/draft';
import { SIM_UPDATED_EVENT, readSimState, type SimState } from '../lib/sim-draft';
import { decideSync, pullLedger, pushLedger, type LedgerKind } from '../lib/sync';
import { track } from '../lib/analytics';

const DEBOUNCE_MS = 2000;

/** SIM 账的对时戳：updatedAt 优先，旧状态兜底 claimedAt。 */
function simTimestamp(state: SimState): string {
  return state.updatedAt ?? state.claimedAt;
}

/** 把云端拉下来的 SIM 写回本机（绕过 sim-draft 的写函数会跳过事件，这里手动补发）。 */
function writeSimPulled(payload: SimState): void {
  try {
    localStorage.setItem('rich-sim:sim:v1', JSON.stringify(payload));
    window.dispatchEvent(new Event(SIM_UPDATED_EVENT));
  } catch {
    // 本机写入失败（隐私模式/配额）：同步降级为只推不拉。
  }
}

async function reconcileKind(supabase: SupabaseClient, userId: string, kind: LedgerKind): Promise<void> {
  const cloud = await pullLedger(supabase, userId, kind);
  if (kind === 'plan') {
    const local = readDraft();
    switch (decideSync({ signedIn: true, local, cloud })) {
      case 'pull':
        if (cloud) {
          writeDraft(cloud.payload as Draft);
          track('sync:pull', { kind });
        }
        break;
      case 'push':
        if (local && (await pushLedger(supabase, userId, kind, local, local.updatedAt)))
          track('sync:push', { kind });
        break;
      default:
        break;
    }
    return;
  }
  const local = readSimState();
  const localStamp = local ? { updatedAt: simTimestamp(local) } : null;
  switch (decideSync({ signedIn: true, local: localStamp, cloud })) {
    case 'pull':
      if (cloud) {
        writeSimPulled(cloud.payload as SimState);
        track('sync:pull', { kind });
      }
      break;
    case 'push':
      if (local && (await pushLedger(supabase, userId, kind, local, simTimestamp(local))))
        track('sync:push', { kind });
      break;
    default:
      break;
  }
}

export default function SyncBridge() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const reconcile = async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return;
      await reconcileKind(supabase, userId, 'plan');
      await reconcileKind(supabase, userId, 'sim');
    };
    void reconcile();

    const pushLater = (kind: LedgerKind) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId) return;
        if (kind === 'plan') {
          const local = readDraft();
          if (local && (await pushLedger(supabase, userId, 'plan', local, local.updatedAt)))
            track('sync:push', { kind });
        } else {
          const local = readSimState();
          if (local && (await pushLedger(supabase, userId, 'sim', local, simTimestamp(local))))
            track('sync:push', { kind });
        }
      }, DEBOUNCE_MS);
    };
    const onPlanWrite = () => pushLater('plan');
    const onSimWrite = () => pushLater('sim');
    window.addEventListener(DRAFT_UPDATED_EVENT, onPlanWrite);
    window.addEventListener(SIM_UPDATED_EVENT, onSimWrite);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void reconcile();
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener(DRAFT_UPDATED_EVENT, onPlanWrite);
      window.removeEventListener(SIM_UPDATED_EVENT, onSimWrite);
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
