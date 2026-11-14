#!/usr/bin/env python3
"""Google Calendar for the mail sandbox: list / show / create / update / delete / respond / busy.

Same arrangement as gmail.py (2026-10-17 user request):
the same OAuth "Web application" client, the same public redirect (https://<public host>/gdrive, as gmail.py)
proxied to a one-shot listener on 127.0.0.1:8766, so `login` runs on the host only.
The token is ~/.gcal/token.json in this directory, separate from Gmail's.

Account: the mailbox account (.gmail/account). If its calendar is shared with others, sensitive events
are created with --private (docs: calendar#visibility).
Invitations are not emailed unless --notify is given; that and delete need the user's confirmation.
"""
import argparse
import datetime as dt
import json
import os
import re
import socket
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# Site settings live in <this dir>/.config/mailbox/oauth.json (not in the code):
#   python      a Python that has the Google client libraries (re-exec'd into when they are missing here)
#   oauthClient the OAuth client file ({"web_client": {client_id, client_secret, public_host?}})
#   publicHost  the host the OAuth redirect comes back to ({hostname} = this machine's short name)
# $MAILBOX_DIR, $MAILBOX_PYTHON, $MAILBOX_OAUTH_CLIENT, $GDRIVE_PUBLIC_HOST override them.
# Not Path.home(): $HOME differs between the host and the container, while the directory holding
# this script is bind-mounted at the same path in both.
MAILBOX_DIR = Path(os.environ.get("MAILBOX_DIR") or Path(__file__).resolve().parent)
try:
    SITE = json.loads((MAILBOX_DIR / ".config" / "mailbox" / "oauth.json").read_text())
except (OSError, ValueError):
    SITE = {}
try:
    import google.oauth2.credentials  # noqa: F401
    os.environ.pop("_MAILBOX_REEXEC", None)
except ImportError:
    _py = os.environ.get("MAILBOX_PYTHON") or SITE.get("python")
    if _py and os.path.abspath(_py) != os.path.abspath(sys.executable) and not os.environ.get("_MAILBOX_REEXEC"):
        os.environ["_MAILBOX_REEXEC"] = "1"
        os.execv(_py, [_py] + sys.argv)
    sys.exit("Google client libraries not found. Set \"python\" in "
             f"{MAILBOX_DIR}/.config/mailbox/oauth.json to a Python that has them (or $MAILBOX_PYTHON).")
_client = os.environ.get("MAILBOX_OAUTH_CLIENT") or SITE.get("oauthClient", "")
CONFIG_PATH = Path(_client) if _client else None

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

TOKEN_PATH = MAILBOX_DIR / ".gcal" / "token.json"

AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
CALLBACK_BIND = ("127.0.0.1", 8766)
CALLBACK_TIMEOUT_SECONDS = 300

SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"]
def _account():
    # same address as gmail.py (.gmail/account); .gcal/account overrides
    for p in (MAILBOX_DIR / ".gcal" / "account", MAILBOX_DIR / ".gmail" / "account"):
        try:
            a = p.read_text().strip()
            if a:
                return a
        except OSError:
            pass
    return "your mailbox account"


ACCOUNT = _account()
TZ = "Asia/Tokyo"
JST = dt.timezone(dt.timedelta(hours=9))


# ---- login / token (as gmail.py) ----

class _CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        self.server.oauth = {k: (q.get(k) or [None])[0] for k in ("code", "state", "error")}
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(f"Login failed: {self.server.oauth['error']}".encode() if self.server.oauth["error"]
                         else b"Calendar login complete. You can close this window.")

    def log_message(self, *_args):
        pass


def _save_token(payload):
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(TOKEN_PATH.parent, 0o700)
    fd, tmp = tempfile.mkstemp(dir=TOKEN_PATH.parent, prefix=".token-", suffix=".json")
    with os.fdopen(fd, "w") as f:
        f.write(json.dumps(payload, indent=2))
    os.chmod(tmp, 0o600)
    os.replace(tmp, TOKEN_PATH)


