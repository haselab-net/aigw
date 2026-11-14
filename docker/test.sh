#!/bin/sh
# End-to-end check of the Docker demo: build the image, start it on a free
# loopback port, log in as the demo user, start a shell session, type into
# it and read the screen back; then start a Claude Code session and see its
# first screen. Removes the container afterwards (the image stays).
#   docker/test.sh                # from the repository root
#   WITH_CLAUDE=0 docker/test.sh  # without Claude Code in the image (faster)
set -eu
cd "$(dirname "$0")/.."
img=aigw-demo:test
name=aigw-demo-test-$$
with_claude=${WITH_CLAUDE:-1}
fail() { echo "FAIL: $*" >&2; docker logs "$name" 2>&1 | tail -20 >&2; exit 1; }
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker build -q --build-arg WITH_CLAUDE="$with_claude" -f docker/Dockerfile -t "$img" . >/dev/null
docker run -d --name "$name" -p 127.0.0.1::8878 "$img" >/dev/null
port=$(docker port "$name" 8878/tcp | sed -n 's/^127\.0\.0\.1://p' | head -1)
base="http://127.0.0.1:$port/agents"
i=0
until curl -fs -m 2 -o /dev/null "$base/"; do
  i=$((i + 1)); [ $i -gt 50 ] && fail "gateway did not answer"; sleep 0.2
done

page=$(curl -fs -m 5 "$base/")
echo "$page" | grep -q 'demo-login' || fail "logged-out page has no demo login"

cookie=$(curl -s -m 5 -D - -o /dev/null "$base/demo-login" | tr -d '\r' \
         | sed -n 's/^[Ss]et-[Cc]ookie: \(aigw_session=[^;]*\).*/\1/p')
[ -n "$cookie" ] || fail "demo-login gave no session cookie"
api() { curl -fs -m 30 -H "Cookie: $cookie" -H 'Content-Type: application/json' "$@"; }
json() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

[ "$(api "$base/api/me" | json '["username"]')" = demo ] || fail "/api/me is not the demo user"

sid=$(api -d '{"preset":"shell","label":"e2e"}' "$base/api/sessions" | json '["id"]')
api -d '{"text":"echo e2e-$((6*7)) $(id -un)"}' "$base/api/sessions/$sid/messages" >/dev/null
i=0
until api "$base/api/sessions/$sid/screen" | json '["text"]' | grep -q 'e2e-42 demo'; do
  i=$((i + 1)); [ $i -gt 50 ] && fail "the shell did not echo back"; sleep 0.2
done
[ "$(api "$base/api/sessions" | json '["sessions"].__len__()')" = 1 ] || fail "session list"
echo "ok: login, shell session, input and screen"

if [ "$with_claude" = 1 ]; then
  cid=$(api -d '{"preset":"claude-tui","label":"cc"}' "$base/api/sessions" | json '["id"]')
  i=0
  until api "$base/api/sessions/$cid/screen" | json '["text"]' | grep -qi 'claude\|theme\|style'; do
    i=$((i + 1)); [ $i -gt 100 ] && fail "Claude Code did not draw its first screen"; sleep 0.3
  done
  echo "ok: Claude Code session started"
fi
echo "PASS"
