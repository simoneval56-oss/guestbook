# Homebook Studio

Base project per creare e condividere homebook digitali per strutture ricettive. Stack: Next.js (App Router), Supabase (Auth + Postgres) con RLS, API CRUD e pagine principali (home pubblica, auth, dashboard host, editor, pagina pubblica via slug).

## Setup rapido
1. `npm install`
2. Copia `.env.example` in `.env.local` con le chiavi Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Esegui la migration iniziale: `supabase db push` oppure applica `supabase/migrations/0001_init.sql`.
4. `npm run dev` e apri `http://localhost:3000`.

## Struttura chiave
- `src/app/page.tsx`: landing pubblica con CTA e anteprima layout.
- `src/app/(auth)`: login e registrazione con Supabase Auth.
- `src/app/dashboard`: area riservata host; gestione strutture e homebook.
- `src/app/homebooks/[id]/edit`: editor sezioni/sottosezioni/media e pubblicazione.
- `src/app/p/[slug]`: pagina pubblica in sola lettura (ospiti) tramite `public_slug`.
- `src/app/api/*`: esempi di endpoint protetti per CRUD (properties, homebooks).
- `supabase/migrations/0001_init.sql`: schema, relazioni e policy RLS (accesso limitato al proprietario; lettura pubblica solo per homebook pubblicati).

## Modello dati (Postgres)
- `users`: id (fk auth.users), email, subscription_status, plan_type.
- `properties`: per struttura ricettiva (fk users).
- `homebooks`: associato a property, layout_type, public_slug unico, is_published.
- `sections`: elenco sezioni ordinate per homebook.
- `subsections`: testo lungo per sezione.
- `media`: allegati url per sezione o sottosezione.

## Note su sicurezza
- RLS: ogni tabella limita select/insert/update/delete al proprietario (auth.uid()). Homebook, sezioni, sottosezioni e media hanno policy extra di sola lettura quando `is_published = true` (anon o ospiti).
- Le rotte API usano `Authorization: Bearer <access_token Supabase>` e validano l'utente con la chiave service role; il service role non va esposto sul client.
- La pagina `/p/[slug]` usa solo query anon e dipende dalle policy RLS pubbliche.

## Esempi di chiamate API
```bash
# Dopo login client-side con Supabase, prendi access_token:
# const { data: { session } } = await supabase.auth.getSession();

# Crea una struttura
curl -X POST http://localhost:3000/api/properties \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Villa Smeraldo","address":"Via Roma 12","short_description":"Vista mare"}'

# Lista homebook dell'utente
curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:3000/api/homebooks

# Crea un homebook
curl -X POST http://localhost:3000/api/homebooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"property_id":"<property-id>","title":"Guida ospiti","layout_type":"aurora"}'

# Aggiungi sezione
curl -X POST http://localhost:3000/api/sections \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"homebook_id":"<homebook-id>","title":"Check-in","order_index":1}'
```

## Prossimi passi consigliati
- Integra Stripe (campi `subscription_status`, `plan_type`) con webhook per aggiornare lo stato.
- Aggiungi upload media su Supabase Storage con URL sicuri.
- Migliora i layout pubblici con componenti responsive dedicati per ogni `layout_type`.
- Aggiungi analytics (aperture link pubblici) e controlli granulari di pubblicazione (password o scadenze).
