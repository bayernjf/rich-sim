-- plans 表（M5 云端同步）结构与 RLS 策略的追溯快照，2026-11-03 入库。
--
-- 背景（评审 2026-11-02 P2）：该表此前只在 Supabase dashboard 手工建立，
-- 仓库里没有任何版本控制——越权防护（RLS）无法从代码评审验证、无审计轨迹、
-- dashboard 误改无人感知。本迁移按 apps/web/src/lib/sync.ts 的实际用法推导
-- （upsert onConflict user_id+kind / select payload,updated_at / RLS owner 隔离），
-- 以幂等形式落地为仓库内的权威描述；若与线上漂移，以本文件为准修正线上。
--
-- 两本账同构：kind='plan'（REAL 真实方案）/ kind='sim'（SIM 模拟态），
-- 每用户每 kind 一行；payload 是本机草稿 JSON，云端不理解 schema。

create table if not exists public.plans (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('plan', 'sim')),
  payload jsonb not null,
  updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.plans enable row level security;

-- RLS：anon key 只能读写 auth.uid() = user_id 的行；service key 不出现在客户端。
-- drop + create 保证本迁移可重复执行（postgres 无 create policy if not exists）。
drop policy if exists plans_select_own on public.plans;
create policy plans_select_own on public.plans
  for select using (auth.uid() = user_id);

drop policy if exists plans_insert_own on public.plans;
create policy plans_insert_own on public.plans
  for insert with check (auth.uid() = user_id);

drop policy if exists plans_update_own on public.plans;
create policy plans_update_own on public.plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists plans_delete_own on public.plans;
create policy plans_delete_own on public.plans
  for delete using (auth.uid() = user_id);
