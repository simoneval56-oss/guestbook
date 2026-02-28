# Supabase Policy Checklist

| Area | Status | Notes / Next Step |
| --- | --- | --- |
| `homebooks` table | ✅ | RLS enabled; owner/service/public policies already exist per screenshot. |
| `media` table | ✅ | RLS policies present (owner + public view). No extra action required. |
| `properties` table | ✅ | RLS with service-role and owner policies are active; done. |
| `sections` / `subsections` tables | ✅ | RLS owner/service/public policies already visible in dashboard. |
| `users` table | ✅ | RLS + owner/service policies present; nothing further needed. |
| Storage bucket `homebook-media` | ✅ | Bucket-level policies already cover public read and authenticated mutate operations. |
| Storage schema `storage.objects` | ✅ | `storage_service_role`, `storage_authenticated_owner`, `storage_public_read` present (per previous script/execution). |
| Additional notes | ℹ️ | When uploading media, set `metadata.homebook_id` and `metadata.public` so the storage policies can validate ownership and visibility. |
| **Verifica periodica** | 🧭 | Ogni mese, apri Table Editor/Storage e controlla che RLS sia abilitata e i nomi delle policy che ti servono; aggiorna i metadata negli upload se cambiano i campi. |
