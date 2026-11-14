#!/bin/sh
# Generic stub for box tools (claude, uuidgen, curl, ...). Logs argv as one JSON line to $FAKE_LOG.
n=$(basename "$0")
node -e 'const fs=require("fs");fs.appendFileSync(process.env.FAKE_LOG,JSON.stringify(process.argv.slice(1))+"\n")' "$n" "$@"
case "$n" in
  uuidgen) echo 00000000-0000-4000-8000-000000000000 ;;
  # the digest page answers (start.sh sees it running); anything else (a browser debug port) is down
  curl) case "$*" in *:9100/*|*:${DIGEST_PORT:-9100}/*) exit 0 ;; *) exit 7 ;; esac ;;
esac
exit 0
