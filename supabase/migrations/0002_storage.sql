-- Bucket for host uploads (cover + media)
insert into storage.buckets (id, name, public)
values ('homebook-media', 'homebook-media', true)
on conflict (id) do nothing;

-- Public read (covers/media pubblici)
create policy "Public read homebook-media"
on storage.objects
for select
using (bucket_id = 'homebook-media');

-- Authenticated can upload/update/delete own media (service role bypasses RLS)
create policy "Auth upload homebook-media"
on storage.objects
for insert
with check (bucket_id = 'homebook-media' and auth.role() = 'authenticated');

create policy "Auth update homebook-media"
on storage.objects
for update
using (bucket_id = 'homebook-media' and auth.role() = 'authenticated');

create policy "Auth delete homebook-media"
on storage.objects
for delete
using (bucket_id = 'homebook-media' and auth.role() = 'authenticated');
