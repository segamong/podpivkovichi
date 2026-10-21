#!/bin/bash
set -euo pipefail
exec 9>/run/lock/podpivkovichi-update.lock
flock -n 9 || exit 0
export PATH=/opt/podpivkovichi/runtime/node/bin:/usr/bin:/bin
root=/opt/podpivkovichi
build=/var/lib/podpivkovichi-build
sha=$(curl --fail --silent --show-error --max-time 30 -H 'Accept: application/vnd.github+json' https://api.github.com/repos/segamong/podpivkovichi/commits/main | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])')
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || exit 1
if [[ -f "$root/current/.revision" ]] && [[ "$(cat "$root/current/.revision")" == "$sha" ]]; then echo "Already deployed: $sha"; exit 0; fi
if [[ -e "$root/releases/$sha" ]]; then echo 'Incomplete or previous release exists; inspect before retry.' >&2; exit 1; fi
install -d -m 0755 "$root/releases"
install -d -o podpivkovichi-build -g podpivkovichi-build -m 0750 "$build/$sha"
curl --fail --location --silent --show-error --max-time 120 "https://api.github.com/repos/segamong/podpivkovichi/tarball/$sha" -o "$build/$sha/source.tgz"
chown podpivkovichi-build:podpivkovichi-build "$build/$sha/source.tgz"
runuser -u podpivkovichi-build -- tar -xzf "$build/$sha/source.tgz" --strip-components=1 --no-same-owner -C "$build/$sha"
# Never execute repository code as root. Build/test under a separate restricted account.
systemd-run --quiet --wait --collect --pipe --unit="podpivkovichi-build-${sha:0:12}" \
  -p User=podpivkovichi-build -p Group=podpivkovichi-build -p "WorkingDirectory=$build/$sha" \
  -p CPUQuota=60% -p MemoryMax=900M -p TasksMax=128 -p Nice=15 \
  -p NoNewPrivileges=true -p PrivateTmp=true -p ProtectHome=true -p ProtectSystem=strict \
  -p "ReadWritePaths=$build" -p RuntimeMaxSec=900 \
  --setenv="PATH=$PATH" --setenv="HOME=$build" \
  /bin/bash -c 'set -e; npm ci --ignore-scripts --no-audit --no-fund; npm test; npm run build; npm prune --omit=dev --ignore-scripts --no-audit --no-fund'
for path in server dist node_modules package.json package-lock.json; do test -e "$build/$sha/$path"; test ! -L "$build/$sha/$path"; done
install -d -m 0755 "$root/releases/$sha"
for path in server dist node_modules package.json package-lock.json; do cp -a "$build/$sha/$path" "$root/releases/$sha/"; done
chown -hR root:root "$root/releases/$sha"
chmod -R go-w "$root/releases/$sha"
printf '%s\n' "$sha" > "$root/releases/$sha/.revision"
# SQLite backup API makes a consistent WAL-aware backup while the site runs.
if [[ -f /var/lib/podpivkovichi/signal.sqlite ]]; then
  install -d -m 0700 /var/backups/podpivkovichi
  python3 - <<'PY'
import sqlite3,datetime,os
target='/var/backups/podpivkovichi/'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.sqlite'
with sqlite3.connect('/var/lib/podpivkovichi/signal.sqlite') as source, sqlite3.connect(target) as dest: source.backup(dest)
os.chmod(target,0o600)
PY
fi
previous=$(readlink -f "$root/current" || true)
ln -s "$root/releases/$sha" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
systemctl restart podpivkovichi-app
healthy=false
for attempt in $(seq 1 25); do
  if curl --fail --silent http://127.0.0.1:3100/api/health >/dev/null; then healthy=true; break; fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  if [[ -n "$previous" && -d "$previous" ]]; then ln -s "$previous" "$root/current.rollback"; mv -Tf "$root/current.rollback" "$root/current"; systemctl restart podpivkovichi-app; fi
  echo 'Health check failed; previous release restored when available.' >&2; exit 1
fi
echo "Deployed $sha"
