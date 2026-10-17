"""The chat log of a "codex-tui" session comes from Codex's rollout file
(_tail_codex_rollout), not from the rendered pane (2026-10-12): which file,
what is taken from it, and that a restart neither replays nor skips."""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from test_shared_search import B


def rec(kind, payload, ts="2026-10-12T07:04:00.000Z"):
    return json.dumps({"timestamp": ts, "type": kind, "payload": payload}) + "\n"


def meta_line(started):
    return rec("session_meta", {"id": "x", "timestamp": started})


def said(text, phase="final_answer"):
    return rec("response_item", {"type": "message", "role": "assistant", "phase": phase,
                                 "content": [{"type": "output_text", "text": text}]})


def user(text):
    return rec("response_item", {"type": "message", "role": "user",
                                 "content": [{"type": "input_text", "text": text}]})


NOISE = (rec("response_item", {"type": "reasoning", "summary": []})
         + rec("event_msg", {"type": "task_complete", "last_agent_message": "dup"})
         + rec("response_item", {"type": "message", "role": "developer",
                                 "content": [{"type": "input_text", "text": "dev"}]}))


class TextsTest(unittest.TestCase):
    def test_only_assistant_messages_and_whole_lines(self):
        buf = (meta_line("2026-10-12T07:03:26.987Z") + user("頼みます") + NOISE
               + said("見ています", "commentary") + said("できました")).encode()
        partial = said("途中")[:30].encode()
        used, texts = B._codex_rollout_texts(buf + partial)
        self.assertEqual(texts, ["見ています", "できました"])
        self.assertEqual(used, len(buf))


class TailTest(unittest.TestCase):
    CREATED = 1791788600.0  # 2026-10-12T07:03:20Z

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.sid = "cdx000000001"
        self.sdir = self.root / self.sid
        self.sdir.mkdir()
        self.meta = {"id": self.sid, "preset": "codex-tui", "tmux_name": self.sid,
                     "tmux_location": "container", "created_ts": self.CREATED}
        (self.sdir / "meta.json").write_text(json.dumps(self.meta))
        (self.sdir / "events.jsonl").write_text("")
        self.live = None
        self.steps = []
        stubs = {
            "session_roots": lambda: [self.root],
            "_codex_rollout_of": lambda talkto: self.live,
            "LIVE_CONVERSATION_CHECK_INTERVAL": 0.0,
        }
        self.saved = {name: getattr(B, name) for name in stubs}
        for name, value in stubs.items():
            setattr(B, name, value)
        self.saved_sleep = B.time.sleep
        B.time.sleep = self.fake_sleep

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(B, name, value)
        B.time.sleep = self.saved_sleep
        B._codex_rollout_active.pop(self.sid, None)
        self.tmp.cleanup()

    def fake_sleep(self, _):
        # Each poll runs the next step; when none are left, end the session.
        if self.steps:
            self.steps.pop(0)()
        else:
            self.meta["stopped"] = True
            (self.sdir / "meta.json").write_text(json.dumps(self.meta))

    def rollout(self, name, started, body=""):
        p = self.root / ".codex" / "sessions" / f"rollout-{name}.jsonl"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(meta_line(started) + body)
        return str(p)

    def append(self, path, body):
        with open(path, "a") as f:
            f.write(body)

    def outputs(self):
        return [json.loads(l)["text"] for l in (self.sdir / "events.jsonl").read_text().splitlines()
                if json.loads(l)["type"] == "agent_output"]

    def test_new_conversation_from_top_then_follows(self):
        self.live = self.rollout("a", "2026-10-12T07:03:26.987Z", user("q") + said("一つ目"))
        self.steps = [lambda: self.append(self.live, said("二つ目", "commentary"))]
        B._tail_codex_rollout(self.sid)
        self.assertEqual(self.outputs(), ["一つ目", "二つ目"])

    def test_restart_neither_replays_nor_skips(self):
        self.live = self.rollout("a", "2026-10-12T07:03:26.987Z", said("一つ目"))
        B._tail_codex_rollout(self.sid)
        self.append(self.live, said("停止中に書かれた"))
        self.meta["stopped"] = False
        (self.sdir / "meta.json").write_text(json.dumps(self.meta))
        B._tail_codex_rollout(self.sid)
        self.assertEqual(self.outputs(), ["一つ目", "停止中に書かれた"])

    def test_resumed_older_conversation_starts_at_its_end(self):
        self.live = self.rollout("old", "2026-10-11T01:00:00.000Z", said("昨日の答え"))
        self.steps = [lambda: self.append(self.live, said("今日の答え"))]
        B._tail_codex_rollout(self.sid)
        self.assertEqual(self.outputs(), ["今日の答え"])

    def test_switch_flushes_the_old_file_then_reads_the_new_one(self):
        first = self.live = self.rollout("a", "2026-10-12T07:03:26.987Z", said("一つ目"))

        def new_conversation():
            self.append(first, said("最後の答え"))
            self.live = self.rollout("b", "2026-10-12T08:00:00.000Z", said("新しい会話"))
        self.steps = [new_conversation]
        B._tail_codex_rollout(self.sid)
        self.assertEqual(self.outputs(), ["一つ目", "最後の答え", "新しい会話"])

    def test_turns_the_screen_heuristic_off_only_once_found(self):
        seen = []
        self.steps = [lambda: seen.append(B._codex_rollout_active.get(self.sid)),
                      lambda: setattr(self, "live", self.rollout("a", "2026-10-12T07:03:26.987Z")),
                      lambda: seen.append(B._codex_rollout_active.get(self.sid))]
        B._tail_codex_rollout(self.sid)
        self.assertEqual(seen, [None, True])


class FindTest(unittest.TestCase):
    def test_finds_the_file_held_open_by_the_panes_process(self):
        with tempfile.TemporaryDirectory() as d:
            rollout = Path(d) / ".codex" / "sessions" / "2026" / "rollout-x.jsonl"
            rollout.parent.mkdir(parents=True)
            rollout.write_text("")
            talkto = Path(d) / "sess" / "talkto_out.jsonl"
            env = dict(os.environ, AIGW_TALKTO=str(talkto))
            code = f"f=open({str(rollout)!r},'a'); import time; time.sleep(30)"
            other = dict(os.environ, AIGW_TALKTO=str(talkto) + "x")
            p = subprocess.Popen([sys.executable, "-c", code], env=env)
            q = subprocess.Popen([sys.executable, "-c", code], env=other)
            try:
                deadline = time.time() + 5
                while time.time() < deadline and B._codex_rollout_of(talkto) is None:
                    time.sleep(0.05)
                self.assertEqual(B._codex_rollout_of(talkto), str(rollout))
                self.assertIsNone(B._codex_rollout_of(Path(d) / "none" / "talkto_out.jsonl"))
            finally:
                p.kill()
                q.kill()
                p.wait()
                q.wait()


if __name__ == "__main__":
    unittest.main()
