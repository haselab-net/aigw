"""Read-only sharing and sharing with everyone (the deployment notes): a
reader gets the chat log, never the live screen or any action; a root shell
is only ever shared read-only; Email is never shared at all.

    python3 -m unittest discover -s tests -v
"""
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from test_shared_search import B

OWNER = B.getpass.getuser()
OTHER = "daemon" if OWNER != "daemon" else "bin"  # any real account but this one


class ShareReadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        stubs = {
            "session_roots": lambda: [self.root],
            # Always locked: `touch` says ok false, `status` unlocked false.
            "_unlockd_call": lambda verb, **fields: {"ok": verb == "status", "unlocked": False},
            "list_tmux_sessions": lambda: [],
            "list_host_tmux_sessions": lambda: [],
            "list_root_tmux_sessions": lambda: [],
            "ensure_watcher": lambda sid: None,
            "_load_links": lambda: {},
            "expire_links": lambda: None,
            "MAIL_PRESETS": {"mail-tui"},
        }
        self.saved = {name: getattr(B, name) for name in stubs}
        for name, value in stubs.items():
            setattr(B, name, value)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), B.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        for name, value in self.saved.items():
            setattr(B, name, value)
        self.tmp.cleanup()

    def make(self, sid, preset, location, **extra):
        d = self.root / sid
        d.mkdir()
        meta = {"id": sid, "label": sid, "preset": preset, "tmux_location": location,
                "stopped": True, **extra}
        (d / "meta.json").write_text(json.dumps(meta))
        (d / "events.jsonl").write_text(json.dumps(
            {"type": "agent_output", "seq": 1, "ts": 1, "text": "log"}) + "\n")
        return sid

    def meta(self, sid):
        return json.loads((self.root / sid / "meta.json").read_text())

    def call(self, method, path, viewer=None, body=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.server.server_port}{path}", method=method,
                                     data=json.dumps(body).encode() if body is not None else None)
        if viewer is not None:
            req.add_header("X-Aigw-On-Behalf-Of", viewer)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    # -- share_mode --
    def test_modes(self):
        self.assertEqual(B.share_mode({"preset": "shell", "shared_with": ["bob"]}, "bob"), "write")
        self.assertEqual(B.share_mode({"preset": "shell", "shared_read": ["bob"]}, "bob"), "read")
        self.assertEqual(B.share_mode({"preset": "shell", "shared_read": ["*"]}, "anyone"), "read")
        self.assertIsNone(B.share_mode({"preset": "shell", "shared_read": ["bob"]}, "bobby"))
        self.assertIsNone(B.share_mode({"preset": "shell", "shared_read": "*"}, "bob"))
        # A root shell shared before 2026-10-15 as co-working is read-only now.
        self.assertEqual(B.share_mode({"preset": "root-shell", "shared_with": ["bob"]}, "bob"), "read")
        # Email: never, even if meta says so (shared before 2026-10-15).
        self.assertIsNone(B.share_mode({"preset": "mail-tui", "shared_read": ["*", "bob"]}, "bob"))
        self.assertIsNone(B.share_mode({"preset": "mail-tui", "shared_with": ["bob"]}, "bob"))

    # -- share_session --
    def test_share_rules(self):
        root = self.make("bbbb000000000001", "root-shell", "root")
        mail = self.make("bbbb000000000002", "mail-tui", "host")
        shell = self.make("bbbb000000000003", "shell", "container")
        with self.assertRaises(ValueError):
            B.share_session(root, OTHER, mode="write")
        with self.assertRaises(ValueError):
            B.share_session(mail, "*", mode="read")
        with self.assertRaises(ValueError):
            B.share_session(mail, OTHER, mode="read")
        with self.assertRaises(ValueError):
            B.share_session(mail, OTHER, mode="write")
        with self.assertRaises(ValueError):
            B.share_session(shell, "*", mode="write")
        with self.assertRaises(ValueError):
            B.share_session(shell, "*", mode="admin")
        with self.assertRaises(ValueError):
            B.share_session(shell, OWNER, mode="read")
        B.share_session(root, "*", mode="read")
        self.assertEqual(self.meta(root)["shared_read"], ["*"])
        # One mode per person: switching moves them between the lists.
        B.share_session(shell, OTHER, mode="write")
        B.share_session(shell, OTHER, mode="read")
        m = self.meta(shell)
        self.assertEqual((m["shared_read"], m["shared_with"]), ([OTHER], []))
        B.unshare_session(shell, OTHER)
        self.assertEqual(self.meta(shell)["shared_read"], [])

    # -- what a reader can reach --
    def test_reader_gets_root_log_without_window_but_nothing_else(self):
        sid = self.make("bbbb000000000004", "root-shell", "root", shared_read=["*"])
        self.assertEqual(self.call("GET", f"/sessions/{sid}/events/page", "bob")[0], 200)
        self.assertEqual(self.call("GET", f"/sessions/{sid}/screen", "bob")[0], 403)
        for action in ("messages", "keys", "stop", "resize", "rename"):
            self.assertEqual(self.call("POST", f"/sessions/{sid}/{action}", "bob", {})[0], 403, action)
        status, body = self.call("GET", "/sessions", "bob")
        row = [s for s in body["sessions"] if s["id"] == sid][0]
        self.assertEqual(row["share_mode"], "read")
        self.assertEqual(row["label"], sid)  # not redacted: no window needed
        # The owner still needs their window.
        self.assertEqual(self.call("GET", f"/sessions/{sid}/events/page")[0], 403)

    def test_collaborator_on_host_still_needs_window(self):
        sid = self.make("bbbb000000000005", "host-shell", "host", shared_with=["bob"])
        self.assertEqual(self.call("GET", f"/sessions/{sid}/events/page", "bob")[0], 403)

    def test_everyone_share_reaches_strangers_read_only(self):
        sid = self.make("bbbb000000000006", "shell", "container", shared_read=["*"])
        self.assertEqual(self.call("GET", f"/sessions/{sid}/events/page", "carol")[0], 200)
        self.assertEqual(self.call("POST", f"/sessions/{sid}/messages", "carol", {"text": "x"})[0], 403)
        hits = B.search_events("log", "carol")["hits"]
        self.assertEqual({h["session_id"] for h in hits}, {sid})

    def test_share_route_takes_mode(self):
        sid = self.make("bbbb000000000007", "shell", "container")
        status, meta = self.call("POST", f"/sessions/{sid}/share", None, {"username": "*", "mode": "read"})
        self.assertEqual((status, meta.get("shared_read")), (200, ["*"]))
        self.assertEqual(self.call("POST", f"/sessions/{sid}/share", "bob", {"username": "*", "mode": "read"})[0], 403)


if __name__ == "__main__":
    unittest.main()
