#!/bin/sh
set -e

if [ "${RUN_DB_PUSH:-}" = "true" ]; then
  echo "Running Prisma DB push..."
  bun node_modules/prisma/build/index.js db push --skip-generate
fi

echo "Starting application..."
exec bun .output/server/index.mjs
