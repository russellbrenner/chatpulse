#!/usr/bin/env bash
# infra-scan.sh — Scan staged or specified files for infrastructure leaks
#
# Used by:
#   - .githooks/pre-commit (scans staged files)
#   - .github/workflows/infra-scan.yaml (scans changed files in PR)
#   - Claude Code hook (scans individual files)
#
# Exit 0 = clean, Exit 1 = leak detected

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No colour

FAILED=0

# Patterns to detect infrastructure leaks (ERE — works on both macOS and Linux grep -E)
# Each line: "regex|||description"
PATTERNS=(
  '10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|||RFC1918 10.x.x.x IP address'
  '172\.(1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3}|||RFC1918 172.16-31.x.x IP address'
  '192\.168\.[0-9]{1,3}\.[0-9]{1,3}|||RFC1918 192.168.x.x IP address'
  '\.itsa\.house|||Private domain name (.itsa.house)'
  'pve[12]|||Proxmox node hostname'
  'fileshare1|||NAS hostname'
  'x86-node[12]|||Proxmox host hostname'
  'CT [0-9]{3}|||Proxmox container ID reference'
  'VLAN[[:space:]]*[0-9]+|||VLAN ID reference'
)

# Files to always skip (these files define the patterns themselves)
SKIP_FILES=(
  "scripts/infra-scan.sh"
  ".github/workflows/infra-scan.yaml"
  ".claude/settings.json"
)

scan_file() {
  local file="$1"

  # Skip binary files
  if file "$file" | grep -q "binary"; then
    return 0
  fi

  # Skip self and known-safe files
  for skip in "${SKIP_FILES[@]}"; do
    if [[ "$file" == *"$skip" ]]; then
      return 0
    fi
  done

  for entry in "${PATTERNS[@]}"; do
    local pattern="${entry%%|||*}"
    local desc="${entry##*|||}"

    # Use grep -En (extended regex + line numbers) — portable across macOS and Linux
    if grep -En "$pattern" "$file" 2>/dev/null | head -5; then
      echo -e "${RED}LEAK DETECTED${NC} in ${YELLOW}${file}${NC}: ${desc}"
      FAILED=1
    fi
  done
}

# If files are passed as arguments, scan those
# Otherwise, scan git staged files (pre-commit mode)
if [[ $# -gt 0 ]]; then
  for file in "$@"; do
    if [[ -f "$file" ]]; then
      scan_file "$file"
    fi
  done
else
  # Pre-commit mode: scan staged files
  while IFS= read -r file; do
    if [[ -f "$file" ]]; then
      scan_file "$file"
    fi
  done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
fi

if [[ $FAILED -ne 0 ]]; then
  echo ""
  echo -e "${RED}Infrastructure leak(s) detected.${NC} This is a public repo."
  echo "Use environment variables or Kubernetes Secrets for infrastructure-specific values."
  echo "If this is a false positive in a comment/doc explaining the pattern, add the file to SKIP_FILES in scripts/infra-scan.sh"
  exit 1
fi

exit 0
