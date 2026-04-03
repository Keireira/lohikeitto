#!/usr/bin/env bash
set -euo pipefail

# Restore the latest .dump file from ./dumps into the local dev database.
# Skips if the database already has data (use --force to override).

DUMPS_DIR="${DUMPS_DIR:-./dumps}"
CONTAINER="${DB_CONTAINER:-SHARKIE-DB}"
DB_USER="${POSTGRES_USER:-sharkie}"
DB_NAME="${POSTGRES_DB:-lohikeitto}"
FORCE=false

for arg in "$@"; do
	case "$arg" in
		--force|-f) FORCE=true ;;
	esac
done

# Find the latest dump file
LATEST_DUMP=$(find "$DUMPS_DIR" -maxdepth 1 -name '*.dump' -type f 2>/dev/null | sort -r | head -1)

if [ -z "$LATEST_DUMP" ]; then
	echo "No .dump files found in $DUMPS_DIR — skipping restore"
	exit 0
fi

echo "Latest dump: $(basename "$LATEST_DUMP")"

# Check if the container is running
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
	echo "Container $CONTAINER is not running — start it with 'make dev-db' first"
	exit 1
fi

# Wait for DB to be ready
echo "Waiting for database..."
until docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; do
	sleep 1
done

# Check if database already has data
ROW_COUNT=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
	"SELECT count(*) FROM exchange_rates;" 2>/dev/null || echo "0")

if [ "$ROW_COUNT" != "0" ] && [ "$FORCE" = false ]; then
	echo "Database already has $ROW_COUNT rows — skipping restore (use --force to override)"
	exit 0
fi

if [ "$FORCE" = true ] && [ "$ROW_COUNT" != "0" ]; then
	echo "Force mode: dropping existing data ($ROW_COUNT rows)..."
	docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "TRUNCATE exchange_rates;"
fi

# Restore the dump
echo "Restoring $(basename "$LATEST_DUMP") into $DB_NAME..."
docker exec -i "$CONTAINER" pg_restore \
	-U "$DB_USER" \
	-d "$DB_NAME" \
	--no-owner \
	--no-privileges \
	--clean \
	--if-exists \
	< "$LATEST_DUMP"

# Verify
FINAL_COUNT=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
	"SELECT count(*) FROM exchange_rates;")
echo "Restore complete — $FINAL_COUNT rows in exchange_rates"