def cmd_login(_args):
    if Path("/.dockerenv").exists():
        sys.exit("login must run on the host (the OAuth callback arrives on the host's 127.0.0.1:8766 via nginx).\n"
                 f"Run login on the host as this user: {MAILBOX_DIR}/gcal.py login")
    if not CONFIG_PATH or not CONFIG_PATH.exists():
        sys.exit(f"No OAuth client file: set \"oauthClient\" in {MAILBOX_DIR}/.config/mailbox/oauth.json.")
    cfg = json.loads(CONFIG_PATH.read_text())["web_client"]
    # same lookup as gmail.py's public_redirect_uri()
    host = os.environ.get("GDRIVE_PUBLIC_HOST") or cfg.get("public_host", "") or SITE.get("publicHost", "")
    if not host:
        try:
            host = json.loads((MAILBOX_DIR / ".config" / "mailbox" / "oauth.json").read_text()).get("publicHost", "")
        except (OSError, ValueError):
            host = ""
    if not host:
        sys.exit(f"No public host for the OAuth redirect. Write {{\"publicHost\": \"<host>\"}} to {MAILBOX_DIR}/.config/mailbox/oauth.json")
    redirect_uri = f"https://{host.replace('{hostname}', socket.gethostname().split('.')[0])}/gdrive"
    flow = Flow.from_client_config({"web": {"client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
                                            "auth_uri": AUTH_URI, "token_uri": TOKEN_URI,
                                            "redirect_uris": [redirect_uri]}}, scopes=SCOPES)
    flow.redirect_uri = redirect_uri
    auth_url, state = flow.authorization_url(access_type="offline", prompt="consent")
    print(f"Open this URL in any browser and approve access:\n\n{auth_url}\n\nSign in as {ACCOUNT}.\nWaiting...")
    srv = HTTPServer(CALLBACK_BIND, _CallbackHandler)
    srv.timeout = CALLBACK_TIMEOUT_SECONDS
    srv.oauth = {"code": None, "state": None, "error": None}
    srv.handle_request()
    srv.server_close()
    o = srv.oauth
    if o["error"] or not o["code"]:
        sys.exit(f"Login failed: {o['error'] or 'timed out'}")
    if o["state"] != state:
        sys.exit("OAuth state mismatch -- aborting.")
    flow.fetch_token(code=o["code"])
    c = flow.credentials
    _save_token({"access_token": c.token, "refresh_token": c.refresh_token, "client_id": cfg["client_id"],
                 "client_secret": cfg["client_secret"], "scopes": SCOPES})
    print(f"Logged in. Token saved to {TOKEN_PATH} (0600)")


def service():
    if not TOKEN_PATH.exists():
        sys.exit(f"Not logged in. Run on the host as this user: {MAILBOX_DIR}/gcal.py login")
    d = json.loads(TOKEN_PATH.read_text())
    creds = Credentials(token=d.get("access_token"), refresh_token=d.get("refresh_token"), token_uri=TOKEN_URI,
                        client_id=d.get("client_id"), client_secret=d.get("client_secret"), scopes=d.get("scopes", SCOPES))
    if not creds.valid:
        creds.refresh(GoogleAuthRequest())
        d["access_token"] = creds.token
        _save_token(d)
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _exec(req, tries=5):
    for k in range(tries):
        try:
            return req.execute()
        except HttpError as e:
            st = getattr(e.resp, "status", 0)
            if not (st in (429, 500, 502, 503, 504) or (st == 403 and b"ateLimitExceeded" in (e.content or b""))) or k == tries - 1:
                raise
            time.sleep(min(30, 2 ** k * 2))


# ---- time parsing: JST by default ----

