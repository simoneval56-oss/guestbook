alter table public.users
  add column if not exists billing_override text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_billing_override_check'
  ) then
    alter table public.users
      add constraint users_billing_override_check
      check (billing_override is null or billing_override in ('friend_free'));
  end if;
end
$$;
