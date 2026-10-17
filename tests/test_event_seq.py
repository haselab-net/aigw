"""A new event's seq must be above every seq already in events.jsonl, also
after lines were removed from it (2026-10-12: removing replayed duplicates
made the backend reissue old seqs, and the chat dropped the new events)."""
import json
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B


class EventSeqTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.saved = B.session_roots
        B.session_roots = lambda: [self.root]
        (self.root / "seq000000001").mkdir()
        (self.root / "seq000000001" / "meta.json").write_text("{}")

    def tearDown(self):
        B.session_roots = self.saved
        B._next_seq.pop("seq000000001", None)
        self.tmp.cleanup()

    def test_after_removed_lines_seq_continues_from_the_highest(self):
        lines = [{"seq": s, "type": "agent_output", "text": str(s)} for s in (1, 2, 50, 51)]
        (self.root / "seq000000001" / "events.jsonl").write_text(
            "".join(json.dumps(e) + "\n" for e in lines))
        self.assertEqual(B.append_event("seq000000001", {"type": "system", "text": "x"})["seq"], 52)

    def test_empty_session_starts_at_one(self):
        self.assertEqual(B.append_event("seq000000001", {"type": "system", "text": "x"})["seq"], 1)


if __name__ == "__main__":
    unittest.main()
