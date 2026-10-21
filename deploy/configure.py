#!/usr/bin/env python3
"""Create only Podpivkovichi configuration; never edit Signal or VPN settings."""
import os, secrets, pathlib, pwd, grp, json, sys, ipaddress
server_ip = str(ipaddress.IPv4Address(sys.argv[1]))
base=pathlib.Path('/etc/podpivkovichi')
base.mkdir(mode=0o755,exist_ok=True)
env=base/'app.env'
if not env.exists():
    password=secrets.token_urlsafe(32); key='PP'+secrets.token_hex(10); secret=secrets.token_hex(32)
    values={'NODE_ENV':'production','HOST':'127.0.0.1','PORT':'3100','TRUST_PROXY':'1','SERVER_IP':server_ip,'APP_ORIGIN':f'https://{server_ip}:10443','DATA_DIR':'/var/lib/podpivkovichi','ADMIN_USERNAME':'admin','ADMIN_PASSWORD':password,'LIVEKIT_URL':'http://127.0.0.1:7890','LIVEKIT_PUBLIC_URL':f'wss://{server_ip}:10443','LIVEKIT_API_KEY':key,'LIVEKIT_API_SECRET':secret,'PUBLIC_LOBBY':'1'}
    env.write_text(''.join(f'{k}={v}\n' for k,v in values.items()))
    env.chmod(0o600)
else:
    values=dict(line.split('=',1) for line in env.read_text().splitlines() if '=' in line and not line.startswith('#'))
media=base/'livekit.yaml'
media.write_text(f'''port: 7890
bind_addresses:
  - 127.0.0.1
rtc:
  tcp_port: 7891
  udp_port: 7892-7893
  use_external_ip: false
  node_ip: {server_ip}
  congestion_control:
    enabled: true
room:
  auto_create: false
  max_participants: 10
  empty_timeout: 300
  departure_timeout: 20
keys:
  {values['LIVEKIT_API_KEY']}: {values['LIVEKIT_API_SECRET']}
logging:
  level: warn
''')
os.chown(media,0,grp.getgrnam('podpivkovichi-media').gr_gid);media.chmod(0o640)
caddy=base/'Caddyfile'
caddy.write_text('''{
  admin off
  auto_https off
  servers {
    protocols h1 h2
  }
}
https://PUBLIC_ENDPOINT {
  tls /etc/podpivkovichi/tls/site.crt /etc/podpivkovichi/tls/site.key
  encode zstd gzip
  @internal path /internal /internal/*
  handle @internal {
    respond 404
  }
  @rtc path /rtc /rtc/*
  handle @rtc {
    forward_auth 127.0.0.1:3100 {
      uri /internal/media-access
      header_up -Connection
      header_up -Upgrade
    }
    reverse_proxy 127.0.0.1:7890
  }
  @api path /twirp/*
  handle @api {
    reverse_proxy 127.0.0.1:7890
  }
  handle {
    reverse_proxy 127.0.0.1:3100
  }
}
'''.replace('PUBLIC_ENDPOINT', f'{server_ip}:10443'))
os.chown(caddy,0,grp.getgrnam('podpivkovichi-caddy').gr_gid);caddy.chmod(0o640)
print('Podpivkovichi configured. Credentials are in /etc/podpivkovichi/app.env (root only).')
