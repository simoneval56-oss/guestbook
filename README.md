# Homebook Studio

Base project per creare e condividere homebook digitali per strutture ricettive. Stack: Next.js (App Router), Supabase (Auth + Postgres) con RLS, API CRUD e pagine principali (home pubblica, auth, dashboard host, editor, pagina pubblica via slug).

## Setup rapido
1. `npm install`
2. Copia `.env.example` in `.env.local` con le chiavi Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) e Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
   - Per attivare le traduzioni automatiche: configura `TRANSLATION_SOURCE_LANG`, `TRANSLATION_TARGET_LANGS` e `TRANSLATION_PROVIDER`.
   - Provider disponibili:
     - `TRANSLATION_PROVIDER=libretranslate` con `LIBRETRANSLATE_URL` (self-hosted).
     - `TRANSLATION_PROVIDER=deepl` con `DEEPL_API_KEY` (fallback automatico su LibreTranslate se configurato).
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
- `users`: id (fk auth.users), email, subscription_status, plan_type, trial/subscription dates, riferimenti Stripe (`stripe_customer_id`, `stripe_subscription_id`).
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
- Aggiungi upload media su Supabase Storage con URL sicuri.
- Migliora i layout pubblici con componenti responsive dedicati per ogni `layout_type`.
- Aggiungi analytics (aperture link pubblici) e controlli granulari di pubblicazione (password o scadenze).

## Traduzioni automatiche homebook
- Le traduzioni sono generate al momento della pubblicazione (`Salva e pubblica`).
- Cache DB: `public.homebook_translations` (migration `0016_add_homebook_translations.sql`).
- Lingue ospite: query `?lang=<codice>` sulla pagina pubblica (`/p/[slug]?t=...&lang=en`), con fallback automatico alla lingua sorgente.
- `TRANSLATION_PROVIDER` seleziona il motore (`libretranslate` o `deepl`).
- Con `deepl`, se la chiamata fallisce e `LIBRETRANSLATE_URL` e' disponibile, il sistema usa LibreTranslate come fallback.
- Se nessun provider e' configurato, la funzionalita' resta disattivata senza bloccare la pubblicazione.

## Stripe webhook (billing automatico)
- Endpoint: `POST /api/stripe/webhook`.
- Eventi gestiti: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`.
- Effetto: aggiorna automaticamente `users.subscription_status`, `users.subscription_ends_at`, `users.trial_ends_at`, `users.stripe_customer_id`, `users.stripe_subscription_id`.
- Per il matching utente e' consigliato passare `metadata.user_id` (UUID Supabase) nella Checkout Session o nella Subscription. In fallback viene usata email e/o customer/subscription ID salvati.

## Stripe self-service (checkout + portale)
- Checkout abbonamento: `POST /api/stripe/checkout` (usato dalla dashboard).
- Portale cliente: `POST /api/stripe/portal` (gestione metodo di pagamento/cancellazione da Stripe Customer Portal).
- Variabili richieste:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_BASIC_1_5`
  - `STRIPE_PRICE_BASIC_6_10`
  - `STRIPE_PRICE_EXTRA` (necessario quando l'utente supera 10 strutture)
- Redirect dashboard con stato via query `?billing=...` (`checkout_success`, `checkout_cancel`, `checkout_error`, `portal_error`, ecc.).

Esempio locale con Stripe CLI:
```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```
