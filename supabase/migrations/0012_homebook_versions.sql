create table if not exists public.homebook_versions (
  id uuid primary key default gen_random_uuid(),
  homebook_id uuid not null references public.homebooks(id) on delete cascade,
  version_no integer not null,
  snapshot jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (homebook_id, version_no)
);

create index if not exists homebook_versions_homebook_created_idx
  on public.homebook_versions (homebook_id, created_at desc);
