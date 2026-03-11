# Backup Operativo (VPS + Supabase DB)

Questo pacchetto crea:

1. dump giornaliero DB (`pg_dump`)
2. test di restore automatico su Postgres temporaneo Docker (`pg_restore`)
3. retention file backup
4. snapshot VPS opzionale (Hetzner helper)

## 1) Prerequisiti VPS

- `docker` installato e attivo
- client postgres: `pg_dump`, `pg_restore`, `psql`
- (opzionale snapshot Hetzner) `hcloud` CLI
- immagine restore consigliata: `public.ecr.aws/supabase/postgres:17.6.1.054`

## 2) Configura env backup

```bash
sudo cp /opt/guestbook/ops/backup/guesthomebook-backup.env.example /etc/guesthomebook-backup.env
sudo chmod 600 /etc/guesthomebook-backup.env
sudo nano /etc/guesthomebook-backup.env
```

Imposta almeno:

- `DATABASE_URL` (connessione diretta Postgres Supabase)
- `BACKUP_DIR`
- `RETENTION_DAYS`
- `BACKUP_SCHEMAS` (default consigliato: `public`)
- `RESTORE_PG_USER` (con immagine Supabase: `supabase_admin`)

Alternativa senza password DB:

- lascia vuoto `DATABASE_URL`
- imposta `SUPABASE_ACCESS_TOKEN`
- installa `supabase` CLI sulla VPS
- assicurati che esistano `/opt/guestbook/supabase/.temp/project-ref` e `pooler-url`

## 3) Rendi eseguibili gli script

```bash
sudo chmod +x /opt/guestbook/ops/backup/backup-and-verify.sh
sudo chmod +x /opt/guestbook/ops/backup/hetzner-snapshot.sh
```

## 4) Test manuale (restore testato)

```bash
sudo /opt/guestbook/ops/backup/backup-and-verify.sh
```

Verifica output:

- file dump in `BACKUP_DIR` (`db-YYYY...dump`)
- checksum `.sha256`
- report `latest-result.json` con `"ok": true`

## 5) Abilita scheduling giornaliero (systemd)

```bash
sudo cp /opt/guestbook/ops/backup/systemd/guesthomebook-backup.service /etc/systemd/system/
sudo cp /opt/guestbook/ops/backup/systemd/guesthomebook-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now guesthomebook-backup.timer
sudo systemctl status guesthomebook-backup.timer
```

Per vedere ultimo run:

```bash
sudo systemctl status guesthomebook-backup.service
sudo journalctl -u guesthomebook-backup.service -n 200 --no-pager
```
