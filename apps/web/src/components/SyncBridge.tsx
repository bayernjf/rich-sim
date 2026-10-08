/**
 * M5 S2 · 草稿云端同步桥（不可见岛，随 AuthButton 挂载）。
 *
 * 两条线：
 * - **登录/冷启动对时**：按 decideSync 的结果拉或推一次（sync.ts 头注释的规则）。
 * - **本机写入后防抖上行**：订阅 DRAFT_UPDATED_EVENT，2s 防抖后推——
 *   每个写方（设计器/财务/假设/剧本）都不用知道云的存在。
 *
 * 渲染 null：没有任何 UI，未配置 Supabase / 未登录时连网络请求都不发。
 * 事件 sync:push / sync:pull 零 props（草稿内容不出埋点）。
 */
import { useEffect, useRef } from 'react';
import { getSupabase } from '../lib/supabase';
import { DRAFT_UPDATED_EVENT, readDraft, writeDraft } from '../lib/draft';
import { decideSync, pullDraft, pushDraft } from '../lib/sync';
import { track } from '../lib/analytics';

const DEBOUNCE_MS = 2000;

export default function SyncBridge() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const reconcile = async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return;
      const local = readDraft();
      const cloud = await pullDraft(supabase, userId);
      switch (decideSync({ signedIn: true, local, cloud })) {
        case 'pull':
          if (cloud) {
            writeDraft(cloud.payload);
            track('sync:pull');
          }
          break;
        case 'push':
          if (local && (await pushDraft(supabase, userId, local))) track('sync:push');
          break;
        default:
          break;
      }
    };
    void reconcile();

    const onLocalWrite = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        const local = readDraft();
        if (userId && local && (await pushDraft(supabase, userId, local))) track('sync:push');
      }, DEBOUNCE_MS);
    };
    window.addEventListener(DRAFT_UPDATED_EVENT, onLocalWrite);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void reconcile();
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener(DRAFT_UPDATED_EVENT, onLocalWrite);
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
