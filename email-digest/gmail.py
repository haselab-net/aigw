#!/usr/bin/env python3
"""Gmail access for the mail sandbox: reading, plus archive / labels / read state / trash.

Uses an OAuth "Web application" client (oauthClient in .config/mailbox/oauth.json) and a
public redirect URI (https://<public host>/gdrive, see public_redirect_uri) terminated
by nginx and proxied to a one-shot listener on 127.0.0.1:8766.

Until 2026-10-09 this requested gmail.readonly only. It now requests
gmail.modify (user request: the claude.ai Gmail connector can already do all of
this, so no need to restrict the tool),
so the digest page can archive a thread the moment it is marked 既決.
gmail.modify cannot delete permanently. Sending (2026-10-26, user request) only sends a draft that already exists:
`send <draft id>` prints what would go out and stops; `send <draft id> --yes`
sends it. Use --yes only when the user has explicitly told you to send that
mail (only when the user explicitly asks to send).
`draft-attach` exists because
the connector can only attach a file whose base64 is written out inline in the
tool call, which goes wrong for anything but tiny files, so this adds files to
a draft (ours or the connector's).

A token made before that change still has gmail.readonly only: reading keeps
working, and the modify subcommands say to log in again.

The token lives in the mail sandbox directory (not ~/.gdrive), so only this
sandbox -- and the host user who owns it -- can reach the mailbox.

`login` must run on the host: the OAuth callback arrives on the host's
127.0.0.1:8766 via nginx, which a container cannot bind. Every other
subcommand works both on the host and inside the Email box,
where this directory is mounted at the same absolute path.
"""
import argparse
import base64
import email
import email.message
import email.policy
import email.utils
import hashlib
import html
import html.parser
import json
import mimetypes
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

ACCOUNT_PATH = MAILBOX_DIR / ".gmail" / "account"  # the logged-in address (written at login; used for links)
TOKEN_PATH = MAILBOX_DIR / ".gmail" / "token.json"

AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"

CALLBACK_BIND_HOST = "127.0.0.1"
CALLBACK_BIND_PORT = 8766
CALLBACK_TIMEOUT_SECONDS = 300

SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]
MODIFY_SCOPE = SCOPES[0]


def in_container():
    return Path("/.dockerenv").exists()


def load_config():
    if not CONFIG_PATH or not CONFIG_PATH.exists():
        sys.exit(f"No OAuth client file: set \"oauthClient\" in {MAILBOX_DIR}/.config/mailbox/oauth.json ({CONFIG_PATH or 'unset'}).")
    cfg = json.loads(CONFIG_PATH.read_text()).get("web_client")
    if not cfg:
        sys.exit(f"{CONFIG_PATH} has no 'web_client' entry.")
    return cfg


def public_redirect_uri():
    """OAuth のリダイレクト先(login のときだけ要る)。環境変数 GDRIVE_PUBLIC_HOST、OAuth クライアントの設定の
    web_client.public_host、~/.config/mailbox/oauth.json の publicHost の順に探す。{hostname} はこの機械の短いホスト名になる"""
    host = os.environ.get("GDRIVE_PUBLIC_HOST") or (load_config().get("public_host") if CONFIG_PATH and CONFIG_PATH.exists() else "") or SITE.get("publicHost", "")
    if not host:
        try:
            host = json.loads((MAILBOX_DIR / ".config" / "mailbox" / "oauth.json").read_text()).get("publicHost", "")
        except (OSError, ValueError):
            host = ""
    if not host:
        sys.exit("No public host for the OAuth redirect. Write {\"publicHost\": \"<host>\"} to "
                 f"{MAILBOX_DIR}/.config/mailbox/oauth.json (or set GDRIVE_PUBLIC_HOST).")
    return f"https://{host.replace('{hostname}', socket.gethostname().split('.')[0])}/gdrive"