def _dt(s, base=None):
    """'2026-10-19 13:00' / '10/19 13:00' / '13:00' (same day as base) / ISO with offset → aware datetime."""
    s = s.strip().replace("T", " ")
    m = re.fullmatch(r"(?:(\d{4})-)?(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})", s)
    if m:
        y = int(m[1]) if m[1] else dt.date.today().year
        return dt.datetime(y, int(m[2]), int(m[3]), int(m[4]), int(m[5]), tzinfo=JST)
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", s)
    if m and base:
        return base.replace(hour=int(m[1]), minute=int(m[2]))
    try:
        t = dt.datetime.fromisoformat(s)
        return t if t.tzinfo else t.replace(tzinfo=JST)
    except ValueError:
        sys.exit(f"cannot read time: {s!r} (e.g. '2026-10-19 13:00', '10/19 13:00', end '13:30' or '+30m')")


def _date(s):
    m = re.fullmatch(r"(?:(\d{4})-)?(\d{1,2})[-/](\d{1,2})", s.strip())
    if not m:
        sys.exit(f"cannot read date: {s!r} (e.g. 2026-10-19 or 10/19)")
    return dt.date(int(m[1]) if m[1] else dt.date.today().year, int(m[2]), int(m[3]))


def _end(s, start):
    m = re.fullmatch(r"\+(\d+)([mh])", s.strip())
    if m:
        return start + dt.timedelta(minutes=int(m[1]) * (60 if m[2] == "h" else 1))
    return _dt(s, start)


def _times(args, body, old=None):
    """Fill body.start/end from --start/--end/--all-day. old = the existing event (update)."""
    if args.all_day:
        d0 = _date(args.start)
        d1 = _date(args.end) if args.end else d0
        body["start"], body["end"] = {"date": d0.isoformat()}, {"date": (d1 + dt.timedelta(days=1)).isoformat()}  # end is exclusive
        return
    if args.start:
        st = _dt(args.start)
        if args.end:
            en = _end(args.end, st)
        elif old and "dateTime" in old.get("start", {}):  # keep the length
            en = st + (dt.datetime.fromisoformat(old["end"]["dateTime"]) - dt.datetime.fromisoformat(old["start"]["dateTime"]))
        else:
            en = st + dt.timedelta(hours=1)
        body["start"], body["end"] = {"dateTime": st.isoformat(), "timeZone": TZ}, {"dateTime": en.isoformat(), "timeZone": TZ}
    elif args.end:
        st = dt.datetime.fromisoformat(old["start"]["dateTime"]).astimezone(JST)
        body["end"] = {"dateTime": _end(args.end, st).isoformat(), "timeZone": TZ}


# ---- output ----

def _fmt_time(x):
    if "date" in x:
        return x["date"]
    return dt.datetime.fromisoformat(x["dateTime"]).astimezone(JST).strftime("%Y-%m-%d %H:%M")


def _ev(e, full=False):
    o = {"id": e["id"], "start": _fmt_time(e.get("start", {})), "end": _fmt_time(e.get("end", {})),
         "title": e.get("summary", ""), "location": e.get("location", ""),
         "visibility": e.get("visibility", "default"), "status": e.get("status")}
    if e.get("attendees"):
        me = [a for a in e["attendees"] if a.get("self")]
        if me:
            o["myResponse"] = me[0].get("responseStatus")
        o["attendees"] = len(e["attendees"]) if not full else [
            {"email": a.get("email"), "name": a.get("displayName"), "response": a.get("responseStatus")} for a in e["attendees"]]
    if e.get("organizer", {}).get("email") not in (None, ACCOUNT):
        o["organizer"] = e["organizer"].get("email")
    if e.get("recurringEventId"):
        o["recurringEventId"] = e["recurringEventId"]
    if full:
        o["description"] = e.get("description", "")
        o["hangoutLink"] = e.get("hangoutLink")
        o["recurrence"] = e.get("recurrence")
    o["link"] = e.get("htmlLink")
    return {k: v for k, v in o.items() if v not in (None, "", [])}


def _print(o):
    print(json.dumps(o, ensure_ascii=False))


# ---- commands ----

