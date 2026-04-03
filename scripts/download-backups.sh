#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    . "$SCRIPT_DIR/.env"
fi

DEFAULT_USER="$BACKUP_REMOTE_DEFAULT_USER"
DEFAULT_HOST="$BACKUP_REMOTE_DEFAULT_HOST"

if [ -z "$DEFAULT_USER" ] || [ -z "$DEFAULT_HOST" ]; then
    echo "Error: Set BACKUP_REMOTE_DEFAULT_USER and BACKUP_REMOTE_DEFAULT_HOST in .env"
    exit 1
fi

REMOTE_HOST="${1:-$DEFAULT_USER@$DEFAULT_HOST}"
REMOTE_DIR="~/soup_backups"
LOCAL_DIR="$HOME/soup_backups"

# REMOTE_DIR="~/sharkie_backups"
# LOCAL_DIR="$HOME/sharkie_backups"

echo "Connecting to $REMOTE_HOST..."
mkdir -p "$LOCAL_DIR"

# List remote backup files
REMOTE_FILES=$(ssh "$REMOTE_HOST" "ls -1 $REMOTE_DIR/*.dump 2>/dev/null" || true)

if [ -z "$REMOTE_FILES" ]; then
    echo "No backups found on remote."
    exit 0
fi

DOWNLOADED=0
SKIPPED=0

for REMOTE_FILE in $REMOTE_FILES; do
    FILENAME=$(basename "$REMOTE_FILE")
    if [ -f "$LOCAL_DIR/$FILENAME" ]; then
        echo "Skipped (already exists): $FILENAME"
        SKIPPED=$((SKIPPED + 1))
    else
        echo "Downloading: $FILENAME..."
        scp "$REMOTE_HOST:$REMOTE_FILE" "$LOCAL_DIR/"
        DOWNLOADED=$((DOWNLOADED + 1))
    fi
done

echo "Done. Downloaded: $DOWNLOADED, skipped: $SKIPPED"