class _CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        self.server.oauth_code = (params.get("code") or [None])[0]
        self.server.oauth_state = (params.get("state") or [None])[0]
        self.server.oauth_error = (params.get("error") or [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        if self.server.oauth_error:
            self.wfile.write(f"Login failed: {self.server.oauth_error}".encode())
        else:
            self.wfile.write(b"Gmail login complete. You can close this window.")

    def log_message(self, *_args):
        pass


def _wait_for_callback(expected_state):
    server = HTTPServer((CALLBACK_BIND_HOST, CALLBACK_BIND_PORT), _CallbackHandler)
    server.timeout = CALLBACK_TIMEOUT_SECONDS
    server.oauth_code = server.oauth_state = server.oauth_error = None
    server.handle_request()
    server.server_close()
    if server.oauth_error:
        sys.exit(f"Login failed: {server.oauth_error}")
    if server.oauth_code is None:
        sys.exit("Login timed out waiting for the browser redirect.")
    if server.oauth_state != expected_state:
        sys.exit("OAuth state mismatch (possible CSRF) -- aborting.")
    return server.oauth_code


def _save_token(payload):
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(TOKEN_PATH.parent, 0o700)
    # Write-then-rename: the digest server (archive on 既決) and the timer's check can refresh at the same
    # time, and a half-written token.json would log us out.
    fd, tmp = tempfile.mkstemp(dir=TOKEN_PATH.parent, prefix=".token-", suffix=".json")
    with os.fdopen(fd, "w") as f:
        f.write(json.dumps(payload, indent=2))
    os.chmod(tmp, 0o600)
    os.replace(tmp, TOKEN_PATH)


def cmd_login(_args):
    redirect_uri = public_redirect_uri()
    if in_container():
        sys.exit(
            "login must run on the host, not inside the sandbox: the OAuth callback\n"
            f"arrives on the host's {CALLBACK_BIND_HOST}:{CALLBACK_BIND_PORT} via nginx.\n"
            "Run `~/mailbox/gmail.py login` from a host shell, then come back here."
        )
    cfg = load_config()
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "auth_uri": AUTH_URI,
                "token_uri": TOKEN_URI,
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=SCOPES,
    )
    flow.redirect_uri = redirect_uri
    auth_url, state = flow.authorization_url(access_type="offline", prompt="consent")
    print("Open this URL in any browser and approve access:\n")
    print(auth_url)
    print("\nSign in as the mailbox account (the one all your addresses forward to), not another one.")
    print("Waiting for you to complete the login...")
    code = _wait_for_callback(state)
    flow.fetch_token(code=code)
    creds = flow.credentials
    _save_token(
        {
            "access_token": creds.token,
            "refresh_token": creds.refresh_token,
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "scopes": SCOPES,
        }
    )
    print(f"Logged in. Token saved to {TOKEN_PATH} (0600)")
    print("Account:", account(refresh=True))


def service():
    if not TOKEN_PATH.exists():
        sys.exit(f"Not logged in. Run on the host: ~/mailbox/gmail.py login  (expected {TOKEN_PATH})")
    data = json.loads(TOKEN_PATH.read_text())
    creds = Credentials(
        token=data.get("access_token"),
        refresh_token=data.get("refresh_token"),
        token_uri=TOKEN_URI,
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes", SCOPES),
    )
    if not creds.valid:
        creds.refresh(GoogleAuthRequest())
        data["access_token"] = creds.token
        _save_token(data)
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _retryable(e):
    if isinstance(e, (TimeoutError, ConnectionError, socket.timeout)):  # TLS handshake timeouts seen 2026-10-25
        return True
    if not isinstance(e, HttpError):
        return False
    status = getattr(e.resp, "status", 0)
    return status in (429, 500, 502, 503, 504) or (status == 403 and b"ateLimitExceeded" in (e.content or b""))


def _exec(req, tries=6):
    """req.execute(), waiting and retrying when Gmail's per-minute quota or a 5xx gets in the way."""
    for k in range(tries):
        try:
            return req.execute()
        except (HttpError, TimeoutError, ConnectionError, socket.timeout) as e:
            if not _retryable(e) or k == tries - 1:
                raise
            time.sleep(min(60, 2 ** k * 2))


def _batch_get(svc, make_req, ids, chunk=20):
    """Batch-fetch many items (messages/threads). Returns {id: response}. Failed ones are retried one by one."""
    out, failed = {}, []
    for i in range(0, len(ids), chunk):
        b = svc.new_batch_http_request()
        for x in ids[i:i + chunk]:
            b.add(make_req(x), callback=lambda rid, resp, err, x=x: (out.__setitem__(x, resp) if err is None else failed.append(x)))
        _exec(b)
    for x in failed:
        out[x] = _exec(make_req(x))
    return out


def _headers(msg, *names):
    want = {n.lower() for n in names}
    out = {}
    for h in msg.get("payload", {}).get("headers", []):
        if h["name"].lower() in want:
            out[h["name"].lower()] = h["value"]
    return out


def _walk(part, acc):
    acc.append(part)
    for sub in part.get("parts", []) or []:
        _walk(sub, acc)


def _decode(data):
    return base64.urlsafe_b64decode(data.encode()).decode("utf-8", "replace")


def cmd_whoami(_args):
    prof = _exec(service().users().getProfile(userId="me"))
    scopes = json.loads(TOKEN_PATH.read_text()).get("scopes", [])
    print(json.dumps({
        "emailAddress": prof.get("emailAddress"),
        "messagesTotal": prof.get("messagesTotal"),
        "threadsTotal": prof.get("threadsTotal"),
        "scopes": scopes,
        "token_path": str(TOKEN_PATH),
    }, ensure_ascii=False, indent=2))


def cmd_labels(_args):
    for lb in _exec(service().users().labels().list(userId="me")).get("labels", []):
        print(json.dumps({"id": lb["id"], "name": lb["name"], "type": lb.get("type")}, ensure_ascii=False))


def cmd_list(args):
    svc = service()
    kwargs = {"userId": "me", "maxResults": args.limit}
    if args.query:
        kwargs["q"] = args.query
    if args.label:
        kwargs["labelIds"] = args.label
    if args.page_token:
        kwargs["pageToken"] = args.page_token
    res = _exec(svc.users().messages().list(**kwargs))
    ids = [ref["id"] for ref in res.get("messages", [])]
    got = _batch_get(svc, lambda i: svc.users().messages().get(
        userId="me", id=i, format="metadata", metadataHeaders=["From", "To", "Subject", "Date"]), ids)
    for i in ids:
        msg = got[i]
        h = _headers(msg, "from", "to", "subject", "date")
        print(json.dumps({
            "id": msg["id"],
            "threadId": msg.get("threadId"),
            "date": h.get("date"),
            "from": h.get("from"),
            "to": h.get("to"),
            "subject": h.get("subject"),
            "snippet": msg.get("snippet"),
            "labelIds": msg.get("labelIds", []),
        }, ensure_ascii=False))
    if res.get("nextPageToken"):
        print(json.dumps({"nextPageToken": res["nextPageToken"]}), file=sys.stderr)


class _HtmlText(html.parser.HTMLParser):
    """HTML body -> readable text. Drops style/script/head and display:none (preheaders), keeps link URLs."""
    SKIP = {"style", "script", "head", "title", "noscript"}
    BLOCK = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol", "hr", "blockquote", "section"}
    VOID = {"br", "hr", "img", "meta", "link", "input", "col", "area", "base", "wbr", "source"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.href = [], [], None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag not in self.VOID:
            hidden = tag in self.SKIP or re.search(r"display\s*:\s*none", a.get("style") or "")
            if self.skip or hidden:
                self.skip.append(tag)
                return
        if self.skip:
            return
        if tag in self.BLOCK:
            self.out.append("\n")
        if tag == "li":
            self.out.append("- ")
        if tag == "a":
            self.href = a.get("href")

    def handle_endtag(self, tag):
        if self.skip:
            if tag in self.skip:
                while self.skip and self.skip.pop() != tag:
                    pass
            return
        if tag == "a" and self.href:
            if self.href.startswith("http") and len(self.href) <= 200:
                self.out.append(f" <{self.href}>")
            self.href = None
        if tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)

    def text(self):
        t = "".join(self.out).replace("\xa0", " ").replace("\u200c", "").replace("\u034f", "")
        t = re.sub(r"[ \t\r\f\v]+", " ", t)
        t = re.sub(r" *\n *", "\n", t)
        return re.sub(r"\n{3,}", "\n\n", t).strip()


def html_to_text(src):
    p = _HtmlText()
    p.feed(src)
    p.close()
    return p.text()


def _message_json(msg, allow_html):
    h = _headers(msg, "from", "to", "cc", "subject", "date", "message-id")
    parts = []
    _walk(msg.get("payload", {}), parts)
    body_plain, body_html, attachments = [], [], []
    for p in parts:
        mime = p.get("mimeType", "")
        body = p.get("body", {})
        if p.get("filename"):
            attachments.append({
                "filename": p["filename"],
                "mimeType": mime,
                "size": body.get("size"),
                "attachmentId": body.get("attachmentId"),
            })
        elif body.get("data"):
            if mime == "text/plain":
                body_plain.append(_decode(body["data"]))
            elif mime == "text/html":
                body_html.append(_decode(body["data"]))
    if body_plain:
        text = "\n".join(body_plain)
    elif body_html:
        text = "\n".join(body_html) if allow_html else "\n\n".join(html_to_text(b) for b in body_html)
    else:
        text = ""
    return {
        "id": msg["id"],
        "threadId": msg.get("threadId"),
        "date": h.get("date"),
        "from": h.get("from"),
        "to": h.get("to"),
        "cc": h.get("cc"),
        "subject": h.get("subject"),
        "labelIds": msg.get("labelIds", []),
        "body": text,
        "bodyIsHtml": not body_plain and bool(body_html) and allow_html,
        "hasHtmlOnly": not body_plain and bool(body_html),
        "attachments": attachments,
    }


def cmd_show(args):
    msg = _exec(service().users().messages().get(userId="me", id=args.message_id, format="full"))
    print(json.dumps(_message_json(msg, args.allow_html), ensure_ascii=False, indent=2))


def cmd_thread(args):
    """The whole conversation, oldest first. --max-body trims each body (quoted history makes them long)."""
    th = _exec(service().users().threads().get(userId="me", id=args.thread_id, format="full"))
    msgs = [_message_json(m, args.allow_html) for m in th.get("messages", [])]
    if args.max_body:
        for m in msgs:
            if len(m["body"]) > args.max_body:
                m["body"] = m["body"][:args.max_body] + f"\n…(以下 {len(m['body']) - args.max_body} 文字省略)"
    print(json.dumps({"threadId": th["id"], "link": thread_url(th["id"]), "messages": msgs}, ensure_ascii=False, indent=2))


# 6) Same URL the browser shows when the thread is open (#all/FMfcgz…): base64("f:<decimal thread id>")
# re-encoded from the 64-letter alphabet into Gmail's 40 consonants (reverse of ArsenalRecon/GmailURLDecoder).
_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
_RED = "BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz"
def account(refresh=False):
    """The mailbox address (for authuser= in links). Cached in .gmail/account; asked from Gmail when missing."""
    if not refresh:
        try:
            a = ACCOUNT_PATH.read_text().strip()
            if a:
                return a
        except OSError:
            pass
    try:
        a = service().users().getProfile(userId="me").execute()["emailAddress"]
    except Exception:
        return ""
    ACCOUNT_PATH.write_text(a + "\n")
    return a


def _rebase(s, a, b):
    n = 0
    for c in s:
        n = n * len(a) + a.index(c)
    out = ""
    while n:
        n, r = divmod(n, len(b))
        out = b[r] + out
    return out


def thread_token(thread_hex):
    return _rebase(base64.b64encode(f"f:{int(thread_hex, 16)}".encode()).decode().rstrip("="), _B64, _RED)


def thread_url(thread_hex, mobile=False):
    if mobile:  # phone browsers get redirected to /mail/mu/mp/, which drops #all/… and wants the hex id
        return f"https://mail.google.com/mail/mu/mp/39/#cv/all/{thread_hex}"
    return f"https://mail.google.com/mail/u/?authuser={account()}#all/{thread_token(thread_hex)}"


def cmd_link(args):
    for t in args.thread_ids:
        print(thread_url(t, args.mobile))


def cmd_attachment(args):
    att = _exec(service().users().messages().attachments().get(
        userId="me", messageId=args.message_id, id=args.attachment_id,
    ))
    dest = Path(args.dest)
    dest.write_bytes(base64.urlsafe_b64decode(att["data"].encode()))
    os.chmod(dest, 0o600)
    print(f"Saved {dest} ({dest.stat().st_size} bytes)")


def _modify_service():
    scopes = json.loads(TOKEN_PATH.read_text()).get("scopes", []) if TOKEN_PATH.exists() else []
    if MODIFY_SCOPE not in scopes:
        sys.exit("This token is read-only (made before gmail.modify was requested). Run on the host: ~/mailbox/gmail.py login")
    return service()


def _thread_labels(args, add=(), remove=()):
    """Add/remove labels on whole threads (what the Gmail UI does). One JSON line per thread."""
    svc = _modify_service()
    for t in args.thread_ids:
        try:
            _exec(svc.users().threads().modify(userId="me", id=t, body={"addLabelIds": list(add), "removeLabelIds": list(remove)}))
            print(json.dumps({"thread": t, "ok": True}))
        except Exception as e:  # keep going with the rest
            print(json.dumps({"thread": t, "ok": False, "error": str(e)[:300]}, ensure_ascii=False))


def cmd_archive(args):
    _thread_labels(args, remove=["INBOX"])


def cmd_unarchive(args):
    _thread_labels(args, add=["INBOX"])


def cmd_read(args):
    _thread_labels(args, remove=["UNREAD"])


def cmd_unread(args):
    _thread_labels(args, add=["UNREAD"])


def cmd_label(args):
    _thread_labels(args, add=args.add or [], remove=args.remove or [])


def cmd_trash(args):
    svc = _modify_service()
    for t in args.thread_ids:
        try:
            _exec((svc.users().threads().untrash if args.undo else svc.users().threads().trash)(userId="me", id=t))
            print(json.dumps({"thread": t, "ok": True, "trashed": not args.undo}))
        except Exception as e:  # keep going with the rest, same as _thread_labels
            print(json.dumps({"thread": t, "ok": False, "error": str(e)[:300]}, ensure_ascii=False))


def cmd_draft(args):
    """Create a draft (never sends). With --reply-to, it joins that message's thread and quotes it."""
    svc = _modify_service().users()
    msg = email.message.EmailMessage(policy=email.policy.default)
    body = Path(args.body_file).read_text() if args.body_file else sys.stdin.read()
    thread_id = None
    if args.reply_to:
        orig = _exec(svc.messages().get(userId="me", id=args.reply_to, format="full"))
        h = {x["name"].lower(): x["value"] for x in orig["payload"].get("headers", [])}
        thread_id = orig["threadId"]
        mid = h.get("message-id")
        if mid:
            msg["In-Reply-To"] = mid
            msg["References"] = (h.get("references", "") + " " + mid).strip()
        subj = h.get("subject", "")
        if not args.subject:
            args.subject = subj if subj.lower().startswith("re:") else "Re: " + subj
        if not args.to:
            args.to = [h.get("reply-to") or h.get("from")]
        if not args.no_quote:
            text = _message_json(orig, False)["body"]
            if text:
                quoted = "\n".join("> " + l for l in text.splitlines())
                body = body.rstrip("\n") + f"\n\nOn {h.get('date', '')}, {h.get('from', '')} wrote:\n{quoted}\n"
    if args.sender:
        aliases = {a["sendAsEmail"].lower(): a for a in _exec(svc.settings().sendAs().list(userId="me")).get("sendAs", [])}
        a = aliases.get(email.utils.parseaddr(args.sender)[1].lower())
        if not a:
            sys.exit("--from must be one of: " + ", ".join(sorted(aliases)))
        msg["From"] = args.sender if "<" in args.sender else (f'{a["displayName"]} <{a["sendAsEmail"]}>' if a.get("displayName") else a["sendAsEmail"])
    msg["To"] = ", ".join(args.to or [])
    if args.cc:
        msg["Cc"] = ", ".join(args.cc)
    msg["Subject"] = args.subject or ""
    msg.set_content(body)
    for f in args.attach or []:
        path = Path(f)
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        maintype, subtype = ctype.split("/", 1)
        msg.add_attachment(path.read_bytes(), maintype=maintype, subtype=subtype, filename=path.name)
    m = {"raw": base64.urlsafe_b64encode(msg.as_bytes()).decode()}
    if thread_id:
        m["threadId"] = thread_id
    r = _exec(svc.drafts().create(userId="me", body={"message": m}))
    print(json.dumps({"draft": r["id"], "messageId": r["message"]["id"], "threadId": r["message"].get("threadId"),
                      "from": msg["From"], "to": msg["To"], "cc": msg["Cc"], "subject": msg["Subject"]}, ensure_ascii=False))


def cmd_draft_attach(args):
    """Add local files to an existing draft (keeps its body, recipients and thread)."""
    drafts = _modify_service().users().drafts()
    d = _exec(drafts.get(userId="me", id=args.draft_id, format="raw"))
    msg = email.message_from_bytes(base64.urlsafe_b64decode(d["message"]["raw"]), policy=email.policy.default)
    if msg.get_content_type() != "multipart/mixed":
        # Move the existing body (text/plain or multipart/alternative) into a part of a new multipart/mixed.
        inner = email.message.EmailMessage(policy=email.policy.default)
        for k in ("Content-Type", "Content-Transfer-Encoding"):
            if msg[k]:
                inner[k] = msg[k]
        inner.set_payload(msg.get_payload())
        outer = email.message.EmailMessage(policy=email.policy.default)
        for k, v in msg.items():
            if k.lower() not in ("content-type", "content-transfer-encoding", "mime-version"):
                outer[k] = v
        outer.make_mixed()
        outer.attach(inner)
        msg = outer
    added = []
    for f in args.files:
        path = Path(f)
        data = path.read_bytes()
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        maintype, subtype = ctype.split("/", 1)
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=path.name)
        added.append({"file": path.name, "size": len(data), "md5": hashlib.md5(data).hexdigest()})
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    r = _exec(drafts.update(userId="me", id=args.draft_id,
                            body={"message": {"raw": raw, "threadId": d["message"].get("threadId")}}))
    print(json.dumps({"draft": r["id"], "messageId": r["message"]["id"], "added": added}, ensure_ascii=False))


