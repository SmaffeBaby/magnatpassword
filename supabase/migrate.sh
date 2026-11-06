#!/bin/sh
set -eu
export PGPASSWORD="$POSTGRES_PASSWORD"

psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS magnat_internal;
REVOKE ALL ON SCHEMA magnat_internal FROM PUBLIC;
CREATE TABLE IF NOT EXISTS magnat_internal.schema_migrations (
  filename text PRIMARY KEY,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

for migration in /migrations/*.sql; do
  [ -f "$migration" ] || continue
  name=$(basename "$migration")
  # File names become SQL literals below; accept only repository migration names.
  case "$name" in *[!a-zA-Z0-9_.-]*) echo "Invalid migration filename: $name" >&2; exit 1;; esac
  checksum=$(sha256sum "$migration" | cut -d ' ' -f 1)
  previous=$(psql -v ON_ERROR_STOP=1 -Atc "SELECT sha256 FROM magnat_internal.schema_migrations WHERE filename = '$name'")
  if [ -n "$previous" ]; then
    if [ "$previous" != "$checksum" ]; then
      echo "Applied migration changed: $name. Add a new migration instead." >&2
      exit 1
    fi
    echo "Already applied: $name"
    continue
  fi
  echo "Applying: $name"
  psql -v ON_ERROR_STOP=1 -f "$migration"
  psql -v ON_ERROR_STOP=1 -c "INSERT INTO magnat_internal.schema_migrations (filename, sha256) VALUES ('$name', '$checksum')"
done
