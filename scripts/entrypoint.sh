#!/bin/sh
set -e

if [ "${SKIP_DB_SETUP:-}" != "true" ]; then
  if [ -f scripts/backfill-signature-group-id.sql ]; then
    echo "Running pre-push backfills..."
    node node_modules/prisma/build/index.js db execute --file scripts/backfill-signature-group-id.sql --schema prisma/schema.prisma
  fi

  echo "Syncing database schema..."
  node node_modules/prisma/build/index.js db push --skip-generate

  echo "Running database seed..."
  node node_modules/prisma/build/index.js db seed
fi

echo "Starting application..."
exec bun .output/server/index.mjs
