#!/usr/bin/env bash
set -eu

# Tenant directory names must not be enumerated into deployment logs. Use the
# operator-only inventory command for aggregate database counts instead.
echo "User storage is preserved during deployment. Use npm run user-data -- inventory for private operator validation."
