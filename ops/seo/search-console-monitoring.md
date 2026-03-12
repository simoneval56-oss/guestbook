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
