"""talkto and talkto-remote (the deployment notes), 2026-10-28: --help and
unknown options never send anything; words are joined; stdin works; and
each line's outcome, written back by the backend (_poll_talkto_file ->
_write_talkto_status), is waited for and printed.

    python3 -m unittest discover -s tests -v
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

from test_shared_search import B

BIN = Path(__file__).resolve().parent.parent / "bin"
SCRIPTS = {"talkto": [sys.executable, str(BIN / "talkto")], "talkto-remote": ["bash", str(BIN / "talkto-remote")]}


class TalktoCliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "talkto_out.jsonl"
        self.env = dict(os.environ, AIGW_TALKTO=str(self.path))
        self.env.pop("AIGW_TALKTO_ID", None)
        self.saved = B._relay_to_partner

    def tearDown(self):
        B._relay_to_partner = self.saved
        self.tmp.cleanup()

    def run_cli(self, script, *args, stdin=""):
        return subprocess.run(SCRIPTS[script] + list(args), input=stdin, capture_output=True,
                              text=True, env=self.env, timeout=30)

    def lines(self):
        if not self.path.exists():
            return []
        return [json.loads(l) for l in self.path.read_text().splitlines() if l]

    def test_help_and_bad_options_send_nothing(self):
        for script in SCRIPTS:
            for args in (["--help"], ["-h"], ["-help"], ["--help", "x"]):
                r = self.run_cli(script, *args)
                self.assertEqual(r.returncode, 0, (script, args, r.stderr))
                self.assertIn("talkto", r.stdout)
            r = self.run_cli(script, "-v", "x")
            self.assertEqual(r.returncode, 2, script)
            self.assertIn("-v", r.stderr)
            self.assertEqual(self.lines(), [], script)

    def test_words_dashes_and_stdin(self):
        for script in SCRIPTS:
            self.path.unlink(missing_ok=True)
            self.run_cli(script, "--no-wait", "hello", "world")
            self.run_cli(script, "--no-wait", "--", "-v は文")
            self.run_cli(script, "--no-wait", stdin="複数行の\n`文` $HOME 'x'\n")
            self.run_cli(script, "--no-wait", "-", stdin="ハイフンから")
            got = [l.get("text") or B.base64.b64decode(l["b64"]).decode() for l in self.lines()]
            self.assertEqual(got, ["hello world", "-v は文", "複数行の\n`文` $HOME 'x'\n", "ハイフンから"], script)
            self.assertTrue(all(l.get("id") for l in self.lines()), script)

    def relay_once(self, outcome):
        """Plays the backend: waits for one line, relays it, writes its outcome."""
        B._relay_to_partner = lambda sid, text: outcome

        def run():
            deadline = time.time() + 10
            while time.time() < deadline and not self.path.exists():
                time.sleep(0.05)
            time.sleep(0.2)
            B._poll_talkto_file("s", self.path, 0)

        t = threading.Thread(target=run)
        t.start()
        return t

    def test_reports_outcome(self):
        for script in SCRIPTS:
            for outcome, code in ((("delivered", "届きました(相手「X」)"), 0),
                                  (("no_link", "つながっている相手がいない"), 1)):
                self.path.unlink(missing_ok=True)
                self.path.with_name("talkto_out.jsonl.offset").unlink(missing_ok=True)
                t = self.relay_once(outcome)
                r = self.run_cli(script, "やあ")
                t.join()
                self.assertEqual(r.returncode, code, (script, r.stdout, r.stderr))
                self.assertIn(outcome[1], r.stdout, script)

    def test_real_relay_without_link_says_so(self):
        saved = B._load_links
        B._load_links = lambda: {}
        try:
            self.assertEqual(B._relay_to_partner("s", "x")[0], "no_link")
        finally:
            B._load_links = saved


if __name__ == "__main__":
    unittest.main()
