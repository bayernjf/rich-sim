import { useEffect } from 'react';
import { track } from '../lib/analytics';

/**
 * G1 · 玩法说明页视图埋点。
 *
 * - `guide:view` **零 props**（与 converter:view 同一纪律，只报「看过」，不带任何
 *   用户数据）；SSR 首帧 return null，不渲染任何内容（与 sim 页首帧岛纪律一致）。
 */
export default function GuideView() {
  useEffect(() => {
    track('guide:view');
  }, []);
  return null;
}
