#!/usr/bin/env bash
set -eu

# Retired: selecting an arbitrary attached disk and merging its user data over
# live SQLite/WAL files can silently revert newer user edits. Deploys must never
# restore or reassign account data, even if an old marker is absent. Leave both
# existing directories and legacy recovery markers untouched.
# Recovery: scripts/user-data-maintenance.mjs and the reviewed cutover procedure
# in docs/owner-portfolio-release-2026-09-12.md.
echo "Legacy automatic portfolio restore is disabled; existing user data is unchanged. Use a verified isolated restore before any approved cutover."
