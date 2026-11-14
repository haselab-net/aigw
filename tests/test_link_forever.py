"""A session link with no time limit (the deployment notes, 2026-11-07):
"forever" links keep going until a session ends; timed ones still expire.

    python3 -m unittest discover -s tests -v
"""
import json
import tempfile
import time
import unittest
from pathlib import Path

from test_shared_search import B


class LinkForeverTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.saved = {n: getattr(B, n) for n in ("LINKS_PATH", "STATE_DIR", "session_dir", "send_message", "append_event")}
        B.STATE_DIR = self.root
        B.LINKS_PATH = self.root / "links.json"
        B.session_dir = lambda sid: self.root / sid
        B.send_message = lambda *a, **k: None
        self.events = []
        B.append_event = lambda sid, ev: self.events.append((sid, ev))
        for sid in ("aaaaaaaaaaa1", "aaaaaaaaaaa2", "aaaaaaaaaaa3", "aaaaaaaaaaa4"):
            (self.root / sid).mkdir()
            (self.root / sid / "meta.json").write_text(json.dumps({"id": sid, "label": sid, "tmux_location": "root"}))

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)
        self.tmp.cleanup()

    def test_forever_survives_expiry_check(self):
        rec = B.create_link("aaaaaaaaaaa1", "aaaaaaaaaaa2", forever=True)
        self.assertIsNone(rec["expires_ts"])
        self.assertIn("自動では切りません", self.events[0][1]["text"])
        timed = B.create_link("aaaaaaaaaaa3", "aaaaaaaaaaa4", 60)
        links = json.loads(B.LINKS_PATH.read_text())
        links[timed["id"]]["expires_ts"] = time.time() - 1
        B.LINKS_PATH.write_text(json.dumps(links))
        B.expire_links()
        left = B.list_links()
        self.assertEqual([x["id"] for x in left], [rec["id"]])
        self.assertFalse(B._link_expired(left[0], time.time() + 10 * 365 * 86400))


if __name__ == "__main__":
    unittest.main()
