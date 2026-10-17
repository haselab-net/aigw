"""Sessions on a shared ssh:<machine> (one remote account, one tmux server
for every aigw user) carry their creator in @aigw_owner; someone else's
shows its owner in the untracked list and is adopted watch-only: no input,
no resize, and stopping it leaves their pane alone (the deployment notes).

    python3 -m unittest discover -s tests -v
"""
import json
import subprocess
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from test_shared_search import B

ME = B.getpass.getuser()


class SshOwnerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.execs = []
        remote = {"theirs": "alice", "mine": ME, "untagged": ""}

        def tmux_query(location, args, timeout=15):
            if args[:1] == ["list-sessions"]:
                out = "".join(f"{n} {o}\n" for n, o in remote.items()) + "_aigw-ctl \n"
                return subprocess.CompletedProcess(args, 0, stdout=out, stderr="")
            return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

        def tmux_exec(location, args, timeout=15):
            self.execs.append((location, args))
            return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

        stubs = {
            "session_roots": lambda: [self.root],
            "SSH_MACHINES": {"m": {}},
            "ssh_reachable": lambda machine: True,
            "tmux_query": tmux_query,
            "tmux_exec": tmux_exec,
            "list_tmux_sessions": lambda: [],
            "list_host_tmux_sessions": lambda: [],
            "live_tmux_names": lambda location: set(remote),
            "ensure_watcher": lambda sid: None,
            "_graceful_claude_exit": lambda *a, **k: None,
            "break_link": lambda *a, **k: None,
            "_load_links": lambda: {},
            "expire_links": lambda: None,
        }
        self.saved = {n: getattr(B, n) for n in stubs}
        for n, v in stubs.items():
            setattr(B, n, v)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), B.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        for n, v in self.saved.items():
            setattr(B, n, v)
        self.tmp.cleanup()

    def post(self, path, body):
        req = urllib.request.Request(f"http://127.0.0.1:{self.server.server_port}{path}",
                                     data=json.dumps(body).encode(), method="POST")
        try:
            with urllib.request.urlopen(req) as r:
                return r.status
        except urllib.error.HTTPError as e:
            return e.code

    def test_untracked_list_shows_owner(self):
        rows = {r["name"]: (r["owner"], r["read_only"]) for r in B.list_untracked_tmux_sessions()}
        self.assertEqual(rows, {"theirs": ("alice", True), "mine": (ME, False), "untagged": (None, False)})

    def test_someone_elses_session_is_watch_only(self):
        meta = B.adopt_session("theirs", "ssh:m", "theirs", cols=80, rows=24)
        self.assertTrue(meta["read_only"])
        self.assertEqual(meta["remote_owner"], "alice")
        self.assertFalse([a for _, a in self.execs if a[:1] == ["resize-window"]])
        sid = meta["id"]
        for action, body in (("messages", {"text": "x"}), ("keys", {"key": "Enter"}), ("resize", {"cols": 80})):
            self.assertEqual(self.post(f"/sessions/{sid}/{action}", body), 403, action)
        B.stop_session(sid)
        self.assertFalse([a for _, a in self.execs if a[:1] == ["kill-session"]])
        self.assertTrue(B.load_meta(sid)["stopped"])

    def test_own_and_untagged_sessions_stay_writable(self):
        for name in ("mine", "untagged"):
            self.assertFalse(B.adopt_session(name, "ssh:m", name)["read_only"], name)

    def test_creation_tags_the_owner(self):
        B.tag_tmux_owner("ssh:m", "abc")
        self.assertIn(("ssh:m", ["set-option", "-t", "abc", "@aigw_owner", ME]), self.execs)
        B.tag_tmux_owner("container", "abc")
        self.assertEqual(len(self.execs), 1)


if __name__ == "__main__":
    unittest.main()
