create or replace function public.can_view_property(property_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.homebooks h
    where h.property_id = can_view_property.property_id
      and h.is_published = true
      and h.public_access_enabled = true
      and h.public_access_token = public.request_homebook_token()
  );
$$;

drop policy if exists "properties_public_view" on public.properties;
create policy "properties_public_view" on public.properties
  for select using (public.can_view_property(id));
