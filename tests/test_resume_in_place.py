"""Resume in place (the deployment notes, 2026-11-04): resuming an ended session
keeps its id. Before the id carries a new pane, every watcher thread of the
old run must have exited (_quiesce_session), and what the old run left
behind is cleared (_reset_for_resume).

    python3 -m unittest discover -s tests -v
"""
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

from test_shared_search import B


class ResumeInPlaceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.tmux_calls = []
        stubs = {
            "session_roots": lambda: [self.root],
            "tmux_exec": lambda loc, args, timeout=15: self.tmux_calls.append((loc, args)),
        }
        self.saved = {name: getattr(B, name) for name in stubs}
        for name, value in stubs.items():
            setattr(B, name, value)

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(B, name, value)
        B._session_threads.pop("r00000000001", None)
        self.tmp.cleanup()

    def test_quiesce_waits_for_threads(self):
        sid = "r00000000001"
        self.assertTrue(B._quiesce_session(sid, timeout=0.1))  # none ever started
        B._start_session_thread(sid, lambda _sid: time.sleep(0.2))
        self.assertTrue(B._quiesce_session(sid, timeout=5))
        stop = threading.Event()
        B._start_session_thread(sid, lambda _sid: stop.wait(10))
        self.assertFalse(B._quiesce_session(sid, timeout=0.2))
        stop.set()
        self.assertTrue(B._quiesce_session(sid, timeout=5))

    def test_reset_clears_the_old_run(self):
        sid = "r00000000001"
        d = self.root / sid
        (d / "outbox").mkdir(parents=True)
        events = [{"seq": 1, "ts": 1, "type": "user_message", "text": "hi"},
                  {"seq": 2, "ts": 2, "type": "session_ended"}]
        (d / "events.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))
        (d / "meta.json").write_text(json.dumps({"id": sid, "stopped": True}))
        (d / B.ARCHIVE_ON_EXIT).write_text("")
        with B._watchers_lock:
            B._watchers_started.add(sid)
        with B._transcript_tailers_lock:
            B._transcript_tailers_started.add(sid)
        B._reset_for_resume(sid, {"id": sid, "tmux_name": sid, "tmux_location": "container"})
        self.assertEqual(self.tmux_calls, [("container", ["kill-session", "-t", sid])])
        self.assertNotIn(sid, B._watchers_started)
        self.assertNotIn(sid, B._transcript_tailers_started)
        self.assertFalse((d / B.ARCHIVE_ON_EXIT).exists())
        got = [json.loads(l) for l in (d / "events.jsonl").read_text().splitlines()]
        self.assertEqual([e["seq"] for e in got], [1, 2])
        self.assertEqual(got[0]["type"], "user_message")
        self.assertEqual(got[1]["type"], "system")

    def test_ssh_pane_is_not_killed_from_here(self):
        sid = "r00000000001"
        (self.root / sid).mkdir()
        B._reset_for_resume(sid, {"id": sid, "tmux_name": sid, "tmux_location": "ssh:winbox-a"})
        self.assertEqual(self.tmux_calls, [])


if __name__ == "__main__":
    unittest.main()


class ScreenWaitingTest(unittest.TestCase):
    """the deployment notes: the two dialog screens captured from Claude Code 2.1.318."""

    PERMISSION = """\
● Fetching HTTP status line from example.com
──────────────────────────────────────────
 Bash command
 curl -sI https://example.com | head -1
 This command requires approval
 Do you want to proceed?
 \x1b[36m❯ 1. Yes\x1b[0m
   2. Yes, and don’t ask again for: curl -sI https://example.com
   4. No
 Esc to cancel · Tab to amend
"""
    QUESTION = """\
 ☐ Color
Which color do you like: red, green or blue?
❯ 1. Red
     The color red
  2. Green
  4. Type something.
──────────────────────────────────────────
  5. Chat about this
Enter to select · ↑/↓ to navigate · Esc to cancel

"""
    PROMPT = """\
● I ran the command and it worked.
✻ Baked for 4s · done 4:48 AM
──────────────────────────────────────────
❯ 
──────────────────────────────────────────
  ⏵⏵ auto mode on (shift+tab to cycle) · ← 2 agents
"""

    def test_dialogs_are_waiting(self):
        self.assertTrue(B.screen_is_waiting(self.PERMISSION))
        self.assertTrue(B.screen_is_waiting(self.QUESTION))

    def test_input_prompt_is_not(self):
        self.assertFalse(B.screen_is_waiting(self.PROMPT))
        # a reply that merely mentions the footer text, with no options below it
        self.assertFalse(B.screen_is_waiting("● Press Esc to cancel a running command.\n❯ \n"))


class ReplayDedupeWindowTest(unittest.TestCase):
    """`claude --resume` re-reads the whole conversation; every reply already
    in the chat must be recognised, however old (2026-11-04)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.saved = B.session_dir
        B.session_dir = lambda sid, preset=None: self.dir

    def tearDown(self):
        B.session_dir = self.saved
        self.tmp.cleanup()

    def test_counts_whole_log(self):
        with (self.dir / "events.jsonl").open("w") as f:
            for i in range(1500):
                f.write(json.dumps({"type": "agent_output", "text": f"reply {i}"}) + "\n")
        seen = B._recent_agent_texts("x")
        self.assertEqual(seen.get(("agent_output", "reply 0")), 1)
        replay = [{"type": "agent_output", "text": f"reply {i}"} for i in range(1500)]
        replay.append({"type": "agent_output", "text": "new"})
        self.assertEqual(B._drop_already_shown(replay, seen), [{"type": "agent_output", "text": "new"}])
