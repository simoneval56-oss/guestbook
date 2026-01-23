-- Enable extensions
create extension if not exists "pgcrypto";

-- Users table mirrors auth.users with business fields
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  subscription_status text default 'trial',
  plan_type text default 'starter',
  created_at timestamptz default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  address text,
  main_image_url text,
  short_description text,
  created_at timestamptz default now()
);

create table if not exists public.homebooks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  layout_type text not null,
  public_slug text not null unique,
  is_published boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  homebook_id uuid not null references public.homebooks(id) on delete cascade,
  title text not null,
  order_index int not null default 1,
  created_at timestamptz default now()
);

create table if not exists public.subsections (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  content_text text not null,
  created_at timestamptz default now()
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references public.sections(id) on delete cascade,
  subsection_id uuid references public.subsections(id) on delete cascade,
  url text not null,
  type text not null,
  created_at timestamptz default now()
);

alter table public.users enable row level security;
alter table public.properties enable row level security;
alter table public.homebooks enable row level security;
alter table public.sections enable row level security;
alter table public.subsections enable row level security;
alter table public.media enable row level security;

-- Users policies: each user manages their row
create policy "users_read_own" on public.users
  for select using (auth.uid() = id);
create policy "users_insert_self" on public.users
  for insert with check (auth.uid() = id);
create policy "users_update_self" on public.users
  for update using (auth.uid() = id);

-- Properties policies
create policy "properties_read_own" on public.properties
  for select using (user_id = auth.uid());
create policy "properties_insert_own" on public.properties
  for insert with check (user_id = auth.uid());
create policy "properties_update_own" on public.properties
  for update using (user_id = auth.uid());
create policy "properties_delete_own" on public.properties
  for delete using (user_id = auth.uid());

-- Homebooks policies
create policy "homebooks_read_own" on public.homebooks
  for select using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.user_id = auth.uid()
    )
  );
create policy "homebooks_insert_own" on public.homebooks
  for insert with check (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.user_id = auth.uid()
    )
  );
create policy "homebooks_update_own" on public.homebooks
  for update using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.user_id = auth.uid()
    )
  );
create policy "homebooks_delete_own" on public.homebooks
  for delete using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.user_id = auth.uid()
    )
  );
-- Public view by slug when published
create policy "homebooks_public_view" on public.homebooks
  for select using (is_published = true);

-- Sections
create policy "sections_owner_access" on public.sections
  for all using (
    exists (
      select 1 from public.homebooks h
      join public.properties p on p.id = h.property_id
      where h.id = homebook_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.homebooks h
      join public.properties p on p.id = h.property_id
      where h.id = homebook_id and p.user_id = auth.uid()
    )
  );
create policy "sections_public_view" on public.sections
  for select using (
    exists (
      select 1 from public.homebooks h
      where h.id = homebook_id and h.is_published = true
    )
  );

-- Subsections
create policy "subsections_owner_access" on public.subsections
  for all using (
    exists (
      select 1 from public.sections s
      join public.homebooks h on h.id = s.homebook_id
      join public.properties p on p.id = h.property_id
      where s.id = section_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.sections s
      join public.homebooks h on h.id = s.homebook_id
      join public.properties p on p.id = h.property_id
      where s.id = section_id and p.user_id = auth.uid()
    )
  );
create policy "subsections_public_view" on public.subsections
  for select using (
    exists (
      select 1 from public.sections s
      join public.homebooks h on h.id = s.homebook_id
      where s.id = section_id and h.is_published = true
    )
  );

-- Media
create policy "media_owner_access" on public.media
  for all using (
    exists (
      select 1 from public.sections s
      join public.homebooks h on h.id = s.homebook_id
      join public.properties p on p.id = h.property_id
      where (media.section_id = s.id or media.subsection_id in (select id from public.subsections ss where ss.section_id = s.id))
        and p.user_id = auth.uid()
    )
  );
create policy "media_public_view" on public.media
  for select using (
    exists (
      select 1 from public.sections s
      join public.homebooks h on h.id = s.homebook_id
      where (media.section_id = s.id or media.subsection_id in (select id from public.subsections ss where ss.section_id = s.id))
        and h.is_published = true
    )
  );
