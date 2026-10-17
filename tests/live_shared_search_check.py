#!/usr/bin/env python3
"""Checks the running aigw for chat-search leaks across users
(the deployment notes). Run as root on the host, after deploying aigw-backend or
aigw-gateway:

    sudo python3 tests/live_shared_search_check.py [--base https://<host>]

For every user with a running backend, and every viewer -> owner pair in
the gateway's shares index, it logs in as the viewer (aigw-mint-session-cookie) and searches the owner's logs through
the gateway with queries that match nearly everything, with and without a
forged X-Aigw-On-Behalf-Of header. Every hit must be a session whose
meta.json lists the viewer in shared_with. It also searches every other
user's logs as each viewer (only sessions shared with the viewer may appear) and the viewer's own logs
with a forged header (must be the viewer's own only). Read-only; exits 1 on
any leak.
"""
import argparse
import glob
import json
import os
import pwd
import re
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import quote

SHARES_INDEX = "/var/lib/aigw/shares.json"
MINT = "/usr/local/bin/aigw-mint-session-cookie"
QUERIES = ["e", "a", "の", "claude", "1"]
SESSION_ID_RE = re.compile(r"^[a-f0-9]{8,32}$")


def metas(user):
    """Every session meta of `user`, from any session root under their home."""
    home = pwd.getpwnam(user).pw_dir
    out = {}
    for p in glob.glob(os.path.join(home, "**", ".aigw", "*", "meta.json"), recursive=True):
        sid = os.path.basename(os.path.dirname(p))
        if not SESSION_ID_RE.match(sid):
            continue
        try:
            out[sid] = json.load(open(p))
        except (OSError, ValueError):
            continue
    return out


def shared_ids(owner, viewer):
    return {sid for sid, m in metas(owner).items()
            if isinstance(m.get("shared_with"), list) and viewer in m["shared_with"]}


def backend_users():
    out = subprocess.run(["systemctl", "list-units", "aigw-backend@*.service", "--no-legend",
                          "--state=active", "--plain"], capture_output=True, text=True).stdout
    return {m.group(1) for m in re.finditer(r"aigw-backend@([^.\s]+)\.service", out)}


def cookie(user):
    out = subprocess.run(["sudo", "-u", user, "sudo", "-n", MINT],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)["value"]


def search(base, ck, path, q, spoof=None):
    req = urllib.request.Request(f"{base}/agents/api{path}?q={quote(q)}")
    req.add_header("Cookie", f"aigw_session={ck}")
    if spoof:
        req.add_header("X-Aigw-On-Behalf-Of", spoof)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            r = json.load(resp)
    except urllib.error.HTTPError as e:
        return e.code, set()
    return 200, {h["session_id"] for h in r.get("hits", [])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=f"https://{socket.getfqdn()}")
    args = ap.parse_args()
    if os.geteuid() != 0:
        sys.exit("run as root (reads every owner's meta.json)")

    shares = json.load(open(SHARES_INDEX))  # viewer -> [owners]
    users = sorted(backend_users() | set(shares)
                   | {o for owners in shares.values() for o in owners})
    failures = []
    checked = 0

    def check(label, code, got, allowed):
        nonlocal checked
        checked += 1
        leak = got - allowed
        status = "LEAK" if leak else "ok"
        print(f"{status:4} {label}: HTTP {code}, {len(got)} sessions")
        if leak:
            failures.append(f"{label}: {sorted(leak)}")

    for viewer in users:
        owners = shares.get(viewer, [])
        try:
            ck = cookie(viewer)
        except (subprocess.CalledProcessError, KeyError, ValueError) as e:
            print(f"skip {viewer}: cannot mint a cookie ({e})")
            continue
        own = set(metas(viewer))
        for owner in sorted(set(owners)):
            allowed = shared_ids(owner, viewer)
            for q in QUERIES:
                for spoof in (None, owner):
                    code, got = search(args.base, ck, f"/shared/{owner}/search", q, spoof)
                    check(f"{viewer}->{owner} q={q!r} spoof={spoof}", code, got, allowed)
        for other in users:
            if other == viewer or other in owners:
                continue
            code, got = search(args.base, ck, f"/shared/{other}/search", "e")
            check(f"{viewer}->{other} (not shared)", code, got, shared_ids(other, viewer))
        for spoof in (None, *sorted(set(owners))):
            code, got = search(args.base, ck, "/search", "e", spoof)
            check(f"{viewer} own spoof={spoof}", code, got, own)

    print(f"\n{checked} checks, {len(failures)} leaks")
    if not checked:
        sys.exit("nothing was checked (empty shares index?)")
    if failures:
        print("\n".join(failures))
        sys.exit(1)


if __name__ == "__main__":
    main()