def cmd_whoami(_args):
    c = _exec(service().calendarList().get(calendarId="primary"))
    _print({"calendar": c["id"], "timeZone": c.get("timeZone"), "accessRole": c.get("accessRole"),
            "scopes": json.loads(TOKEN_PATH.read_text()).get("scopes"), "token_path": str(TOKEN_PATH)})


def cmd_calendars(_args):
    for c in _exec(service().calendarList().list()).get("items", []):
        _print({"id": c["id"], "name": c.get("summaryOverride") or c.get("summary"), "accessRole": c.get("accessRole"),
                "primary": c.get("primary", False)})


def cmd_list(args):
    t0 = dt.datetime.combine(_date(args.since) if args.since else dt.date.today(), dt.time(), JST)
    t1 = dt.datetime.combine(_date(args.until), dt.time(), JST) + dt.timedelta(days=1) if args.until else t0 + dt.timedelta(days=args.days)
    kw = {"calendarId": args.calendar, "timeMin": t0.isoformat(), "timeMax": t1.isoformat(), "singleEvents": True,
          "orderBy": "startTime", "maxResults": args.limit}
    if args.query:
        kw["q"] = args.query
    for e in _exec(service().events().list(**kw)).get("items", []):
        _print(_ev(e))


def cmd_show(args):
    print(json.dumps(_ev(_exec(service().events().get(calendarId=args.calendar, eventId=args.event_id)), full=True),
                     ensure_ascii=False, indent=2))


def _apply_fields(args, body):
    for k, f in (("summary", "title"), ("location", "location"), ("description", "description")):
        if getattr(args, f) is not None:
            body[k] = getattr(args, f)
    if args.private:
        body["visibility"] = "private"
    if args.public:
        body["visibility"] = "default"
    if args.free is not None:
        body["transparency"] = "transparent" if args.free else "opaque"


def _send_updates(args):
    return "all" if args.notify else "none"


def cmd_create(args):
    if not args.start:
        sys.exit("--start is required")
    body = {}
    _apply_fields(args, body)
    _times(args, body)
    if args.attendee:
        body["attendees"] = [{"email": a} for a in args.attendee]
    e = _exec(service().events().insert(calendarId=args.calendar, body=body, sendUpdates=_send_updates(args)))
    _print({"created": True, **_ev(e)})


def cmd_update(args):
    svc = service()
    old = _exec(svc.events().get(calendarId=args.calendar, eventId=args.event_id))
    body = {}
    _apply_fields(args, body)
    _times(args, body, old)
    if args.attendee or args.remove_attendee:
        cur = [a for a in old.get("attendees", []) if a.get("email") not in (args.remove_attendee or [])]
        have = {a.get("email") for a in cur}
        body["attendees"] = cur + [{"email": a} for a in (args.attendee or []) if a not in have]
    if not body:
        sys.exit("nothing to change")
    e = _exec(svc.events().patch(calendarId=args.calendar, eventId=args.event_id, body=body, sendUpdates=_send_updates(args)))
    _print({"updated": True, **_ev(e)})


def cmd_delete(args):
    svc = service()
    e = _exec(svc.events().get(calendarId=args.calendar, eventId=args.event_id))
    _exec(svc.events().delete(calendarId=args.calendar, eventId=args.event_id, sendUpdates=_send_updates(args)))
    _print({"deleted": True, **_ev(e)})


def cmd_respond(args):
    svc = service()
    e = _exec(svc.events().get(calendarId=args.calendar, eventId=args.event_id))
    att = e.get("attendees", [])
    me = [a for a in att if a.get("self")]
    if not me:
        sys.exit("you are not an attendee of this event")
    me[0]["responseStatus"] = args.response
    e = _exec(svc.events().patch(calendarId=args.calendar, eventId=args.event_id, body={"attendees": att},
                                 sendUpdates=_send_updates(args)))
    _print({"responded": args.response, **_ev(e)})


