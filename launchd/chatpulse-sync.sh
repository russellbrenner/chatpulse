#!/usr/bin/env bash
# chatpulse-sync.sh — Back up Apple Messages chat.db to SMB share
#
# Called by the com.chatpulse.sync LaunchAgent when ~/Library/Messages/chat.db
# changes. Uses sqlite3's online backup API (safe while Messages.app is running).
#
# Configuration:
#   Set CHATPULSE_SMB_MOUNT in your environment or edit the default below.
#   The SMB share must already be mounted (e.g. via Finder, mount_smbfs, or CCC).
#
# Safety:
#   - Uses sqlite3 .backup (online backup API), NOT cp — WAL-safe
#   - Read-only access to the source database
#   - Exits cleanly (0) if the mount is unavailable (off-network is not an error)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — edit this default or set CHATPULSE_SMB_MOUNT in your env
# ---------------------------------------------------------------------------
SMB_MOUNT="${CHATPULSE_SMB_MOUNT:-}"
SOURCE_DB="${HOME}/Library/Messages/chat.db"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

die() {
    log "ERROR: $*" >&2
    exit 1
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if [[ -z "${SMB_MOUNT}" ]]; then
    die "CHATPULSE_SMB_MOUNT is not set. Configure the mount path before running."
fi

if [[ ! -f "${SOURCE_DB}" ]]; then
    die "Source database not found: ${SOURCE_DB}"
fi

# Check if the SMB mount point exists and is actually mounted.
# If the share is not available (e.g. off-network), exit cleanly.
if [[ ! -d "${SMB_MOUNT}" ]]; then
    log "SMB mount path does not exist: ${SMB_MOUNT} — skipping (likely off-network)."
    exit 0
fi

# Verify the path is a mount point (not just an empty local directory)
if ! mount | grep -q "${SMB_MOUNT}"; then
    log "SMB path exists but is not a mount point: ${SMB_MOUNT} — skipping."
    exit 0
fi

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------
DEST="${SMB_MOUNT}/chat.db"

log "Starting backup: ${SOURCE_DB} -> ${DEST}"

if sqlite3 "${SOURCE_DB}" ".backup '${DEST}'"; then
    FILESIZE=$(stat -f%z "${DEST}" 2>/dev/null || echo "unknown")
    log "Backup completed successfully (${FILESIZE} bytes)."
else
    die "sqlite3 .backup failed with exit code $?."
fi

exit 0
