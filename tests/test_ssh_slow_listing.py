"""A machine that stops answering must not hold up what only displays
(2026-10-28: an unstable Windows machine made /sessions take 15-30 s):
ssh_reachable(wait=False) and ssh_listing answer from the last result and
refresh in the background; only the first call waits, and briefly.

    python3 -m unittest discover -s tests -v
"""
import subprocess
import threading
import time
import unittest

from test_shared_search import B


class SlowSshTest(unittest.TestCase):
    def setUp(self):
        self.saved = {n: getattr(B, n) for n in ("_ssh_run", "SSH_LISTING_FIRST_WAIT", "SSH_REACHABLE_CACHE_TTL", "SSH_LISTING_TTL")}
        B._ssh_reachable_cache.clear()
        B._ssh_listing.clear()
        B.SSH_LISTING_FIRST_WAIT = 0.3
        self.calls = 0

        def hanging_ssh(machine, argv, timeout=15, **kw):
            self.calls += 1
            time.sleep(1.0)  # a machine that never answers: the probe times out
            raise subprocess.TimeoutExpired(argv, timeout)

        B._ssh_run = hanging_ssh

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)
        B._ssh_reachable_cache.clear()
        B._ssh_listing.clear()

    def timed(self, fn):
        t = time.time()
        v = fn()
        return v, time.time() - t

    def test_reachable_no_wait(self):
        v, dt = self.timed(lambda: B.ssh_reachable("m", wait=False))
        self.assertFalse(v)
        self.assertLess(dt, 0.6)  # the first wait only, not the whole probe
        time.sleep(1.1)  # the probe finishes in the background
        B.SSH_REACHABLE_CACHE_TTL = 0  # stale from now on
        v, dt = self.timed(lambda: B.ssh_reachable("m", wait=False))
        self.assertFalse(v)
        self.assertLess(dt, 0.1)  # stale answer at once, re-probe behind it
        # Many callers at once start one probe, not one each.
        before = self.calls
        for _ in range(5):
            B.ssh_reachable("m", wait=False)
        time.sleep(0.05)
        self.assertLessEqual(self.calls - before, 1)

    def test_reachable_wait_still_probes(self):
        v, dt = self.timed(lambda: B.ssh_reachable("m"))
        self.assertFalse(v)
        self.assertGreaterEqual(dt, 0.9)

    def test_listing_stale_while_refreshing(self):
        answers = [{"a"}, {"b"}]
        gate = threading.Event()

        def fetch(location):
            v = answers.pop(0)
            if v == {"b"}:
                gate.wait(2)  # the second fetch hangs
            return v

        B.SSH_LISTING_TTL = 0
        v, dt = self.timed(lambda: B.ssh_listing("names", "ssh:m", fetch, set()))
        self.assertEqual(v, {"a"})
        v, dt = self.timed(lambda: B.ssh_listing("names", "ssh:m", fetch, set()))
        self.assertEqual(v, {"a"})  # last answer while the refresh hangs
        self.assertLess(dt, 0.1)
        gate.set()
        time.sleep(0.1)
        self.assertEqual(B.ssh_listing("names", "ssh:m", lambda l: {"c"}, set()), {"b"})

    def test_listing_first_call_waits_briefly(self):
        v, dt = self.timed(lambda: B.ssh_listing("names", "ssh:x", lambda l: time.sleep(1) or {"z"}, set()))
        self.assertEqual(v, set())
        self.assertLess(dt, 0.6)


if __name__ == "__main__":
    unittest.main()
