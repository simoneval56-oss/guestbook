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
- (opzionale snapshot retention) `jq`
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

Snapshot Hetzner (opzionale):

- `ENABLE_VPS_SNAPSHOT=true`
- `HCLOUD_SERVER_ID=<id server>`
- `HCLOUD_SNAPSHOT_DESCRIPTION=guesthomebook-auto`
- `HCLOUD_SNAPSHOT_FILTER_PREFIX=guesthomebook-auto`
- `HCLOUD_RETENTION_ENABLED=true`
- `HCLOUD_RETENTION_COUNT=7` (mantiene solo gli ultimi 7 snapshot matching)
- Consigliato: usa `HCLOUD_TOKEN_FILE` invece di `HCLOUD_TOKEN` inline.

## 3) Rendi eseguibili gli script

```bash
sudo chmod +x /opt/guestbook/ops/backup/backup-and-verify.sh
sudo chmod +x /opt/guestbook/ops/backup/hetzner-snapshot.sh
sudo chmod +x /opt/guestbook/ops/backup/rotate-hcloud-token.sh
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

## Rotazione token Hetzner (senza downtime)

1. Crea un nuovo API token in Hetzner Cloud.
2. Salvalo in file token (atomico):

```bash
sudo NEW_HCLOUD_TOKEN='<new_token>' HCLOUD_TOKEN_FILE=/etc/guesthomebook/hcloud-token /opt/guestbook/ops/backup/rotate-hcloud-token.sh
```

3. In `/etc/guesthomebook-backup.env` tieni:

```bash
HCLOUD_TOKEN_FILE=/etc/guesthomebook/hcloud-token
HCLOUD_TOKEN=
```

4. Verifica con un run manuale:

```bash
sudo systemctl start guesthomebook-backup.service
sudo journalctl -u guesthomebook-backup.service -n 120 --no-pager
```
