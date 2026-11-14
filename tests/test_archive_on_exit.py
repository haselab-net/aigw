"""Archive when it ends (the deployment notes): a file "archive-on-exit" in
a session's own directory makes the session archived once it has ended --
whether the end is recorded after the marker appeared (save_meta) or before
it (the next GET /sessions).

    python3 -m unittest discover -s tests -v
"""
import json
import os
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B


class ArchiveOnExitTest(unittest.TestCase):
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
        m = {"id": sid, "label": sid, "preset": "mail-tui", "tmux_location": "host", **meta}
        (self.root / sid / "meta.json").write_text(json.dumps(m))

    def mark(self, sid):
        (self.root / sid / B.ARCHIVE_ON_EXIT).write_text("")

    def meta(self, sid):
        return json.loads((self.root / sid / "meta.json").read_text())

    def test_marker_then_end(self):
        self.make("a00000000001", stopped=False)
        self.mark("a00000000001")
        m = B.load_meta("a00000000001")
        self.assertFalse(m.get("archived"))
        m.update(stopped=True, alive=False)        # what the watcher / stop does
        B.save_meta("a00000000001", m)
        self.assertTrue(self.meta("a00000000001")["archived"])
        self.assertFalse((self.root / "a00000000001" / B.ARCHIVE_ON_EXIT).exists())

    def test_end_then_marker_listed(self):
        self.make("a00000000002", stopped=True)
        self.mark("a00000000002")
        B.list_sessions()
        self.assertTrue(self.meta("a00000000002")["archived"])
        self.assertFalse((self.root / "a00000000002" / B.ARCHIVE_ON_EXIT).exists())

    def test_running_session_untouched(self):
        self.make("a00000000003", stopped=False)
        self.mark("a00000000003")
        B.list_sessions()
        B.save_meta("a00000000003", B.load_meta("a00000000003"))
        self.assertFalse(self.meta("a00000000003").get("archived"))
        self.assertTrue((self.root / "a00000000003" / B.ARCHIVE_ON_EXIT).exists())

    def test_no_marker_no_archive(self):
        self.make("a00000000004", stopped=True)
        B.list_sessions()
        self.assertFalse(self.meta("a00000000004").get("archived"))

    def test_symlink_marker_ignored(self):
        self.make("a00000000005", stopped=False)
        os.symlink("/etc/hostname", self.root / "a00000000005" / B.ARCHIVE_ON_EXIT)
        m = B.load_meta("a00000000005"); m["stopped"] = True
        B.save_meta("a00000000005", m)
        self.assertFalse(self.meta("a00000000005").get("archived"))


if __name__ == "__main__":
    unittest.main()
