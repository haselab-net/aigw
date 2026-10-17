"""_watch_shell_claude (a `claude` run by hand in a shell/host-shell/
root-shell pane) must show each reply in the chat exactly once: across a
backend restart, and when /clear or /resume inside Claude Code moves to
another conversation (the deployment notes).

    python3 -m unittest discover -s tests -v

tmux is replaced by a stub that always reports `claude` in the foreground,
and $HOME of the pane by a temporary directory holding the conversation
logs and Claude Code's per-process records.
"""
import json
import os
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

from test_shared_search import B

CWD = "/work"
OLD = "0ld00000-0000-4000-8000-000000000000"
NEW = "0e000000-0000-4000-8000-000000000000"


def assistant(text):
    return json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": text}]}}) + "\n"


def thinking(text):
    return json.dumps({"type": "assistant", "message": {"content": [
        {"type": "thinking", "thinking": text, "signature": "x"}]}}) + "\n"


CLEAR_HEAD = (json.dumps({"type": "mode", "mode": "normal"}) + "\n"
              + json.dumps({"type": "user", "message": {"content":
                            "<command-name>/clear</command-name>\n<command-message>clear</command-message>"}})
              + "\n")


class WatcherTest(unittest.TestCase):
    _n = 0

    def setUp(self):
        WatcherTest._n += 1
        self.sid = f"bbbb{WatcherTest._n:012d}"
        self.tmux = self.sid
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.root = base / "sessions"
        self.home = base / "home"
        self.proj = B.claude_project_dir(CWD, home=self.home)
        self.proj.mkdir(parents=True)
        (self.home / ".claude" / "sessions").mkdir()
        d = self.root / self.sid
        d.mkdir(parents=True)
        (d / "meta.json").write_text(json.dumps({
            "id": self.sid, "label": "t", "preset": "host-shell", "tmux_name": self.tmux,
            "tmux_location": "host", "claude_session_id": OLD}))
        (d / "events.jsonl").write_text("")
        stubs = {
            "session_roots": lambda: [self.root],
            "_claude_home_for_location": lambda location: self.home,
            "tmux_query": lambda location, args, timeout=15: subprocess.CompletedProcess(
                args, 0, stdout=f"claude|{CWD}\n", stderr=""),
            "CLAUDE_FOREGROUND_POLL_INTERVAL": 0.02,
            "LIVE_CONVERSATION_CHECK_INTERVAL": 0.0,
            "_claimed_transcripts": {},
        }
        self.saved = {name: getattr(B, name) for name in stubs}
        for name, value in stubs.items():
            setattr(B, name, value)
        self.thread = None

    def tearDown(self):
        if self.thread is not None:
            meta_path = self.root / self.sid / "meta.json"
            meta = json.loads(meta_path.read_text())
            meta["stopped"] = True
            meta_path.write_text(json.dumps(meta))
            self.thread.join(5)
        for name, value in self.saved.items():
            setattr(B, name, value)
        self.tmp.cleanup()

    # -- helpers --
    def write(self, conv, text):
        with (self.proj / f"{conv}.jsonl").open("a") as f:
            f.write(text)

    def record(self, conv, tmux=None, pid=None, updated=1):
        (self.home / ".claude" / "sessions" / f"{pid or os.getpid()}.json").write_text(json.dumps({
            "pid": pid or os.getpid(), "sessionId": conv, "updatedAt": updated,
            "tmux": f"{tmux or self.tmux}:@1.%1"}))

    def chat(self, texts):
        """Puts `texts` in the chat as if shown before a restart."""
        for t in texts:
            B.append_event(self.sid, {"type": "agent_output", "text": t})

    def shown(self):
        out = []
        for raw in (self.root / self.sid / "events.jsonl").read_text().splitlines():
            ev = json.loads(raw)
            if ev["type"] == "agent_output":
                out.append(ev["text"])
        return out

    def start(self):
        self.thread = threading.Thread(target=B._watch_shell_claude, args=(self.sid,), daemon=True)
        self.thread.start()

    def settle(self, until=None, timeout=3.0):
        end = time.time() + timeout
        while time.time() < end:
            if until is not None and until():
                break
            time.sleep(0.05)
        time.sleep(0.2)  # let anything wrongly extra arrive too

    # -- tests --
    def test_restart_does_not_replay_shown_replies(self):
        self.write(OLD, assistant("A") + assistant("B"))
        self.chat(["A", "B"])
        self.start()
        self.settle()
        self.write(OLD, assistant("C"))
        self.settle(lambda: "C" in self.shown())
        self.assertEqual(self.shown(), ["A", "B", "C"])

    def test_restart_catches_up_on_replies_written_while_down(self):
        self.write(OLD, assistant("A") + assistant("B"))
        self.chat(["A"])
        self.start()
        self.settle(lambda: "B" in self.shown())
        self.assertEqual(self.shown(), ["A", "B"])

    def test_follows_clear(self):
        self.write(OLD, assistant("A"))
        self.chat(["A"])
        self.record(OLD)
        self.start()
        self.settle()
        self.write(NEW, CLEAR_HEAD + assistant("D"))
        self.record(NEW)
        self.settle(lambda: "D" in self.shown())
        self.write(NEW, assistant("E"))
        self.settle(lambda: "E" in self.shown())
        self.assertEqual(self.shown(), ["A", "D", "E"])
        meta = json.loads((self.root / self.sid / "meta.json").read_text())
        self.assertEqual(meta["claude_session_id"], NEW)

    def test_follows_clear_found_at_restart(self):
        # The case reported on 2026-10-12: /clear happened while meta still
        # named the old conversation, then the backend restarted.
        self.write(OLD, assistant("A"))
        self.chat(["A", "A"])  # an earlier restart had already doubled it
        self.write(NEW, CLEAR_HEAD + assistant("D") + assistant("E"))
        self.record(NEW)
        self.start()
        self.settle(lambda: "E" in self.shown())
        self.assertEqual(self.shown(), ["A", "A", "D", "E"])

    def test_resume_inside_claude_does_not_replay_that_conversation(self):
        self.write(OLD, assistant("A"))
        self.chat(["A"])
        self.write(NEW, assistant("X") + assistant("Y"))  # an older conversation
        self.start()
        self.settle()
        self.record(NEW)
        self.settle(lambda: json.loads((self.root / self.sid / "meta.json").read_text())
                    .get("claude_session_id") == NEW)
        self.write(NEW, assistant("Z"))
        self.settle(lambda: "Z" in self.shown())
        self.assertEqual(self.shown(), ["A", "Z"])

    def test_thinking_shown_once_and_empty_skipped(self):
        self.write(OLD, assistant("A"))
        self.chat(["A"])
        self.start()
        self.settle()
        self.write(OLD, thinking("") + thinking("T") + assistant("B"))
        self.settle(lambda: "B" in self.shown())
        evs = [json.loads(r) for r in (self.root / self.sid / "events.jsonl").read_text().splitlines()]
        self.assertEqual([(e["type"], e["text"]) for e in evs],
                         [("agent_output", "A"), ("agent_thinking", "T"), ("agent_output", "B")])

    def test_restart_does_not_replay_shown_thinking(self):
        self.write(OLD, thinking("T") + assistant("A"))
        B.append_event(self.sid, {"type": "agent_thinking", "text": "T"})
        self.chat(["A"])
        self.start()
        self.settle()
        self.write(OLD, assistant("C"))
        self.settle(lambda: "C" in self.shown())
        evs = [json.loads(r) for r in (self.root / self.sid / "events.jsonl").read_text().splitlines()]
        self.assertEqual([e["text"] for e in evs if e["type"] == "agent_thinking"], ["T"])

    def test_restart_does_not_flood_thinking_older_chat(self):
        # A chat shown before thinking was: none of its thinking is in it.
        self.write(OLD, thinking("T1") + assistant("A") + thinking("T2") + assistant("B"))
        self.chat(["A", "B"])
        self.start()
        self.settle()
        self.write(OLD, thinking("T3") + assistant("C"))
        self.settle(lambda: "C" in self.shown())
        evs = [json.loads(r) for r in (self.root / self.sid / "events.jsonl").read_text().splitlines()]
        self.assertEqual([e["text"] for e in evs], ["A", "B", "T3", "C"])

    def test_ignores_other_panes_and_dead_processes(self):
        self.write(OLD, assistant("A"))
        self.chat(["A"])
        self.write(NEW, CLEAR_HEAD + assistant("D"))
        self.record(NEW, tmux="someoneelse", updated=5)
        dead = 2 ** 22 + 12345
        while os.path.exists(f"/proc/{dead}"):
            dead += 1
        self.record(NEW, pid=dead, updated=9)
        self.start()
        self.settle()
        self.assertEqual(self.shown(), ["A"])
        self.assertIsNone(B._live_claude_conversation("host", self.tmux))

    def test_notes_conversation_folder_while_running(self):
        # the deployment notes: kept for the ended session's ↻.
        self.write(OLD, json.dumps({"type": "user", "cwd": "/work/sub"}) + "\n" + assistant("A"))
        self.start()
        self.settle(lambda: "A" in self.shown())
        meta = json.loads((self.root / self.sid / "meta.json").read_text())
        self.assertEqual(meta.get("claude_cwd"), "/work/sub")


