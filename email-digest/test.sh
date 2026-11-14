#!/bin/sh
# All email-digest tests (fake data only): sh test.sh   (from email-digest/)
#   UPDATE_GOLDEN=1 sh test.sh   re-take the private golden files from the current code (only before the split)
#   KEEP_TMP=1                   keep the throw-away boxes
# Private tests (digest/private/test/) run when that folder exists; in the public copy only test/ runs.
cd "$(dirname "$0")" || exit 1
export PYTHONDONTWRITEBYTECODE=1
export TEST_TMP=${TEST_TMP:-$(mktemp -d)}; mkdir -p "$TEST_TMP"
rc=0
set -- test/*.test.mjs
[ -d digest/private/test ] && set -- "$@" digest/private/test/*.test.mjs
node --test --test-concurrency=4 "$@" || rc=1
python3 -m unittest discover -s test -p 'test_*.py' || rc=1
[ -d digest/private/test ] && ls digest/private/test/test_*.py >/dev/null 2>&1 && { python3 -m unittest discover -s digest/private/test -p 'test_*.py' || rc=1; }
[ -n "$KEEP_TMP" ] || rm -rf "$TEST_TMP"
exit $rc
