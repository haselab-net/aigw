"""Session groups (the deployment notes): the names come from extensions
(api.session_group); create_session refuses any other before making
anything, and a group no extension knows reads as none.

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

    def test_unknown_group_reads_as_none(self):
        self.assertIsNone(B.session_group({"group": "other"}))
        self.make("cccc00000003", label="x", cwd="/m", group="other")
        rows = {s["id"]: s.get("group") for s in B.list_sessions()}
        self.assertEqual(rows, {"cccc00000003": None})

    def test_unknown_group_refused_before_anything_is_made(self):
        with self.assertRaises(ValueError):
            B.create_session("claude-tui", "x", group="nope")
        self.assertEqual(list(self.root.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
