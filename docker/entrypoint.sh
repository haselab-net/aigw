#!/bin/sh
# Starts the demo's three processes (docker/README.md) and stops the container
# when any of them exits:
#   aigw-backend  as the demo user, on /run/aigw-backend/<user>-backend.sock
#   socat         root, /run/aigw-backend/<port>.sock (owner aigw) -> that socket.
#                 A real deployment does this with systemd socket activation
#                 and aigw-proxy-handler (README "ソケットアクティベーション").
#   aigw-gateway  as aigw, on 0.0.0.0:8878 inside the container
set -eu
user="${AIGW_DEMO_USER:?}"
uid=$(id -u "$user")
port=$((21000 + uid - 1000))
home=$(getent passwd "$user" | cut -d: -f6)

# Cookie signing key: new per container unless one is mounted.
if [ ! -s /etc/aigw/cookie_secret ]; then
  head -c 32 /dev/urandom | base64 > /etc/aigw/cookie_secret
fi
chown aigw:aigw /etc/aigw/cookie_secret; chmod 600 /etc/aigw/cookie_secret

install -d -m 1777 /run/aigw-backend          # as etc/tmpfiles.d/aigw-backend.conf
rm -f "/run/aigw-backend/$user-backend.sock" "/run/aigw-backend/$port.sock"
install -d -o "$user" -g "$user" "$home/sandhome"

setpriv --reuid="$user" --regid="$user" --init-groups \
  env -i HOME="$home" USER="$user" LOGNAME="$user" PATH=/usr/local/bin:/usr/bin:/bin \
      LANG=C.UTF-8 TERM=xterm-256color AIGW_NOTIFY_HOST=127.0.0.1 /usr/local/sbin/aigw-backend &
backend=$!
i=0
while [ ! -S "/run/aigw-backend/$user-backend.sock" ]; do
  i=$((i + 1)); [ $i -gt 100 ] && { echo "aigw-demo: backend did not start" >&2; exit 1; }
  kill -0 $backend 2>/dev/null || { echo "aigw-demo: backend exited" >&2; exit 1; }
  sleep 0.1
done

socat "UNIX-LISTEN:/run/aigw-backend/$port.sock,fork,user=aigw,group=aigw,mode=600" \
      "UNIX-CONNECT:/run/aigw-backend/$user-backend.sock" &
relay=$!

setpriv --reuid=aigw --regid=aigw --init-groups \
  env -i HOME=/nonexistent PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 \
      AIGW_GATEWAY_HOST=0.0.0.0 AIGW_DEMO_USER="$user" /usr/local/sbin/aigw-gateway &
gateway=$!

echo "aigw-demo: open http://localhost:<published port>/agents/ (user $user)"
trap 'kill $backend $relay $gateway 2>/dev/null' INT TERM
# busybox/dash have no `wait -n`: poll until one of them is gone.
while kill -0 $backend 2>/dev/null && kill -0 $relay 2>/dev/null && kill -0 $gateway 2>/dev/null; do
  sleep 1
done
echo "aigw-demo: a process exited; stopping" >&2
kill $backend $relay $gateway 2>/dev/null || true
exit 1
