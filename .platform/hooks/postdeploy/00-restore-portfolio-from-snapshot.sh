#!/usr/bin/env bash
set -u

marker="/var/app/data/.portfolio_restore_from_snapshot_20260811_done"
log_file="/var/log/portfolio-restore-from-snapshot.log"
mount_dir="/mnt/guru-portfolio-restore"
dest="/var/app/data/user-portfolios"

exec > >(tee -a "${log_file}") 2>&1

echo "portfolio restore hook started at $(date -Is)"

if [ -f "${marker}" ]; then
  echo "restore already completed; marker=${marker}"
  exit 0
fi

mkdir -p "${mount_dir}" /var/app/data

root_source="$(findmnt -n -o SOURCE / 2>/dev/null || true)"
echo "root source: ${root_source}"
echo "block devices:"
lsblk -pn -o NAME,FSTYPE,MOUNTPOINT,SIZE,TYPE || true

restore_source=""
for _attempt in $(seq 1 20); do
  while read -r name; do
    [ -n "${name}" ] || continue
    fstype="$(lsblk -pnr -no FSTYPE "${name}" 2>/dev/null | head -n 1 || true)"
    mountpoint="$(findmnt -n -o TARGET "${name}" 2>/dev/null | head -n 1 || true)"
    type="$(lsblk -pnr -no TYPE "${name}" 2>/dev/null | head -n 1 || true)"
    [ -n "${fstype}" ] || continue
    [ -z "${mountpoint}" ] || continue
    [ "${type}" = "part" ] || [ "${type}" = "disk" ] || continue
    [ "${name}" != "${root_source}" ] || continue

    echo "trying recovery candidate ${name} (${fstype})"
    if mount -o ro,nouuid "${name}" "${mount_dir}" 2>/dev/null || mount -o ro "${name}" "${mount_dir}" 2>/dev/null; then
      for candidate in \
        "${mount_dir}/var/app/data/user-portfolios" \
        "${mount_dir}/var/app/current/server/data/user-portfolios" \
        "${mount_dir}/var/app/staging/server/data/user-portfolios"; do
        if [ -d "${candidate}" ]; then
          restore_source="${candidate}"
          break
        fi
      done

      if [ -z "${restore_source}" ] && [ -d "${mount_dir}/var/app" ]; then
        restore_source="$(find "${mount_dir}/var/app" -maxdepth 6 -type d -name user-portfolios 2>/dev/null | head -n 1 || true)"
      fi

      if [ -n "${restore_source}" ]; then
        break 2
      fi

      echo "no user-portfolios directory found on ${name}; unmounting"
      umount "${mount_dir}" || true
    fi
  done < <(lsblk -pnro NAME 2>/dev/null || true)
  sleep 1
done

if [ -z "${restore_source}" ]; then
  echo "no recovery source found; leaving marker unset"
  exit 0
fi

echo "recovery source: ${restore_source}"
echo "source contents:"
find "${restore_source}" -maxdepth 3 -type f -name '*.sqlite*' -print || true

backup="${dest}.pre-restore-$(date +%Y%m%d%H%M%S)"
if [ -e "${dest}" ]; then
  echo "backing up current portfolio directory to ${backup}"
  cp -a "${dest}" "${backup}"
fi

mkdir -p "${dest}"
rsync -a "${restore_source}/" "${dest}/"
chown -R webapp:webapp "${dest}" || true
chmod -R go-rwx "${dest}" || true

touch "${marker}"
echo "portfolio restore completed at $(date -Is)"
echo "restored contents:"
find "${dest}" -maxdepth 3 -type f -name '*.sqlite*' -print || true

umount "${mount_dir}" || true
