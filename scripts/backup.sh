#!/bin/sh
set -e
while true; do
  F="/backups/backup_$(date +%Y%m%d_%H%M%S).sql"
  pg_dump -h db -U coldmailer coldmailer > "$F"
  echo "Backup OK: $F"
  find /backups -name "*.sql" -mtime +7 -delete
  sleep 86400
done