class TranscriptCwdTest(unittest.TestCase):
    """find_transcript_cwd and the ended shell session's ↻ in list_sessions
    (the deployment notes)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.proj = self.home / ".claude" / "projects" / "-x"
        self.proj.mkdir(parents=True)
        self.saved = B._claude_home_for_location
        B._claude_home_for_location = lambda location: self.home

    def tearDown(self):
        B._claude_home_for_location = self.saved
        self.tmp.cleanup()

    def test_found(self):
        (self.proj / f"{OLD}.jsonl").write_text(json.dumps({"type": "mode"}) + "\n"
                                                + json.dumps({"cwd": "an internal working tree"}) + "\n")
        self.assertEqual(B.find_transcript_cwd("root", OLD), "an internal working tree")

    def test_missing_is_none(self):
        self.assertIsNone(B.find_transcript_cwd("root", OLD))

    def test_unreadable_raises_instead_of_none(self):
        # A directory in the log's place: open() fails with something other
        # than FileNotFoundError, as it does once root's ACL is taken away.
        (self.proj / f"{OLD}.jsonl").mkdir()
        with self.assertRaises(OSError):
            B.find_transcript_cwd("root", OLD)

    def test_list_does_not_keep_none_for_unreadable_log(self):
        root = self.home / "sessions"
        sid = "cccc00000001"
        (root / sid).mkdir(parents=True)
        meta_path = root / sid / "meta.json"
        meta_path.write_text(json.dumps({
            "id": sid, "label": "t", "preset": "root-shell", "tmux_name": sid,
            "tmux_location": "root", "stopped": True, "claude_session_id": OLD}))
        (self.proj / f"{OLD}.jsonl").mkdir()
        saved_roots = B.session_roots
        B.session_roots = lambda: [root]
        try:
            row = [s for s in B.list_sessions() if s["id"] == sid][0]
            self.assertNotIn("claude_cwd", row)
            self.assertNotIn("claude_cwd", json.loads(meta_path.read_text()))
            (self.proj / f"{OLD}.jsonl").rmdir()
            (self.proj / f"{OLD}.jsonl").write_text(json.dumps({"cwd": "an internal working tree"}) + "\n")
            row = [s for s in B.list_sessions() if s["id"] == sid][0]
            self.assertEqual(row["claude_cwd"], "an internal working tree")
            self.assertEqual(json.loads(meta_path.read_text())["claude_cwd"], "an internal working tree")
        finally:
            B.session_roots = saved_roots


class SshWatcherTest(WatcherTest):
    """The ssh:<machine> branch (claude-tui-<machine>, shell-<machine>),
    with the remote directory listing and reads served from the same
    temporary directory."""

    def setUp(self):
        super().setUp()
        meta_path = self.root / self.sid / "meta.json"
        meta = json.loads(meta_path.read_text())
        meta["tmux_location"] = "ssh:m"
        meta_path.write_text(json.dumps(meta))

        def read_new(machine, key, name, offset):
            p = self.proj / name
            if not p.exists():
                return b"", None
            data = p.read_bytes()
            return data[offset:], len(data)

        stubs = {
            "_remote_claude_project_dir_key": lambda machine, cwd: "k",
            "_ssh_list_jsonl": lambda machine, key: [(p.name, p.stat().st_mtime)
                                                     for p in self.proj.glob("*.jsonl")],
            "_ssh_read_new": read_new,
        }
        self.saved.update({name: getattr(B, name) for name in stubs})
        for name, value in stubs.items():
            setattr(B, name, value)

    # /clear and the per-process records are not followed over ssh.
    test_follows_clear = None
    test_follows_clear_found_at_restart = None
    test_resume_inside_claude_does_not_replay_that_conversation = None
    test_ignores_other_panes_and_dead_processes = None
    test_notes_conversation_folder_while_running = None  # local shells only


if __name__ == "__main__":
    unittest.main()
