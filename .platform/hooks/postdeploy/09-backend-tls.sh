#!/bin/bash
set -euo pipefail
enabled=$(/opt/elasticbeanstalk/bin/get-config environment -k THESISFORGE_BACKEND_TLS_ENABLED 2>/dev/null || true)
if [[ "$enabled" != "true" ]]; then
  echo "Dedicated backend HTTPS is not enabled for this environment."
  exit 0
fi
node /var/app/current/scripts/install-backend-tls.mjs --install-existing-host
