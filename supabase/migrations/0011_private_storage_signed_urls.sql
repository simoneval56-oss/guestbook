-- Make media bucket private and deliver files via signed URLs.
update storage.buckets
set public = false
where id = 'homebook-media';

-- Public object reads are no longer allowed once signed URLs are enforced.
drop policy if exists "Public read homebook-media" on storage.objects;
