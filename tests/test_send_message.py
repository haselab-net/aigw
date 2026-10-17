"""How send_message types a message into a pane: Codex gets a bracketed
paste (its composer swallowed the Enter after long typed input, 2026-10-12),
everything else the literal keys it always got."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B


class SendMessageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.calls = []
        self.checks = []
        stubs = {
            "session_roots": lambda: [self.root],
            "tmux_exec": self.fake_tmux,
            "require_unlock_if_outside_sandbox": lambda location: None,
            "_start_stuck_input_check": lambda *a: self.checks.append(a),
        }
        self.saved = {name: getattr(B, name) for name in stubs}
        for name, value in stubs.items():
            setattr(B, name, value)

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(B, name, value)
        self.tmp.cleanup()

    def fake_tmux(self, location, args, *a, **kw):
        self.calls.append(args)
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    def session(self, sid, preset):
        d = self.root / sid
        d.mkdir()
        (d / "meta.json").write_text(json.dumps({"id": sid, "preset": preset, "tmux_name": sid,
                                                  "tmux_location": "container"}))
        (d / "events.jsonl").write_text("")

    def test_codex_gets_a_bracketed_paste_then_enter(self):
        self.session("cccc00000001", "codex-tui")
        text = "1行目\n" + "長い行。" * 400
        B.send_message("cccc00000001", text)
        self.assertEqual(self.calls, [
            ["set-buffer", "-b", "aigw-send-cccc00000001", "--", text],
            ["paste-buffer", "-p", "-d", "-b", "aigw-send-cccc00000001", "-t", "cccc00000001"],
            ["send-keys", "-t", "cccc00000001", "Enter"],
        ])

    def test_codex_without_submit_pastes_only(self):
        self.session("cccc00000002", "codex-tui")
        B.send_message("cccc00000002", "abc", submit=False)
        self.assertEqual([c[0] for c in self.calls], ["set-buffer", "paste-buffer"])

    def test_others_still_type_literally(self):
        for sid, preset in (("cccc00000003", "shell"), ("cccc00000004", "claude-tui")):
            self.calls = []
            self.session(sid, preset)
            B.send_message(sid, "-starts with a dash")
            self.assertEqual(self.calls, [
                ["send-keys", "-t", sid, "-l", "--", "-starts with a dash"],
                ["send-keys", "-t", sid, "Enter"],
            ])

    def test_run_with_text_starts_the_stuck_input_check(self):
        self.session("cccc00000005", "claude-tui")
        B.send_message("cccc00000005", "abc")
        B.send_message("cccc00000005", "", submit=True)
        B.send_message("cccc00000005", "def", submit=False)
        self.assertEqual(self.checks, [("cccc00000005", "container", "cccc00000005", "abc")])


RULE = "─" * 80
SENT = "https://example.org/mail/ の既決がなくなっています。全部未読になってしまった？　状況確認をお願いします。"
# The Email session's screen on 2026-10-14, stuck with the text in its box
# (the diff panel on the right, trimmed).
STUCK_SCREEN = "\n".join([
    "  コミットはまだしていません。                    │" + "─" * 30,
    "✻ Sautéed for 3m 6s · done 11:30 AM               │.gitignore    [ ask ]",
    "                     ✔ Update installed · Restart to update  │",
    RULE,
    "❯ https://example.org/mail/ の既決がなくなっています。全部未読になってしまった？　状況確認をお願い",
    "  します。",
    "",
    RULE,
    "  ⏵⏵ bypass permissions on (shift+tab to cycle)",
])
TAKEN_SCREEN = "\n".join([
    "❯ " + SENT, "", "* Boondoggling… (20s · ↓ 1.4k tokens)", RULE, "❯ ", RULE,
    "  ⏵⏵ bypass permissions on (shift+tab to cycle) · esc to interrupt",
])
QUEUED_SCREEN = "\n".join([
    "  ctrl+x ctrl+s to send now", "* Jitterbugging… (7s)", RULE,
    "❯ Press up to edit queued messages", RULE, "  ⏵⏵ auto mode on",
])


class ComposerTest(unittest.TestCase):
    def test_stuck_text_is_seen_in_the_box(self):
        self.assertTrue(B._text_still_in_composer(STUCK_SCREEN, SENT))

    def test_taken_or_queued_is_not_stuck(self):
        self.assertFalse(B._text_still_in_composer(TAKEN_SCREEN, SENT))
        self.assertFalse(B._text_still_in_composer(QUEUED_SCREEN, SENT))

    def test_not_claude_prompt(self):
        self.assertIsNone(B._claude_composer_text("user@box:~$ ls\nfoo\nuser@box:~$ "))


class StuckInputCheckTest(unittest.TestCase):
    def setUp(self):
        self.screens = []
        self.keys = []
        self.events = []
        stubs = {
            "tmux_query": lambda loc, args, *a, **kw: subprocess.CompletedProcess(args, 0, self.screens.pop(0), ""),
            "tmux_exec": lambda loc, args, *a, **kw: self.keys.append(args),
            "append_event": lambda sid, ev: self.events.append(ev["text"]),
            "STUCK_INPUT_CHECK_DELAY": 0,
            "STUCK_INPUT_RETRY": 0,
        }
        self.saved = {name: getattr(B, name) for name in stubs}
        for name, value in stubs.items():
            setattr(B, name, value)
        self.sleep = B.time.sleep
        B.time.sleep = lambda s: None

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(B, name, value)
        B.time.sleep = self.sleep

    def test_taken_at_once_says_nothing(self):
        self.screens = [TAKEN_SCREEN]
        B._stuck_input_check("s1", "host", "s1", SENT)
        self.assertEqual((self.events, self.keys), ([], []))

    def test_stuck_warns_retries_enter_and_reports_when_taken(self):
        # first check, retry 1 (before/after Enter), retry 2 (before/after Enter)
        self.screens = [STUCK_SCREEN, STUCK_SCREEN, STUCK_SCREEN, STUCK_SCREEN, TAKEN_SCREEN]
        B._stuck_input_check("s2", "host", "s2", SENT)
        self.assertEqual(self.keys, [["send-keys", "-t", "s2", "Enter"]] * 2)
        self.assertEqual(len(self.events), 2)
        self.assertIn("受け付けていません", self.events[0])
        self.assertIn("受け付けました", self.events[1])
        self.assertNotIn("s2", B._stuck_input_checks)

    def test_stops_when_the_prompt_is_gone(self):
        self.screens = [STUCK_SCREEN, "$ "]
        B._stuck_input_check("s3", "host", "s3", SENT)
        self.assertEqual(self.keys, [])
        self.assertEqual(len(self.events), 1)


if __name__ == "__main__":
    unittest.main()
