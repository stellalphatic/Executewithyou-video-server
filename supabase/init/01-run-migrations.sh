#!/bin/sh
echo 'Running app migrations...'
for f in /migrations/*.sql; do
  if [ -f "$f" ]; then
    echo "Running $f"
    psql -h postgres -U postgres -d postgres -f "$f" || exit 1
  fi
done
echo 'Migrations complete!'
