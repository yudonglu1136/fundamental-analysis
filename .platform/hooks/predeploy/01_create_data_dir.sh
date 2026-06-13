#!/usr/bin/env bash
set -euo pipefail

mkdir -p /var/app/data
chown webapp:webapp /var/app/data || true
chmod 775 /var/app/data
