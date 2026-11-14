#!/usr/bin/env python3
"""Fake gmail.py for tests. No network. Logs each call to $FAKE_LOG.
As a script: link / list / archive / read / unarchive / show. As a module (ref-info.py, backfill.py): service() fails."""
import json, os, sys

def _log(args):
    p = os.environ.get("FAKE_LOG")
    if p:
        with open(p, "a") as f:
            f.write(json.dumps(["gmail.py"] + args) + "\n")

def thread_url(t, mobile=False):
    return f"https://mail.google.com/mail/mu/mp/39/#cv/all/{t}" if mobile else f"https://mail.google.com/mail/u/?authuser=test@example.com#all/FAKE{t}"

def thread_token(t):
    return "FAKE" + t

def service():
    raise RuntimeError("fake gmail: no network in tests")

if __name__ == "__main__":
    a = sys.argv[1:]
    _log(a)
    cmd = a[0] if a else ""
    if cmd == "link":
        for t in a[1:]:
            print(thread_url(t))
    elif cmd == "list":
        p = os.environ.get("FAKE_GMAIL_LIST")
        if p and os.path.exists(p):
            sys.stdout.write(open(p).read())
    elif cmd == "env-mailbox-dir":  # tests: what MAILBOX_DIR the caller passed
        print(os.environ.get("MAILBOX_DIR", ""))
    elif cmd in ("archive", "read", "unarchive"):
        for t in a[1:]:
            print(json.dumps({"ok": True, "thread": t}))
    else:
        sys.exit("fake gmail: unsupported " + cmd)
