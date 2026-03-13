alter table public.users
  add column if not exists terms_version text,
  add column if not exists privacy_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists legal_acceptance_source text;
