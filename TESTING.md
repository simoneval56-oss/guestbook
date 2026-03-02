# Testing Runbook

Questo documento descrive i controlli minimi per evitare regressioni su auth, accesso pubblico e leggibilita UI.

## 1) Prerequisiti CI (GitHub Actions)

Configura questi repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Opzionali:

- `NEXT_PUBLIC_BASE_URL` (utile per coerenza redirect in ambienti CI particolari)
- `E2E_SIGNUP_EMAIL_DOMAIN` (override dominio email usato dal test signup)

Workflow CI presente:

- `.github/workflows/e2e-critical.yml`

## 2) Esecuzione locale

Installazione dipendenze:

```bash
npm ci
npx playwright install chromium
```

Suite completa:

```bash
npx playwright test
```

Spec singoli:

```bash
npx playwright test tests/e2e/access-critical.spec.ts
npx playwright test tests/e2e/auth-critical.spec.ts
npx playwright test tests/e2e/contrast-critical.spec.ts
```

## 3) Cosa coprono i test critici

- `access-critical.spec.ts`
  - ospite non puo modificare dati
  - isolamento proprietario A/B
  - invalidazione vecchio token dopo rotazione link pubblico

- `auth-critical.spec.ts`
  - registrazione + login + logout
  - accesso link ospite senza sessione

- `contrast-critical.spec.ts`
  - check contrasto WCAG su layout principali:
    - `classico`
    - `moderno`
    - `mediterraneo`
    - `futuristico`
    - `notturno`
    - `romantico`

## 4) Smoke test produzione dopo deploy

Esegui sempre questa checklist minima:

1. Login utente reale.
2. Apertura dashboard senza errori.
3. Apertura editor di un homebook e salvataggio di una modifica.
4. Copia link ospite e apertura in incognito.
5. Verifica visibilita testi nelle card e nel modal (almeno un layout tra `futuristico`, `notturno`, `mediterraneo`).
6. Logout e nuovo login (persistenza sessione corretta).

## 5) Blocco merge su fallimento test

Per bloccare merge quando i test falliscono:

1. Vai in GitHub `Settings -> Branches -> Branch protection rules`.
2. Crea/modifica regola su `main`.
3. Abilita `Require status checks to pass before merging`.
4. Seleziona il check del workflow `E2E Critical`.
