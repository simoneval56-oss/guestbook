-- Add visibility flags for sections and subsections.
alter table public.sections
  add column if not exists visible boolean default true;

alter table public.subsections
  add column if not exists visible boolean default true;

-- Backfill existing rows in case the column was added after data creation.
update public.sections set visible = true where visible is null;
update public.subsections set visible = true where visible is null;
