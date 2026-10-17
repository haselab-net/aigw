"""A backend restart must not relay a session's old talkto lines to its
partner again (2026-10-12: it re-sent six to a working Codex session)."""
import json
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B


class TalktoRestartTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "talkto_out.jsonl"
        self.relayed = []
        self.saved = B._relay_to_partner
        B._relay_to_partner = lambda sid, text: self.relayed.append(text)

    def tearDown(self):
        B._relay_to_partner = self.saved
        self.tmp.cleanup()

    def say(self, text):
        with self.path.open("a") as f:
            f.write(json.dumps({"ts": 0, "text": text}) + "\n")

    def watch(self):
        """A freshly started watcher's first poll; returns its offset."""
        offset = B._talkto_start_offset(self.path)
        return B._poll_talkto_file("s", self.path, offset)

    def test_lines_from_before_the_offset_file_are_not_resent(self):
        self.say("古い1")
        self.say("古い2")
        self.watch()
        self.assertEqual(self.relayed, [])

    def test_restart_relays_only_what_is_new(self):
        offset = self.watch()
        self.say("一つ目")
        offset = B._poll_talkto_file("s", self.path, offset)
        self.assertEqual(self.relayed, ["一つ目"])
        self.say("停止中に書かれた")  # backend down
        self.watch()  # restarted
        self.watch()  # and again
        self.assertEqual(self.relayed, ["一つ目", "停止中に書かれた"])

    def test_new_session_relays_its_first_line(self):
        offset = B._talkto_start_offset(self.path)  # talkto not run yet
        self.assertEqual(offset, 0)
        self.say("最初の一言")
        B._poll_talkto_file("s", self.path, offset)
        self.assertEqual(self.relayed, ["最初の一言"])


if __name__ == "__main__":
    unittest.main()
