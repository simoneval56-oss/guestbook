create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

alter table public.homebooks
  add column if not exists public_access_token text,
  add column if not exists public_access_enabled boolean default true;

update public.homebooks
set public_access_token = replace(extensions.gen_random_uuid()::text, '-', '')
where public_access_token is null;

update public.homebooks
set public_access_enabled = true
where public_access_enabled is null;

alter table public.homebooks
  alter column public_access_token set default replace(extensions.gen_random_uuid()::text, '-', ''),
  alter column public_access_token set not null;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public' and indexname = 'homebooks_public_access_token_key'
  ) then
    create unique index homebooks_public_access_token_key on public.homebooks (public_access_token);
  end if;
end $$;

create or replace function public.request_homebook_token()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-homebook-token', '')
$$;

drop policy if exists "homebooks_public_view" on public.homebooks;
create policy "homebooks_public_view" on public.homebooks
  for select using (
    is_published = true
    and public_access_enabled = true
    and public_access_token = public.request_homebook_token()
  );

drop policy if exists "sections_public_view" on public.sections;
create policy "sections_public_view" on public.sections
  for select using (
    exists (
      select 1 from public.homebooks h
      where h.id = homebook_id
        and h.is_published = true
        and h.public_access_enabled = true
        and h.public_access_token = public.request_homebook_token()
    )
  );

drop policy if exists "subsections_public_view" on public.subsections;
create policy "subsections_public_view" on public.subsections
  for select using (
    exists (
      select 1 from public.sections s
      join public.homebooks h on h.id = s.homebook_id
      where s.id = section_id
        and h.is_published = true
        and h.public_access_enabled = true
        and h.public_access_token = public.request_homebook_token()
    )
  );

drop policy if exists "media_public_view" on public.media;
create policy "media_public_view" on public.media
  for select using (
    exists (
      select 1 from public.sections s
      join public.homebooks h on h.id = s.homebook_id
      where (media.section_id = s.id or media.subsection_id in (select id from public.subsections ss where ss.section_id = s.id))
        and h.is_published = true
        and h.public_access_enabled = true
        and h.public_access_token = public.request_homebook_token()
    )
  );
