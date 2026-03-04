alter table public.users
  add column if not exists trial_ends_at timestamptz,
  add column if not exists subscription_ends_at timestamptz;

alter table public.users
  alter column trial_ends_at set default (now() + interval '7 days');

update public.users
set trial_ends_at = coalesce(trial_ends_at, created_at + interval '7 days')
where coalesce(lower(subscription_status), 'trial') = 'trial';

update public.users
set plan_type = 'starter'
where plan_type is null or btrim(plan_type) = '';
