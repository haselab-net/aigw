"""A backend restart must not re-post an idle pane's screen as new chat
output (2026-11: one idle pane collected a copy of its last reply per
restart). _watch_tmux_session takes the first capture of a session that
existed before this process started as its baseline."""
import time
import unittest

from test_shared_search import B


class PaneReattachTest(unittest.TestCase):
    def test_session_from_before_start_is_reattached(self):
        self.assertTrue(B._is_reattached_session({"created_ts": B._BACKEND_STARTED_TS - 60}))

    def test_session_created_by_this_process_is_not(self):
        self.assertFalse(B._is_reattached_session({"created_ts": time.time()}))

    def test_old_metadata_without_created_ts_is_reattached(self):
        self.assertTrue(B._is_reattached_session({}))
        self.assertTrue(B._is_reattached_session({"created_ts": None}))


if __name__ == "__main__":
    unittest.main()
