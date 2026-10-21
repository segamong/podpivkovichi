#!/bin/bash
set -euo pipefail
server_ip=${1:?Provide the server IPv4 address}
[[ $(id -u) == 0 ]] || { echo 'Run as root'; exit 1; }
cd "$(dirname "$0")"
test ! -e /etc/systemd/system/podpivkovichi-app.service || { echo 'Already installed; use update service.'; exit 1; }
for port in 3100 10443 7890 7891 7892 7893; do
  if ss -H -ltnu | awk '{print $5}' | grep -Eq ":${port}$"; then echo "Port $port is busy; installation stopped."; exit 1; fi
done
for binary in /opt/signal/runtime/node-v24.19.0-linux-x64/bin/node /opt/signal/runtime/bin/caddy /opt/signal/runtime/bin/livekit-server; do test -x "$binary"; done
for user in podpivkovichi podpivkovichi-media podpivkovichi-caddy podpivkovichi-build; do
  id "$user" >/dev/null 2>&1 || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin "$user"
done
install -d -m 0755 /opt/podpivkovichi /opt/podpivkovichi/runtime/bin /opt/podpivkovichi/releases /usr/local/lib/podpivkovichi
# Independent copies: updates/removal of Signal's runtime cannot break this site.
cp -a /opt/signal/runtime/node-v24.19.0-linux-x64 /opt/podpivkovichi/runtime/node
install -m 0755 /opt/signal/runtime/bin/caddy /opt/podpivkovichi/runtime/bin/caddy
install -m 0755 /opt/signal/runtime/bin/livekit-server /opt/podpivkovichi/runtime/bin/livekit-server
install -d -o podpivkovichi -g podpivkovichi -m 0700 /var/lib/podpivkovichi
install -d -o podpivkovichi-build -g podpivkovichi-build -m 0750 /var/lib/podpivkovichi-build
python3 configure.py "$server_ip"
install -o root -g root -m 0755 update.sh /usr/local/lib/podpivkovichi/update.sh
install -o root -g root -m 0755 sync-tls.sh /usr/local/lib/podpivkovichi/sync-tls.sh
install -o root -g root -m 0644 systemd/* /etc/systemd/system/
/usr/local/lib/podpivkovichi/sync-tls.sh
systemctl daemon-reload
systemctl enable --now podpivkovichi-media
systemctl start podpivkovichi-update
systemctl enable --now podpivkovichi-app podpivkovichi-caddy podpivkovichi-update.timer podpivkovichi-tls.timer
curl --fail --silent "https://$server_ip:10443/api/health"
printf '\nInstalled: https://%s:10443\n' "$server_ip"
