-- DebtTracker SaaS schema (normalized)
-- Run in Supabase SQL editor after validating in staging.

create extension if not exists pgcrypto;

-- debts: uses text PK to accommodate app-defined IDs (e.g. 'sloan', 'debt-1234567890')
create table if not exists public.debts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bank text,
  total_balance numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  monthly_payment numeric(12,2) not null default 0,
  interest_rate numeric(6,4) not null default 0,
  months_remaining integer not null default 0,
  due_day integer check (due_day between 1 and 31),
  status text not null default 'ongoing' check (status in ('ongoing','paid','heavy')),
  min_due numeric(12,2) default 0,
  finance_charge numeric(12,2) default 0,
  min_due_rate numeric(6,4) default 0.03,
  fixed_installment boolean default false,
  creditor_contacts jsonb,
  actual_paid numeric(12,2) default 0,
  payment_history jsonb default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  debt_id text not null references public.debts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  date date not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bi_monthly_salary numeric(12,2) not null default 0,
  monthly_budget_override numeric(12,2),
  manual_extra numeric(12,2) default 0,
  notification_enabled boolean not null default false,
  email text,
  strategy text not null default 'cashflow' check (strategy in ('cashflow','snowball','interest')),
  interest_boost boolean not null default true,
  projected_income jsonb default '[]',
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  due_date date not null,
  fingerprint text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, due_date, fingerprint)
);

create index if not exists idx_debts_user_id on public.debts(user_id);
create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_debt_id on public.payments(debt_id);
create index if not exists idx_notifications_user_date on public.notifications_log(user_id, due_date);

alter table public.debts enable row level security;
alter table public.payments enable row level security;
alter table public.settings enable row level security;
alter table public.notifications_log enable row level security;

-- debts policies
do $$ begin
  if not exists (select 1 from pg_policies where tablename='debts' and policyname='debts_select_own') then
    create policy "debts_select_own" on public.debts for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='debts' and policyname='debts_insert_own') then
    create policy "debts_insert_own" on public.debts for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='debts' and policyname='debts_update_own') then
    create policy "debts_update_own" on public.debts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='debts' and policyname='debts_delete_own') then
    create policy "debts_delete_own" on public.debts for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- payments policies
do $$ begin
  if not exists (select 1 from pg_policies where tablename='payments' and policyname='payments_select_own') then
    create policy "payments_select_own" on public.payments for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='payments' and policyname='payments_insert_own') then
    create policy "payments_insert_own" on public.payments for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='payments' and policyname='payments_update_own') then
    create policy "payments_update_own" on public.payments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='payments' and policyname='payments_delete_own') then
    create policy "payments_delete_own" on public.payments for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- settings policies
do $$ begin
  if not exists (select 1 from pg_policies where tablename='settings' and policyname='settings_select_own') then
    create policy "settings_select_own" on public.settings for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='settings' and policyname='settings_insert_own') then
    create policy "settings_insert_own" on public.settings for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='settings' and policyname='settings_update_own') then
    create policy "settings_update_own" on public.settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='settings' and policyname='settings_delete_own') then
    create policy "settings_delete_own" on public.settings for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- notifications policies
do $$ begin
  if not exists (select 1 from pg_policies where tablename='notifications_log' and policyname='notifications_select_own') then
    create policy "notifications_select_own" on public.notifications_log for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='notifications_log' and policyname='notifications_insert_own') then
    create policy "notifications_insert_own" on public.notifications_log for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='notifications_log' and policyname='notifications_update_own') then
    create policy "notifications_update_own" on public.notifications_log for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='notifications_log' and policyname='notifications_delete_own') then
    create policy "notifications_delete_own" on public.notifications_log for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;
