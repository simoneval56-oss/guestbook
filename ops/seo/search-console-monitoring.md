# SEO Monitoring (4-8 settimane)

Obiettivo: verificare che Google indicizzi correttamente il sito e che la query brand cresca in impression/click.

## Setup iniziale (Settimana 0)

1. In Google Search Console apri la proprieta dominio `guesthomebook.it`.
2. Invia sitemap: `https://www.guesthomebook.it/sitemap.xml`.
3. Verifica in `Indicizzazione > Pagine` che non ci siano errori bloccanti.
4. In `Prestazioni > Risultati di ricerca` salva i filtri brand:
   - Query contiene `guesthomebook`
   - Query contiene `guest homebook`
   - Query contiene `guesthomebook.it`

## Cadenza consigliata

1. Prime 4 settimane: controllo 2 volte a settimana.
2. Settimane 5-8: controllo 1 volta a settimana.
3. Dopo 8 settimane: controllo ogni 2 settimane (se stabile).

## Checklist settimanale

1. `Indicizzazione > Pagine`
   - Controlla trend pagine indicizzate.
   - Controlla principali motivi di esclusione:
     - `Scansionata - attualmente non indicizzata`
     - `Pagina duplicata`
     - `Esclusa da tag noindex`
2. `Prestazioni > Risultati di ricerca`
   - Applica filtro query brand.
   - Registra: click, impression, CTR medio, posizione media.
3. `URL Inspection`
   - Testa homepage e pagine importanti.
   - Se una pagina strategica non indicizzata, invia richiesta indicizzazione.
4. Verifica tecnica minima (live):
   - homepage 200
   - robots.txt 200
   - sitemap.xml 200
   - sitemap dichiarata in robots

## Soglie pratiche (early-stage)

1. `Scansionata - non indicizzata`:
   - Se cresce >20% WoW per 2 settimane, investigare contenuti duplicati/sottili.
2. `Noindex` inatteso:
   - Qualsiasi incremento su pagine che vuoi in SERP -> fix immediato.
3. Query brand:
   - Impression ferme per 2-3 settimane -> rafforzare segnali brand (link social, menzioni, pagine istituzionali aggiornate).
4. CTR brand:
   - Se CTR cala molto con posizione stabile, migliorare title/meta description homepage.

## Piano 8 settimane

1. Settimana 1: baseline e invio sitemap.
2. Settimana 2: verifica prime pagine valide + primi dati query brand.
3. Settimana 3: controllo esclusioni e coerenza title/meta.
4. Settimana 4: prima review trend (indicizzate vs escluse).
5. Settimana 5: ottimizzazione pagine con resa bassa.
6. Settimana 6: controllo brand query + eventuali nuove richieste indicizzazione.
7. Settimana 7: stabilizzazione e controllo anomalie.
8. Settimana 8: review finale e passaggio a monitoraggio bisettimanale.

## Log operativo

Compila il file `ops/seo/seo-weekly-tracker.csv` ad ogni controllo.

## Automazione (API + scheduler)

E' disponibile uno script automatico:

```bash
npm run seo:weekly-monitor
```

Cosa aggiorna in automatico:
1. Metriche brand da Search Console API (`brand_clicks`, `brand_impressions`, `brand_ctr_pct`, `brand_avg_position`).
2. Stato tecnico live (`home_status`, `robots_status`, `sitemap_status`, `sitemap_url_count`).
3. `notes/actions` con note operative automatiche.

Limite API Google:
1. I conteggi `pages_indexed/pages_excluded` e motivi di esclusione aggregati non sono esposti da Search Console API.
2. Questi campi restano da compilare manualmente da UI Search Console.

## Setup credenziali Search Console API

1. Google Cloud Console:
   - crea progetto (o usa esistente),
   - abilita `Google Search Console API`,
   - crea `Service Account`,
   - genera chiave JSON.
2. Search Console:
   - proprieta dominio `guesthomebook.it`,
   - aggiungi la mail del service account come proprietario (o owner verificato).
3. GitHub repository secrets:
   - `GSC_SERVICE_ACCOUNT_JSON`: contenuto JSON completo della chiave.
   - `GSC_SITE_URL`: ad esempio `sc-domain:guesthomebook.it`.
   - `WORKFLOW_TRIGGER_TOKEN` (opzionale ma consigliato): PAT classico o fine-grained token/GitHub App token con permessi `contents: write` e `pull requests: write`, usato per creare la PR automatica in modo che i workflow `pull_request` richiesti possano partire.
4. (Opzionale) repository variables:
   - `SEO_BASE_URL`: default `https://www.guesthomebook.it`.
   - `SEO_BRAND_TERMS`: default `guesthomebook,guest homebook,guesthomebook.it`.

## Scheduler automatico GitHub

Workflow: `.github/workflows/seo-weekly-monitor.yml`

Trigger:
1. ogni lunedi (cron),
2. manuale (`Run workflow`).

Output:
1. aggiorna `ops/seo/seo-weekly-tracker.csv`,
2. apre o aggiorna la PR `chore(seo): update weekly tracker` solo se ci sono modifiche.

Nota:
1. Senza `WORKFLOW_TRIGGER_TOKEN`, la PR automatica viene creata con il token standard di GitHub Actions e i workflow `pull_request` richiesti possono restare in stato `Expected`.
2. Il trigger manuale di `E2E Critical` non sblocca automaticamente la PR se viene eseguito su un branch o commit diversi dalla head della PR.
