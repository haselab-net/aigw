"""Session links as groups that survive a stop (the deployment notes,
2026-11-08): three or more sessions in one link, talkto to everyone or
`--to` one, a stopped member stays linked and is told so when resumed.

    python3 -m unittest discover -s tests -v
"""
import json
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B

A, B2, C, D = "aaaaaaaaaaa1", "aaaaaaaaaaa2", "aaaaaaaaaaa3", "aaaaaaaaaaa4"


class LinkGroupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.saved = {n: getattr(B, n) for n in ("LINKS_PATH", "STATE_DIR", "session_dir", "send_message", "append_event")}
        B.STATE_DIR = self.root
        B.LINKS_PATH = self.root / "links.json"
        B.session_dir = lambda sid: self.root / sid
        self.sent = []
        B.send_message = lambda sid, text, submit=True, from_user=None: self.sent.append((sid, text))
        self.events = []
        B.append_event = lambda sid, ev: self.events.append((sid, ev))
        for sid, label in ((A, "aigwE"), (B2, "root"), (C, "devbox"), (D, "other")):
            (self.root / sid).mkdir()
            self.meta(sid, label=label)

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)
        self.tmp.cleanup()

    def meta(self, sid, **kw):
        p = self.root / sid / "meta.json"
        m = json.loads(p.read_text()) if p.exists() else {"id": sid, "tmux_location": "container", "preset": "claude-tui"}
        m.update(kw)
        p.write_text(json.dumps(m))

    def test_third_joins_and_broadcast(self):
        B.create_link(A, B2, forever=True)
        self.sent.clear()
        rec = B.create_link(C, A)  # C joins A's link
        self.assertEqual(rec["members"], [A, B2, C])
        self.assertIsNone(rec["expires_ts"])  # keeps the link's own limit
        told = {sid for sid, _ in self.sent}
        self.assertEqual(told, {A, B2, C})
        self.sent.clear()
        status, msg = B._relay_to_partner(A, B.TalktoText("こんにちは"))
        self.assertEqual(status, "delivered")
        self.assertEqual(sorted(s for s, _ in self.sent), [B2, C])
        self.assertTrue(all(t.startswith("[🔗「aigwE」から] ") for _, t in self.sent))

    def test_to_one(self):
        B.create_link(A, B2)
        B.create_link(A, C)
        self.sent.clear()
        t = B.TalktoText("だけに")
        t.to = "devbox"
        self.assertEqual(B._relay_to_partner(A, t)[0], "delivered")
        self.assertEqual([s for s, _ in self.sent], [C])
        t.to = "nobody"
        status, msg = B._relay_to_partner(A, t)
        self.assertEqual(status, "no_target")
        self.assertIn("「root」", msg)

    def test_stopped_member_stays(self):
        B.create_link(A, B2)
        self.meta(B2, stopped=True)
        status, msg = B._relay_to_partner(A, B.TalktoText("x"))
        self.assertEqual(status, "stopped")
        self.assertTrue(B._session_is_linked(A) and B._session_is_linked(B2))
        self.meta(B2, stopped=False)
        self.assertIn("「aigwE」とつながったまま", B.link_resumed_note(B2))
        self.assertIsNone(B.link_resumed_note(D))

    def test_leave_and_dissolve(self):
        B.create_link(A, B2)
        B.create_link(C, B2)
        B.break_link(C)
        self.assertEqual(B.list_links()[0]["members"], [A, B2])
        B.break_link(A)
        self.assertEqual(B.list_links(), [])

    def test_two_links_cannot_merge(self):
        B.create_link(A, B2)
        B.create_link(C, D)
        with self.assertRaises(ValueError):
            B.create_link(A, C)

    def test_old_record_and_replaced_id(self):
        B.LINKS_PATH.write_text(json.dumps({"x1": {"a": A, "b": B2, "created_ts": 1, "expires_ts": None}}))
        self.assertEqual(B.list_links()[0]["members"], [A, B2])
        B.link_replace_member(B2, C)
        self.assertEqual(B.list_links()[0]["members"], [A, C])

    def test_talkto_to_field(self):
        line = json.dumps({"id": "abc", "text": "hi", "to": "root"}).encode()
        [(item_id, text)] = B._parse_talkto_lines([line])
        self.assertEqual((item_id, str(text), text.to), ("abc", "hi", "root"))


if __name__ == "__main__":
    unittest.main()
