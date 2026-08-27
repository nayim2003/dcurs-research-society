#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is missing."
  echo "Set it temporarily in your terminal before running this script."
  exit 1
fi

TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
mkdir -p "$DIR"

FILE="$DIR/dcurs_${TIMESTAMP}.dump"

echo "Creating DCURS PostgreSQL backup..."
echo "Output: $FILE"

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$FILE"

echo "Backup completed successfully."
echo "Keep this .dump file somewhere secure outside Render."