def cmd_send(args):
    """Send an existing draft. Without --yes, only show what would be sent (nothing leaves)."""
    drafts = _modify_service().users().drafts()
    d = _exec(drafts.get(userId="me", id=args.draft_id, format="raw"))
    msg = email.message_from_bytes(base64.urlsafe_b64decode(d["message"]["raw"]), policy=email.policy.default)
    body = msg.get_body(preferencelist=("plain", "html"))
    text = body.get_content() if body else ""
    info = {"draft": args.draft_id, "threadId": d["message"].get("threadId"), "from": msg["From"], "to": msg["To"],
            "cc": msg["Cc"], "bcc": msg["Bcc"], "subject": msg["Subject"],
            "attachments": [{"file": a.get_filename(), "size": len(a.get_payload(decode=True) or b"")} for a in msg.iter_attachments()],
            "body_head": text[:600]}
    if not args.yes:
        print(json.dumps({**info, "sent": False, "note": "not sent; use --yes only when the user has explicitly told you to send this mail"}, ensure_ascii=False, indent=1))
        return
    if not (msg["To"] or msg["Cc"] or msg["Bcc"]):
        sys.exit("draft has no recipients")
    r = _exec(drafts.send(userId="me", body={"id": args.draft_id}), tries=1)  # no retry: a retried send could go out twice
    print(json.dumps({"sent": True, "messageId": r["id"], "threadId": r.get("threadId"), "to": msg["To"], "subject": msg["Subject"]},
                     ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(description="Gmail access for the mail sandbox (gmail.modify; sends only drafts, with --yes; no permanent delete).")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("login", help="OAuth login (host only)").set_defaults(func=cmd_login)
    sub.add_parser("whoami", help="which Gmail account this token belongs to").set_defaults(func=cmd_whoami)
    sub.add_parser("labels", help="list labels").set_defaults(func=cmd_labels)

    p = sub.add_parser("list", help="list messages (JSON lines)")
    p.add_argument("-q", "--query", help='Gmail search query, e.g. "from:foo newer_than:7d"')
    p.add_argument("-l", "--label", action="append", help="label id (repeatable), e.g. INBOX")
    p.add_argument("-n", "--limit", type=int, default=20)
    p.add_argument("--page-token", help="continue from the nextPageToken printed on stderr")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("show", help="show one message with decoded body")
    p.add_argument("message_id")
    p.add_argument("--allow-html", action="store_true", help="when there is no text/plain part, show the raw HTML instead of the text converted from it")
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("thread", help="show a whole thread (all messages, oldest first)")
    p.add_argument("thread_id")
    p.add_argument("--allow-html", action="store_true", help="raw HTML instead of converted text for HTML-only messages")
    p.add_argument("--max-body", type=int, default=0, help="trim each body to N chars (0 = no limit)")
    p.set_defaults(func=cmd_thread)

    p = sub.add_parser("link", help="Gmail URL for threads (same as the browser shows); --mobile for phone browsers")
    p.add_argument("thread_ids", nargs="+")
    p.add_argument("--mobile", action="store_true")
    p.set_defaults(func=cmd_link)

    p = sub.add_parser("attachment", help="download an attachment")
    p.add_argument("message_id")
    p.add_argument("attachment_id")
    p.add_argument("dest")
    p.set_defaults(func=cmd_attachment)

    for name, fn, hlp in [("archive", cmd_archive, "remove INBOX from threads"),
                          ("unarchive", cmd_unarchive, "put threads back in INBOX"),
                          ("read", cmd_read, "mark threads read"),
                          ("unread", cmd_unread, "mark threads unread")]:
        p = sub.add_parser(name, help=hlp)
        p.add_argument("thread_ids", nargs="+")
        p.set_defaults(func=fn)

    p = sub.add_parser("label", help="add/remove label ids on threads (ids from `labels`)")
    p.add_argument("thread_ids", nargs="+")
    p.add_argument("--add", action="append", help="label id to add (repeatable)")
    p.add_argument("--remove", action="append", help="label id to remove (repeatable)")
    p.set_defaults(func=cmd_label)

    p = sub.add_parser("trash", help="move threads to trash (--undo to restore). Ask the user first.")
    p.add_argument("thread_ids", nargs="+")
    p.add_argument("--undo", action="store_true")
    p.set_defaults(func=cmd_trash)

    p = sub.add_parser("draft", help="create a draft (no send); body from --body-file or stdin")
    p.add_argument("--to", action="append", help="recipient (repeatable); defaults to the sender of --reply-to")
    p.add_argument("--cc", action="append")
    p.add_argument("--subject")
    p.add_argument("--body-file")
    p.add_argument("--reply-to", help="message id to reply to (same thread, Re: subject, quoted)")
    p.add_argument("--no-quote", action="store_true", help="with --reply-to, do not quote the original")
    p.add_argument("--attach", action="append", help="local file (repeatable)")
    p.add_argument("--from", dest="sender", help="send-as address (one of the account's aliases)")
    p.set_defaults(func=cmd_draft)

    p = sub.add_parser("draft-attach", help="add local files to an existing draft (draft id from the connector, r-...)")
    p.add_argument("draft_id")
    p.add_argument("files", nargs="+")
    p.set_defaults(func=cmd_draft_attach)

    p = sub.add_parser("send", help="send a draft. Without --yes it only shows what would go out. --yes only on the user's explicit instruction to send.")
    p.add_argument("draft_id")
    p.add_argument("--yes", action="store_true", help="really send")
    p.set_defaults(func=cmd_send)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
