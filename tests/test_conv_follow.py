"""the deployment notes (2026-11-09): the hooks' reports of which conversation
a pane's Claude is on, and what they do to the to-do state.

    python3 -m unittest discover -s tests -v
"""
import base64
import json
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B

OLD = "0ld00000-0000-4000-8000-000000000000"
NEW = "0e000000-0000-4000-8000-000000000000"


class ParseTest(unittest.TestCase):
    def test_local_conv_line(self):
        line = json.dumps({"conv": {"session_id": NEW, "pane": True}}).encode()
        [(item_id, (kind, info))] = B._parse_talkto_lines([line])
        self.assertEqual((item_id, kind, info["session_id"]), (None, "conv", NEW))

    def test_remote_hook_lines(self):
        start = {"session_id": NEW, "transcript_path": "C:\\\\Users\\\\d\\\\.claude\\\\projects\\\\C--w\\\\" + NEW + ".jsonl",
                 "source": "startup", "hook_event_name": "SessionStart"}
        stop = {"session_id": NEW, "hook_event_name": "Stop", "last_assistant_message": "x" * 3000}
        lines = [json.dumps({"ts": 1, "hook": h, "pane": p, "b64": base64.b64encode(json.dumps(d).encode()).decode()}).encode()
                 for h, p, d in (("start", 1, start), ("event", 0, stop))]
        (_, (k1, conv)), (_, (k2, task)) = B._parse_talkto_lines(lines)
        self.assertEqual((k1, conv["pane"], conv["source"]), ("conv", True, "startup"))
        rep = B._conv_from_report(conv)
        self.assertEqual((rep["dir"], rep["name"]), ("C--w", NEW + ".jsonl"))
        self.assertEqual((k2, task["pane"], len(task["last_assistant_message"])), ("task", False, 1500))

    def test_bad_reports(self):
        self.assertIsNone(B._conv_from_report({"session_id": "../x", "transcript_path": "/a/b/../x.jsonl"}))
        self.assertIsNone(B._conv_from_report({"session_id": NEW, "transcript_path": "/a/b/other.jsonl"}))


class TaskFilterTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.sid = "cccccccccc01"
        (self.root / self.sid).mkdir()
        (self.root / self.sid / "meta.json").write_text(json.dumps({"id": self.sid, "claude_session_id": OLD}))
        self.timers = []

        class Timer:
            def __init__(s, delay, fn, args):
                self.timers.append(fn.__name__)

            def start(s):
                pass
        self.saved = {"session_dir": B.session_dir, "Timer": B.threading.Timer, "_task_recent": B._task_recent}
        B.session_dir = lambda sid: self.root / sid
        B.threading.Timer = Timer
        B._task_recent = {}

    def tearDown(self):
        B.session_dir = self.saved["session_dir"]
        B.threading.Timer = self.saved["Timer"]
        B._task_recent = self.saved["_task_recent"]
        self.tmp.cleanup()

    def test_followed_conversation_counts(self):
        B.task_hook(self.sid, {"hook_event_name": "Stop", "session_id": OLD, "last_assistant_message": "a"})
        self.assertEqual(self.timers, ["_task_decide_stop"])

    def test_background_job_does_not(self):
        B.task_hook(self.sid, {"hook_event_name": "Stop", "session_id": NEW, "pane": False,
                               "last_assistant_message": "b"})
        self.assertEqual(self.timers, ["conv_lost_check"])

    def test_nested_does_not(self):
        B.task_hook(self.sid, {"hook_event_name": "Stop", "session_id": OLD, "nested": True,
                               "last_assistant_message": "c"})
        self.assertEqual(self.timers, [])


class LostTest(unittest.TestCase):
    """A reply from a conversation the chat does not follow, on the pane's
    screen: the chat says it lost the conversation, once."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.sid = "cccccccccc02"
        (self.root / self.sid).mkdir()
        (self.root / self.sid / "meta.json").write_text(json.dumps({"id": self.sid, "claude_session_id": OLD}))
        self.events = []
        self.screen = ""
        self.saved = {n: getattr(B, n) for n in ("session_dir", "append_event", "tmux_query")}
        B.session_dir = lambda sid: self.root / sid
        B.append_event = lambda sid, ev: self.events.append(ev)
        B.tmux_query = lambda loc, args, timeout=15: type("R", (), {"stdout": self.screen})()

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)
        self.tmp.cleanup()

    def test_on_screen_warns_once(self):
        p = {"session_id": NEW, "pane": False, "last_assistant_message": "本文\n状態: 済み — scrapbox を両ホストで修正済み"}
        self.screen = "● 本文\n  状態: 済み — scrapbox を両ホストで修正済み\n"
        B.conv_lost_check(self.sid, p)
        B.conv_lost_check(self.sid, p)
        self.assertEqual(len(self.events), 1)
        self.assertIn("追えていません", self.events[0]["text"])

    def test_other_job_not_on_screen(self):
        self.screen = "● 別の話\n"
        B.conv_lost_check(self.sid, {"session_id": NEW, "pane": False, "last_assistant_message": "状態: 済み — 関係ない仕事"})
        self.assertEqual(self.events, [])


if __name__ == "__main__":
    unittest.main()
