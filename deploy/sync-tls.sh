#!/bin/bash
set -euo pipefail
# Read the existing IP certificate. Do not change Signal ACME state or bind port 80.
server_ip=$(sed -n 's/^SERVER_IP=//p' /etc/podpivkovichi/app.env)
[[ "$server_ip" =~ ^[0-9]+(\.[0-9]+){3}$ ]] || exit 1
src=/var/lib/signal-caddy/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$server_ip
dest=/etc/podpivkovichi/tls
install -d -o root -g podpivkovichi-caddy -m 0750 "$dest"
test -s "$src/$server_ip.crt"
test -s "$src/$server_ip.key"
openssl x509 -in "$src/$server_ip.crt" -noout -checkend 21600 >/dev/null
if ! cmp -s "$src/$server_ip.crt" "$dest/site.crt"; then
  install -o root -g podpivkovichi-caddy -m 0640 "$src/$server_ip.crt" "$dest/site.crt.new"
  install -o root -g podpivkovichi-caddy -m 0640 "$src/$server_ip.key" "$dest/site.key.new"
  mv "$dest/site.key.new" "$dest/site.key"
  mv "$dest/site.crt.new" "$dest/site.crt"
  /opt/podpivkovichi/runtime/bin/caddy validate --config /etc/podpivkovichi/Caddyfile --adapter caddyfile >/dev/null
  if systemctl is-active --quiet podpivkovichi-caddy; then systemctl kill --kill-whom=main --signal=SIGUSR1 podpivkovichi-caddy; fi
fi