def cmd_busy(args):
    """Busy blocks (also of others whose calendars are visible to us) between the given days."""
    t0 = dt.datetime.combine(_date(args.since) if args.since else dt.date.today(), dt.time(), JST)
    t1 = dt.datetime.combine(_date(args.until), dt.time(), JST) + dt.timedelta(days=1) if args.until else t0 + dt.timedelta(days=args.days)
    ids = args.who or ["primary"]
    r = _exec(service().freebusy().query(body={"timeMin": t0.isoformat(), "timeMax": t1.isoformat(), "timeZone": TZ,
                                               "items": [{"id": i} for i in ids]}))
    for cid, v in r.get("calendars", {}).items():
        for b in v.get("busy", []):
            _print({"who": cid, "start": _fmt_time({"dateTime": b["start"]}), "end": _fmt_time({"dateTime": b["end"]})})
        for err in v.get("errors", []):
            _print({"who": cid, "error": err.get("reason")})


def main():
    ap = argparse.ArgumentParser(description=f"Google Calendar ({ACCOUNT}) for the mail sandbox. Times are JST.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("login", help="OAuth login (host only)").set_defaults(func=cmd_login)
    sub.add_parser("whoami", help="calendar and scopes of the token").set_defaults(func=cmd_whoami)
    sub.add_parser("calendars", help="calendars in the list").set_defaults(func=cmd_calendars)

    def cal(p):
        p.add_argument("-c", "--calendar", default="primary", help="calendar id (default primary)")

    def span(p):
        p.add_argument("--since", help="first day (default today), e.g. 10/19")
        p.add_argument("--until", help="last day (inclusive)")
        p.add_argument("--days", type=int, default=7, help="days from --since when --until is not given (default 7)")

    p = sub.add_parser("list", help="events (JSON lines), recurring ones expanded")
    cal(p); span(p)
    p.add_argument("-q", "--query", help="free text search")
    p.add_argument("-n", "--limit", type=int, default=100)
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("show", help="one event with description and attendees")
    cal(p)
    p.add_argument("event_id")
    p.set_defaults(func=cmd_show)

    def fields(p):
        p.add_argument("--title")
        p.add_argument("--start", help="'2026-10-19 13:00', '10/19 13:00'; with --all-day a date")
        p.add_argument("--end", help="'13:30' (same day), '+30m', '+2h', or a full time; with --all-day the last day")
        p.add_argument("--all-day", action="store_true")
        p.add_argument("--location")
        p.add_argument("--description")
        p.add_argument("--private", action="store_true", help="visibility private (sensitive events)")
        p.add_argument("--public", action="store_true", help="visibility back to default")
        p.add_argument("--free", dest="free", action="store_const", const=True, default=None, help="show as free")
        p.add_argument("--busy", dest="free", action="store_const", const=False, help="show as busy")
        p.add_argument("--attendee", action="append", help="email (repeatable)")
        p.add_argument("--notify", action="store_true", help="email the attendees (ask the user first)")

    p = sub.add_parser("create", help="new event (default 1 hour, not emailed)")
    cal(p); fields(p)
    p.set_defaults(func=cmd_create)

    p = sub.add_parser("update", help="change only the given fields (moving --start keeps the length)")
    cal(p); fields(p)
    p.add_argument("event_id")
    p.add_argument("--remove-attendee", action="append")
    p.set_defaults(func=cmd_update)

    p = sub.add_parser("delete", help="delete an event. Ask the user first.")
    cal(p)
    p.add_argument("event_id")
    p.add_argument("--notify", action="store_true")
    p.set_defaults(func=cmd_delete)

    p = sub.add_parser("respond", help="answer an invitation")
    cal(p)
    p.add_argument("event_id")
    p.add_argument("response", choices=["accepted", "declined", "tentative"])
    p.add_argument("--notify", action="store_true", help="tell the organizer (ask the user first)")
    p.set_defaults(func=cmd_respond)

    p = sub.add_parser("busy", help="busy blocks (free/busy) of you or others")
    span(p)
    p.add_argument("who", nargs="*", help="calendar ids / emails (default primary)")
    p.set_defaults(func=cmd_busy)

    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
