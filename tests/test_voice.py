"""Voice mode (the deployment notes, 2026-11-08): the resident Haiku's answer is
checked before the page acts on it -- only known actions, only sessions in
the state it was shown.

    python3 -m unittest discover -s tests -v
"""
import json
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B


class VoiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.saved = {n: getattr(B, n) for n in ("session_dir", "iter_session_dirs", "_voice_ask")}
        B.session_dir = lambda sid: self.root / sid
        B.iter_session_dirs = lambda: sorted(p for p in self.root.iterdir() if p.is_dir())
        self.asked = []
        self.answer = '{"action":"none","say":""}'
        B._voice_ask = lambda text: (self.asked.append(text), self.answer)[1]
        for sid, label in (("aaaaaaaaaaa1", "SPIDAR"), ("aaaaaaaaaaa2", "タスク")):
            (self.root / sid).mkdir()
            (self.root / sid / "meta.json").write_text(json.dumps({"id": sid, "label": label, "created_ts": 9e9}))
        (self.root / "aaaaaaaaaaa1" / "events.jsonl").write_text(
            json.dumps({"type": "agent_output", "text": "長い返事"}) + "\n")

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)
        self.tmp.cleanup()

    def test_open(self):
        self.answer = '{"action":"open","session":"aaaaaaaaaaa1","say":"開きます"}'
        out = B.voice_command({"text": "スパイダーを開いて"})
        self.assertEqual(out["action"], "open")
        self.assertIn("SPIDAR", self.asked[0])

    def test_unknown_session_or_action(self):
        self.answer = '{"action":"open","session":"bbbbbbbbbbb1"}'
        self.assertEqual(B.voice_command({"text": "x"})["action"], "none")
        self.answer = '{"action":"delete","session":"aaaaaaaaaaa1"}'
        self.assertEqual(B.voice_command({"text": "x"})["action"], "none")
        self.answer = "ごめんなさい"
        self.assertEqual(B.voice_command({"text": "x"}), {"action": "none", "say": ""})

    def test_read_summary(self):
        answers = iter(['{"action":"read","session":"aaaaaaaaaaa1","full":false}', '{"action":"say","say":"要約です"}'])
        B._voice_ask = lambda text: (self.asked.append(text), next(answers))[1]
        out = B.voice_command({"text": "スパイダーを読んで"})
        self.assertEqual(out["read_text"], "要約です")
        self.assertTrue(self.asked[1].startswith("[要約] 長い返事"))

    def test_empty(self):
        with self.assertRaises(ValueError):
            B.voice_command({"text": "  "})


if __name__ == "__main__":
    unittest.main()
