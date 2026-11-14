"""Wake-on-LAN for sleeping ssh machines (the deployment notes): which entries can
be woken (a desktop variant through its base), at most one magic packet per
machine per SSH_WAKE_RESEND, a sleeping wakeable machine still offered in
the picker, and the packet itself.

    python3 -m unittest discover -s tests -v
"""
import subprocess
import unittest
from unittest import mock

from test_shared_search import B

MACHINES = {
    "pc": {"tmux": "/usr/bin/tmux", "wol_mac": "02:00:5e:10:20:30", "wol_via": "jump", "wol_broadcast": "10.0.0.255"},
    "half": {"tmux": "/usr/bin/tmux", "wol_mac": "02:00:5e:10:20:31"},   # no wol_via/wol_broadcast: not wakeable
    "pc-desktop": {"tmux": "/usr/bin/tmux", "ssh_host": "pc", "tmux_socket": "aigw-desktop"},
    "other": {"tmux": "/usr/bin/tmux"},
}


class SshWakeTest(unittest.TestCase):
    def setUp(self):
        p = mock.patch.dict(B.SSH_MACHINES, MACHINES, clear=True)
        p.start()
        self.addCleanup(p.stop)
        B._ssh_wake_sent.clear()
        B._ssh_reachable_cache.clear()
        self.addCleanup(B._ssh_wake_sent.clear)
        self.addCleanup(B._ssh_reachable_cache.clear)

    def test_wakeable(self):
        self.assertTrue(B.ssh_wakeable("pc"))
        self.assertTrue(B.ssh_wakeable("pc-desktop"))
        self.assertFalse(B.ssh_wakeable("other"))
        self.assertFalse(B.ssh_wakeable("nonexistent"))
        self.assertFalse(B.ssh_wakeable("half"))   # wol_mac alone: no jump host or broadcast to send from

    def test_one_packet_per_resend_window(self):
        calls = []

        def run(argv, **kw):
            calls.append((argv, kw))
            return subprocess.CompletedProcess(argv, 0, "", "")

        with mock.patch.object(B.subprocess, "run", run):
            self.assertTrue(B.ssh_wake("pc"))
            self.assertFalse(B.ssh_wake("pc-desktop"))   # same machine, same MAC
            self.assertFalse(B.ssh_wake("other"))
        self.assertEqual(len(calls), 1)
        argv, kw = calls[0]
        self.assertEqual(argv[-5:], ["jump", "python3", "-", "02:00:5e:10:20:30", "10.0.0.255"])
        self.assertEqual(kw["input"], B._SSH_WAKE_SCRIPT)

    def test_wake_forgets_cached_reachability(self):
        B._ssh_reachable_cache["pc"] = (0, False)
        B._ssh_reachable_cache["pc-desktop"] = (0, False)
        B._ssh_reachable_cache["other"] = (0, False)
        with mock.patch.object(B.subprocess, "run",
                               lambda argv, **kw: subprocess.CompletedProcess(argv, 0, "", "")):
            B.ssh_wake("pc")
        self.assertEqual(set(B._ssh_reachable_cache), {"other"})

    def test_packet(self):
        r = subprocess.run(["python3", "-", "02:00:5e:10:20:30", "127.255.255.255"],
                           input=B._SSH_WAKE_SCRIPT, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_sleeping_wakeable_machine_stays_in_picker(self):
        with mock.patch.object(B, "ssh_reachable", lambda m, wait=True: False):
            self.assertEqual(sorted(B.reachable_ssh_machines()), ["pc", "pc-desktop"])

    def test_asleep_reported(self):
        up = {"pc": False, "pc-desktop": False, "half": True, "other": True}
        with mock.patch.object(B, "ssh_reachable", lambda m, wait=True: up[m]):
            asleep = []
            B.reachable_ssh_machines(asleep)
            self.assertEqual(sorted(asleep), ["pc", "pc-desktop"])
            up["pc"] = up["pc-desktop"] = True
            asleep = []
            B.reachable_ssh_machines(asleep)
            self.assertEqual(asleep, [])

    def test_reachable_or_wake_wakes_and_waits(self):
        answers = iter([False, True])
        with mock.patch.object(B, "ssh_reachable", lambda m, wait=True: False), \
                mock.patch.object(B, "_ssh_reachable_probe", lambda m: next(answers)), \
                mock.patch.object(B, "ssh_wake", mock.Mock(return_value=True)) as wake, \
                mock.patch.object(B, "_ssh_close_master", mock.Mock()) as close, \
                mock.patch.object(B.time, "sleep", lambda s: None):
            self.assertTrue(B.ssh_reachable_or_wake("pc", wait=10))
            wake.assert_called_once_with("pc")
            # A ControlMaster left from before the sleep must not be reused.
            close.assert_called_once_with("pc")
            self.assertFalse(B.ssh_reachable_or_wake("other", wait=10))

    def test_opening_a_session_checks_again(self):
        # A "reachable" older than the cache's TTL is not trusted: the
        # machine may have fallen asleep since.
        B._ssh_reachable_cache["pc"] = (B.time.time() - 60, True)
        started = []
        with mock.patch.object(B.threading, "Thread",
                               lambda target, daemon: mock.Mock(start=lambda: started.append(target))):
            B.ssh_wake_in_background("ssh:pc")
            B._ssh_reachable_cache["pc"] = (B.time.time(), True)
            B.ssh_wake_in_background("ssh:pc")
            B.ssh_wake_in_background("ssh:other")
            B.ssh_wake_in_background("container")
        self.assertEqual(len(started), 1)


if __name__ == "__main__":
    unittest.main()
