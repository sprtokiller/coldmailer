#!/bin/sh
set -e

if [ "${SKIP_DB_SETUP:-}" != "true" ]; then
  echo "Syncing database schema..."
  node node_modules/prisma/build/index.js db push --skip-generate

  echo "Running database seed..."
  node node_modules/prisma/build/index.js db seed
fi

echo "Starting application..."
exec bun .output/server/index.mjs
