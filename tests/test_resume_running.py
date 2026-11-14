"""One conversation, one running session (the deployment notes, 2026-11-04):
resuming a conversation another session is running is refused with that
session's id, so the page can open it instead of starting a second copy.

    python3 -m unittest discover -s tests -v
"""
import unittest

from test_shared_search import B

CONV = "9548bfee-988a-44c8-813e-99bf3a36b0d0"


class ResumeRunningTest(unittest.TestCase):
    def setUp(self):
        self.rows = []
        stubs = {
            "list_sessions": lambda on_behalf_of=None: self.rows,
            "resolve_workdir": lambda rel, base=None: None,
            "resolve_resume_id": lambda cwd, resume, home=None: resume,
            "_unlockd_call": lambda verb, **fields: {"ok": True, "unlocked": True, "tier": "root"},
            # The first thing made after the check: stop there.
            "session_dir": self._past_the_check,
        }
        self.saved = {n: getattr(B, n) for n in stubs}
        for n, v in stubs.items():
            setattr(B, n, v)

    class PastTheCheck(Exception):
        pass

    def _past_the_check(self, *a, **k):
        raise self.PastTheCheck()

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)

    def test_refused_while_running(self):
        self.rows = [{"id": "840952c959d1", "alive": True, "claude_session_id": CONV}]
        with self.assertRaises(B.ConversationRunning) as cm:
            B.create_session("claude-tui", "SPIDAR", resume=CONV)
        self.assertEqual(cm.exception.session_id, "840952c959d1")

    def test_not_refused_when_stopped_or_other_conversation(self):
        for rows in ([{"id": "a", "alive": False, "claude_session_id": CONV}],
                     [{"id": "a", "alive": True, "claude_session_id": "other"}]):
            self.rows = rows
            with self.assertRaises(self.PastTheCheck):
                B.create_session("claude-tui", "x", resume=CONV)


if __name__ == "__main__":
    unittest.main()
