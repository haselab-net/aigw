"""Typed chat text reaches tmux on stdin, never on a command line
(the deployment notes, 2026-11-13): sudo logs every accepted command line, so a
container's sudo-wrapped `tmux send-keys -l -- <text>` (the sandbox exec helper)
copied each message into the journal.

    python3 -m unittest discover -s tests -v
"""
import shutil
import subprocess
import time
import unittest

from test_shared_search import B

TEXT = "it's \"quoted\" -- $HOME `x` ; 日本語\n2行目\n"


class TextOnStdinTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.saved = B.subprocess.run

        def fake_run(argv, **kw):
            self.calls.append((list(argv), kw.get("input")))
            return subprocess.CompletedProcess(argv, 0, b"", b"")
        B.subprocess.run = fake_run

    def tearDown(self):
        B.subprocess.run = self.saved

    def test_container_text_not_in_argv(self):
        B.tmux_exec_text("container", ["send-keys", "-t", "abc", "-l", "--"], TEXT)
        argv, inp = self.calls[0]
        self.assertEqual(argv[:4], ["sandbox", "--stdin", "exec", "--"])
        self.assertNotIn(TEXT, argv)
        self.assertFalse(any("日本語" in a for a in argv))
        self.assertEqual(inp, TEXT.encode("utf-8"))

    def test_host_and_root_text_not_in_argv(self):
        for loc in ("host", "root"):
            self.calls.clear()
            B.tmux_exec_text(loc, ["set-buffer", "-b", "buf", "--"], TEXT)
            argv, inp = self.calls[0]
            self.assertFalse(any("日本語" in a for a in argv), loc)
            self.assertEqual(inp, TEXT.encode("utf-8"))


@unittest.skipUnless(shutil.which("tmux"), "tmux not installed")
class TextOnStdinLiveTest(unittest.TestCase):
    """The sh snippet hands tmux the text unchanged, trailing newline included."""
    def test_set_buffer_roundtrip(self):
        sock = f"aigw-test-{int(time.time() * 1000)}"
        L = ["tmux", "-L", sock]
        try:
            subprocess.run(L + ["new-session", "-d", "-s", "t", "cat"], check=True)
            argv = ["sh", "-c", B._TEXT_FROM_STDIN, "sh", *L, "set-buffer", "-b", "b", "--"]
            subprocess.run(argv, input=TEXT.encode("utf-8"), check=True)
            got = subprocess.run(L + ["show-buffer", "-b", "b"], capture_output=True, check=True).stdout
            self.assertEqual(got.decode("utf-8"), TEXT)
        finally:
            subprocess.run(L + ["kill-server"], capture_output=True)


if __name__ == "__main__":
    unittest.main()
