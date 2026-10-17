"""Session groups (the deployment notes): the mailbox digest page's Email
sessions carry group "digest" -- recorded from POST /sessions, or inferred
for older ones -- and GET /sessions returns it.

    python3 -m unittest discover -s tests -v
"""
import json
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B


class SessionGroupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        stubs = {
            "session_roots": lambda: [self.root],
            "_unlockd_call": lambda verb, **fields: {"ok": True, "unlocked": True, "tier": "root"},
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

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(B, name, value)
        self.tmp.cleanup()

    def make(self, sid, **meta):
        (self.root / sid).mkdir()
        m = {"id": sid, "label": sid, "preset": "mail-tui", "tmux_location": "host", "stopped": True, **meta}
        (self.root / sid / "meta.json").write_text(json.dumps(m))

    def test_inferred_and_recorded(self):
        self.assertEqual(B.session_group({"group": "digest"}), "digest")
        self.assertIsNone(B.session_group({"group": "other"}))
        old = {"preset": "mail-tui", "label": "digest: 会議の件", "cwd": "/home/u/mailbox/digest"}
        self.assertEqual(B.session_group(old), "digest")
        self.assertIsNone(B.session_group({**old, "label": "会議の件"}))
        self.assertIsNone(B.session_group({**old, "cwd": "/home/u/mailbox"}))
        self.assertIsNone(B.session_group({**old, "preset": "claude-tui"}))

    def test_list_returns_group(self):
        self.make("cccc00000001", label="digest: a", cwd="/m/digest")
        self.make("cccc00000002", label="mail", cwd="/m")
        self.make("cccc00000003", label="x", cwd="/m", group="digest")
        rows = {s["id"]: s.get("group") for s in B.list_sessions()}
        self.assertEqual(rows, {"cccc00000001": "digest", "cccc00000002": None, "cccc00000003": "digest"})

    def test_unknown_group_refused_before_anything_is_made(self):
        with self.assertRaises(ValueError):
            B.create_session("claude-tui", "x", group="nope")
        self.assertEqual(list(self.root.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
