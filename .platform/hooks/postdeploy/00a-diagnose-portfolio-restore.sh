#!/usr/bin/env bash
set -u

marker="/var/app/data/.portfolio_restore_from_snapshot_20260811_done"
dest="/var/app/data/user-portfolios"

echo "portfolio restore diagnostic started at $(date -Is)"
if [ -f "${marker}" ]; then
  echo "portfolio restore marker exists: ${marker}"
else
  echo "portfolio restore marker missing: ${marker}"
fi

echo "portfolio directory: ${dest}"
du -sh "${dest}" 2>/dev/null || true
find "${dest}" -maxdepth 3 -type f -name '*.sqlite*' -printf '%p %s bytes\n' 2>/dev/null || true
echo "portfolio restore diagnostic finished at $(date -Is)"
