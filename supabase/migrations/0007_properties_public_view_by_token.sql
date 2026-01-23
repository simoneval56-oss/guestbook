drop policy if exists "properties_public_view" on public.properties;
create policy "properties_public_view" on public.properties
  for select using (
    exists (
      select 1
      from public.homebooks h
      where h.property_id = properties.id
        and h.is_published = true
        and h.public_access_enabled = true
        and h.public_access_token = public.request_homebook_token()
    )
  );
