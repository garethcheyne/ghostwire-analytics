#!/bin/sh
set -e

echo "Applying database migrations..."
(cd /app/migrate && npx prisma migrate deploy)

exec node server.js
