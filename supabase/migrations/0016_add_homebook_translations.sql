create table if not exists public.homebook_translations (
  id uuid primary key default gen_random_uuid(),
  homebook_id uuid not null references public.homebooks(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  source_lang text not null default 'it',
  target_lang text not null,
  content_hash text not null,
  payload jsonb not null,
  status text not null default 'ready',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (homebook_id, version_no, target_lang)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'homebook_translations_status_check'
  ) then
    alter table public.homebook_translations
      add constraint homebook_translations_status_check
      check (status in ('ready', 'error'));
  end if;
end
$$;

create index if not exists homebook_translations_lookup_idx
  on public.homebook_translations (homebook_id, target_lang, version_no desc);

alter table public.homebook_translations enable row level security;

drop policy if exists "homebook_translations_owner_access" on public.homebook_translations;
create policy "homebook_translations_owner_access" on public.homebook_translations
for all
using (
  exists (
    select 1
    from public.homebooks h
    join public.properties p on p.id = h.property_id
    where h.id = homebook_translations.homebook_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.homebooks h
    join public.properties p on p.id = h.property_id
    where h.id = homebook_translations.homebook_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "homebook_translations_public_view" on public.homebook_translations;
create policy "homebook_translations_public_view" on public.homebook_translations
for select
using (
  exists (
    select 1
    from public.homebooks h
    where h.id = homebook_translations.homebook_id
      and h.is_published = true
      and h.public_access_enabled = true
      and h.public_access_token = public.request_homebook_token()
  )
);
