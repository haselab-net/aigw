"""Chat search must never return a log the caller could not open
(the deployment notes). Run after any change to aigw-backend:

    python3 -m unittest discover -s tests -v

Needs nothing but python3: aigw-backend is loaded as a module, its session
roots point at a temporary directory, and aigw-unlockd is replaced by a
stub. The same checks against the running service are in
live_shared_search_check.py.
"""
import importlib.machinery
import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote

BACKEND = Path(__file__).resolve().parent.parent / "bin" / "aigw-backend"


def load_backend():
    loader = importlib.machinery.SourceFileLoader("aigw_backend_under_test", str(BACKEND))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


B = load_backend()

WORD = "needle"
# session id -> (shared_with, tmux_location)
SESSIONS = {
    "aaaa000000000001": (["bob"], "container"),
    "aaaa000000000002": (["bob", "carol"], "container"),
    "aaaa000000000003": ([], "container"),
    "aaaa000000000004": (["carol"], "container"),
    "aaaa000000000005": (["bob"], "host"),   # shared, but behind a passkey
    "aaaa000000000006": (["bob"], "root"),
    "aaaa000000000007": ("bobby", "container"),  # malformed: not a list
    "aaaa000000000008": (None, "container"),
}


class SharedSearchTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for sid, (shared_with, location) in SESSIONS.items():
            self.make_session(sid, shared_with, location)
        # Not a session id: must be ignored even though it matches.
        self.make_session("not-a-session", ["bob"], "container")
        self.unlocked_tier = None
        # Everything list_sessions would otherwise ask tmux/docker or start.
        stubs = {
            "session_roots": lambda: [self.root],
            "_unlockd_call": self.fake_unlockd,
            "list_tmux_sessions": lambda: [],
            "list_host_tmux_sessions": lambda: [],
            "list_root_tmux_sessions": lambda: [],
            "ensure_watcher": lambda sid: None,
            "_load_links": lambda: {},
            "expire_links": lambda: None,
        }
        self.saved = {name: getattr(B, name) for name in stubs}
        for name, fn in stubs.items():
            setattr(B, name, fn)

    def tearDown(self):
        for name, fn in self.saved.items():
            setattr(B, name, fn)
        self.tmp.cleanup()

    def fake_unlockd(self, verb, **fields):
        self.assertEqual(verb, "status", "search must not extend the window")
        if self.unlocked_tier is None:
            return {"ok": True, "unlocked": False}
        return {"ok": True, "unlocked": True, "tier": self.unlocked_tier}

    def make_session(self, sid, shared_with, location):
        d = self.root / sid
        d.mkdir()
        meta = {"id": sid, "label": sid, "preset": "shell", "tmux_location": location}
        if shared_with is not None:
            meta["shared_with"] = shared_with
        (d / "meta.json").write_text(json.dumps(meta))
        events = [
            {"type": "user_message", "seq": 1, "ts": 1, "text": f"{WORD} in {sid}"},
            {"type": "agent_output", "seq": 2, "ts": 2, "text": f"日本語の{WORD}も {sid}"},
        ]
        (d / "events.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))

    def found(self, on_behalf_of, query=WORD):
        r = B.search_events(query, on_behalf_of)
        return {h["session_id"] for h in r["hits"]}, r["locked"]

    def test_owner_sees_own_ungated_sessions(self):
        ids, locked = self.found(None)
        self.assertEqual(ids, {s for s, (_, loc) in SESSIONS.items() if loc == "container"})
        self.assertEqual(locked, 2)

    def test_collaborator_sees_only_sessions_shared_with_them(self):
        self.assertEqual(self.found("bob"), ({"aaaa000000000001", "aaaa000000000002"}, 2))
        self.assertEqual(self.found("carol"), ({"aaaa000000000002", "aaaa000000000004"}, 0))

    def test_stranger_sees_nothing(self):
        for who in ("dave", "", "bo", "bobby", "Bob", "bob "):
            self.assertEqual(self.found(who), (set(), 0), who)

    def test_query_that_matches_everything_still_filtered(self):
        for q in ("a", "0", "の", '"', "\\", "type"):
            ids, _ = self.found("bob", q)
            self.assertLessEqual(ids, {"aaaa000000000001", "aaaa000000000002"}, q)

    def test_unshare_takes_effect_on_next_search(self):
        meta_path = self.root / "aaaa000000000001" / "meta.json"
        meta = json.loads(meta_path.read_text())
        meta["shared_with"] = []
        meta_path.write_text(json.dumps(meta))
        self.assertEqual(self.found("bob")[0], {"aaaa000000000002"})

    def test_gated_shared_sessions_need_the_window(self):
        self.unlocked_tier = "host"
        self.assertEqual(self.found("bob"),
                         ({"aaaa000000000001", "aaaa000000000002", "aaaa000000000005"}, 1))
        self.unlocked_tier = "root"
        self.assertEqual(self.found("bob"),
                         ({"aaaa000000000001", "aaaa000000000002",
                           "aaaa000000000005", "aaaa000000000006"}, 0))
        # The window never widens the sharing.
        self.assertEqual(self.found("dave"), (set(), 0))

    def test_is_shared_with_rejects_non_lists(self):
        self.assertTrue(B.is_shared_with({"shared_with": ["bob"]}, "bob"))
        for sw in ("bobby", "bob", None, {"bob": 1}, 1):
            self.assertFalse(B.is_shared_with({"shared_with": sw}, "bob"), sw)
        self.assertFalse(B.is_shared_with({}, "bob"))

    def test_open_and_list_use_the_same_check(self):
        for sid, (shared_with, location) in SESSIONS.items():
            meta, err = B.resolve_session_access(sid, "dave")
            self.assertIsNone(meta, sid)
            self.assertEqual(err[0], 404)
        listed = {m["id"] for m in B.list_sessions("bob") if m["id"] in SESSIONS}
        self.assertEqual(listed, {"aaaa000000000001", "aaaa000000000002",
                                  "aaaa000000000005", "aaaa000000000006"})


class SearchRouteTest(SharedSearchTest):
    """The same filter reached the way aigw-gateway reaches it: GET /search
    with X-Aigw-On-Behalf-Of."""

    def setUp(self):
        super().setUp()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), B.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        super().tearDown()

    def found(self, on_behalf_of, query=WORD):
        url = f"http://127.0.0.1:{self.server.server_port}/search?q={quote(query)}"
        req = urllib.request.Request(url)
        if on_behalf_of is not None:
            req.add_header("X-Aigw-On-Behalf-Of", on_behalf_of)
        with urllib.request.urlopen(req) as resp:
            r = json.load(resp)
        return {h["session_id"] for h in r["hits"]}, r["locked"]

    def test_stranger_sees_nothing(self):
        # An empty header means "no on-behalf-of" (the owner's own request),
        # which only the owner's own processes can send; skip it here.
        for who in ("dave", "bo", "bobby", "Bob"):
            self.assertEqual(self.found(who), (set(), 0), who)

    def test_shared_route_is_allowed(self):
        self.assertTrue(B._shared_get_path_allowed(["search"]))


if __name__ == "__main__":
    unittest.main()
