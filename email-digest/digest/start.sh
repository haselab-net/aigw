#!/bin/sh
# まとめビューア(port 9100、DIGEST_PORT で変えられる)が止まっていれば起動
# AIGW_BOX_TAG を外して setsid するのは、起動したセッションが終わったとき sandbox box に一緒に片付けられないため
# --fg: ホストの systemd から docker exec で常駐させるとき用(前面で動かし、落ちたら systemd が再起動)
# 起動の前に、Claude が読む文書(PROCEDURE.md・CLAUDE.md)を DATA に組み立てる(compose.mjs。失敗してもページは起動する)
cd "$(dirname "$0")" || exit 1
DATA=${DIGEST_DATA:-$(pwd)}
node compose.mjs >> "$DATA/server.log" 2>&1
[ "$1" = "--fg" ] && exec env -u AIGW_BOX_TAG node server.mjs
curl -s -m 2 -o /dev/null "http://127.0.0.1:${DIGEST_PORT:-9100}/" 2>/dev/null && exit 0
env -u AIGW_BOX_TAG setsid -f node server.mjs >> "$DATA/server.log" 2>&1 </dev/null; sleep 1; tail -1 "$DATA/server.log"
