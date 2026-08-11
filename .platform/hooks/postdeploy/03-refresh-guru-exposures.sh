#!/usr/bin/env bash
set -u

if [ "${SKIP_GURU_EXPOSURE_REFRESH:-0}" = "1" ]; then
  echo "guru exposure refresh skipped because SKIP_GURU_EXPOSURE_REFRESH=1"
  exit 0
fi

cd /var/app/current || exit 0

if [ ! -f server/refreshGuruExposureSnapshots.js ]; then
  echo "warning: guru exposure refresh script is missing; skipping warmup" >&2
  exit 0
fi

limit="${GURU_EXPOSURE_WARM_LIMIT:-8}"
stale_hours="${GURU_EXPOSURE_STALE_HOURS:-12}"
log_file="/var/log/guru-exposure-refresh.log"

nohup node server/refreshGuruExposureSnapshots.js --stale-hours="${stale_hours}" --limit="${limit}" > "${log_file}" 2>&1 &
echo "started background guru exposure refresh with limit=${limit}, stale_hours=${stale_hours}; log=${log_file}"
