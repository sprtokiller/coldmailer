#!/bin/sh
set -e
echo "Running Prisma DB push..."
bunx prisma@5.22.0 db push --skip-generate
echo "Starting application..."
exec bun .output/server/index.mjs
