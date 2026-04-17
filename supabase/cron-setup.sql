-- Run this in Supabase SQL Editor (Project → SQL Editor → New Query)
-- This schedules the email-reminders edge function daily at 8:00 AM Philippine Time (00:00 UTC)

-- 1. Enable required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Create the cron job
-- Replace YOUR_PROJECT_REF with your Supabase project ref (e.g. comdmxcwjxlwnbhhypbq)
-- Replace YOUR_ANON_KEY with your Supabase anon key
select cron.schedule(
  'daily-email-reminders',           -- job name
  '0 0 * * *',                       -- every day at 00:00 UTC = 8:00 AM PHT
  $$
  select net.http_post(
    url    := 'https://comdmxcwjxlwnbhhypbq.supabase.co/functions/v1/email-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_7aaULoi_q32bPkQw5HnJ4g_4F8Gm-mN"}'::jsonb,
    body   := '{}'::jsonb
  );
  $$
);

-- 3. Verify the job was created
select * from cron.job where jobname = 'daily-email-reminders';

-- To remove the job later:
-- select cron.unschedule('daily-email-reminders');
