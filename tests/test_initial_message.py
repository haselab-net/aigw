"""The first message of a new session is sent by the backend once Claude's
prompt is up (2026-11-05): leaving the page that asked for it no longer
loses it.

    python3 -m unittest discover -s tests -v
"""
import unittest

from test_shared_search import B


class InitialMessageTest(unittest.TestCase):
    def setUp(self):
        self.sent = []
        self.saved = {n: getattr(B, n) for n in ("send_message", "INITIAL_MESSAGE_WAIT")}
        B.send_message = lambda sid, text, submit=True, from_user=None: self.sent.append((sid, text, submit))
        B.INITIAL_MESSAGE_WAIT = 3

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)
        with B._latest_screen_lock:
            B._latest_screen.pop("iiiiiiiiiiii", None)

    def test_waits_for_prompt_then_sends(self):
        with B._latest_screen_lock:
            B._latest_screen["iiiiiiiiiiii"] = "  ❯ \n  ⏵⏵ bypass permissions on"
        B.send_initial_message("iiiiiiiiiiii", "新着まとめの項目 X に対応したいです。")
        self.assertEqual(self.sent, [("iiiiiiiiiiii", "新着まとめの項目 X に対応したいです。", True)])

    def test_sends_anyway_after_the_wait(self):
        B.send_initial_message("iiiiiiiiiiii", "hello")
        self.assertEqual(len(self.sent), 1)


if __name__ == "__main__":
    unittest.main()
