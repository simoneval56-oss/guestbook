-- Supabase policy backup
-- Run this script in the SQL editor to re-create the baseline RLS policies.

-- Enable RLS on the relevant tables
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subsections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Service role policies (backend)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'properties'
      AND policyname = 'allow_service_role'
  ) THEN
    CREATE POLICY allow_service_role
      ON public.properties
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'homebooks'
      AND policyname = 'allow_service_role_homebooks'
  ) THEN
    CREATE POLICY allow_service_role_homebooks
      ON public.homebooks
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END$$;

-- Owner policies (per-table)
CREATE POLICY IF NOT EXISTS properties_owner
  ON public.properties
  FOR ALL
  USING (auth.uid() = properties.user_id);

CREATE POLICY IF NOT EXISTS homebooks_owner
  ON public.homebooks
  FOR ALL
  USING (
    auth.uid() = (
      SELECT properties.user_id
      FROM public.properties
      WHERE properties.id = homebooks.property_id
      LIMIT 1
    )
  );

CREATE POLICY IF NOT EXISTS sections_owner
  ON public.sections
  FOR ALL
  USING (
    auth.uid() = (
      SELECT properties.user_id
      FROM public.properties
      JOIN public.homebooks ON homebooks.property_id = properties.id
      WHERE homebooks.id = sections.homebook_id
      LIMIT 1
    )
  );

CREATE POLICY IF NOT EXISTS subsections_owner
  ON public.subsections
  FOR ALL
  USING (
    auth.uid() = (
      SELECT properties.user_id
      FROM public.properties
      JOIN public.homebooks ON homebooks.property_id = properties.id
      JOIN public.sections ON sections.homebook_id = homebooks.id
      WHERE sections.id = subsections.section_id
      LIMIT 1
    )
  );

CREATE POLICY IF NOT EXISTS media_owner
  ON public.media
  FOR ALL
  USING (
    auth.uid() = (
      SELECT properties.user_id
      FROM public.properties
      JOIN public.homebooks ON homebooks.property_id = properties.id
      JOIN public.sections ON sections.homebook_id = homebooks.id
      WHERE sections.id = media.section_id
      LIMIT 1
    )
  );

CREATE POLICY IF NOT EXISTS users_owner
  ON public.users
  FOR ALL
  USING (auth.uid() = users.id);

-- Public read policies
CREATE POLICY IF NOT EXISTS homebooks_public
  ON public.homebooks
  FOR SELECT
  USING (
    public_access_enabled = true
    AND is_published = true
  );

CREATE POLICY IF NOT EXISTS media_public
  ON public.media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.sections
      JOIN public.homebooks ON sections.homebook_id = homebooks.id
      WHERE sections.id = media.section_id
        AND homebooks.public_access_enabled = true
        AND homebooks.is_published = true
        AND (
          homebooks.public_access_token = current_setting('request.headers.x-homebook-token', true)
          OR current_setting('request.headers.x-homebook-token', true) IS NULL
        )
    )
  );

-- Storage schema policies
CREATE POLICY IF NOT EXISTS storage_service_role
  ON storage.objects
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS storage_authenticated_owner
  ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'homebook-media'
    AND auth.role() = 'authenticated'
    AND (metadata->>'homebook_id') IS NOT NULL
    AND (
      SELECT properties.user_id
      FROM public.properties
      JOIN public.homebooks ON homebooks.property_id = properties.id
      WHERE homebooks.id = (metadata->>'homebook_id')::uuid
      LIMIT 1
    ) = auth.uid()
  );

CREATE POLICY IF NOT EXISTS storage_public_read
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'homebook-media'
    AND (metadata->>'public') = 'true'
  );
