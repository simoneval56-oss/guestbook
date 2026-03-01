# Release Notes

## 2026-03-01 - Stabilizzazione produzione

Commit di riferimento: `7a77c13`

### Correzioni incluse
- Fix contrasto testo nel form di registrazione (`342ff74`).
- Fix redirect post-conferma/login evitando l'intercettazione errata di `NEXT_REDIRECT` (`ac7e301`).
- Fix sfondo card `COLAZIONE` nel layout `futuristico` (allineata alle altre card bianche) (`d9f7170`).
- Fix coerenza stile card/slug del layout `classico` lato pubblico, evitando override su altri layout (`a011552`).
- Miglioramento contrasto e leggibilità nell'editor/dashboard e nelle viste pubbliche dei layout (`7a77c13`).

### Esito collaudo
- Flusso testato in produzione: registrazione, conferma email, login, accesso dashboard, modifica/salvataggio homebook, apertura link ospite in incognito, persistenza sessione dopo logout/login.
