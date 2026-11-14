"""aigw-compat daily (the deployment notes, 2026-11-09): when it checks, what it
reports and remembers. The checks and the version probes are stubbed.

    python3 -m unittest discover -s tests -v
"""
import importlib.machinery
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "bin" / "aigw-compat"


def load():
    loader = importlib.machinery.SourceFileLoader("aigw_compat_under_test", str(SCRIPT))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def vers(claude="2.1.319", codex="0.155.0", box="2.1.319"):
    return {"claude": {"root": claude, "box:alice": box}, "codex": {"shared": codex}, "ssh": {"m": "2.1.319"}}


class DailyTest(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.tmp = tempfile.TemporaryDirectory()
        self.m.STATE = Path(self.tmp.name) / "state.json"
        self.m._run = lambda *a, **k: None   # `claude update`
        self.now = vers()
        self.m.versions = lambda ssh=True: self.now
        self.runs = 0
        self.fail = []        # (area, name) failing on every run
        self.flaky = []       # failing on the first run only
        self.unavailable = []

        def run_checks(live=True):
            self.runs += 1
            c = self.m.Checks()
            c.unavailable = list(self.unavailable)
            for key in [("tui", "a"), ("tui", "b")]:
                bad = key in self.fail or (key in self.flaky and self.runs == 1)
                c.results.append((key[0], key[1], not bad, "detail" if bad else ""))
            return c
        self.m.run_checks = run_checks

    def tearDown(self):
        self.tmp.cleanup()

    def day(self):
        d = Path(self.tmp.name) / f"d{self.runs}"
        rc = self.m.daily(d)
        return rc, (d / "aigw-compat.md").read_text()

    def test_first_day_checks_then_quiet(self):
        rc, md = self.day()
        self.assertEqual((rc, self.runs), (0, 1))
        self.assertIn("版の変化なし", md)   # nothing to compare with yet
        rc, md = self.day()
        self.assertEqual((rc, self.runs), (0, 1))  # same versions: no live run
        self.assertIn("省いた", md)

    def test_new_version_is_reported_and_checked(self):
        self.day()
        self.now = vers(claude="2.1.330", box="2.1.330")
        rc, md = self.day()
        self.assertEqual((rc, self.runs), (0, 2))
        self.assertIn("版が変わった: claude: 2.1.330 (前: 2.1.319)", md)
        self.assertEqual(json.loads(self.m.STATE.read_text())["tested"]["claude"], "2.1.330")

    def test_failure_retried_then_reported_and_rechecked_next_day(self):
        self.day()
        self.now = vers(codex="0.160.0")
        self.fail = [("tui", "b")]
        rc, md = self.day()
        self.assertEqual(rc, 1)
        self.assertIn("aigw-compat FAIL tui: b", md)
        self.assertNotIn("FAIL tui: a", md)
        st = json.loads(self.m.STATE.read_text())
        self.assertTrue(st["failing"])
        self.assertEqual(st["tested"]["codex"], "0.155.0")   # not marked as tested
        self.fail = []
        before = self.runs
        rc, md = self.day()                                  # same versions, but it failed: check again
        self.assertEqual((rc, self.runs), (0, before + 1))

    def test_flaky_failure_not_reported(self):
        self.day()
        self.now = vers(claude="2.1.331", box="2.1.331")
        self.flaky = [("tui", "a")]
        rc, md = self.day()
        self.assertEqual(rc, 0)
        self.assertNotIn("FAIL", md)

    def test_account_unavailable_is_not_a_failure_but_retried(self):
        self.day()
        self.now = vers(claude="2.1.332", box="2.1.332")
        self.unavailable = ["check_claude_tui: You've hit your weekly limit"]
        rc, md = self.day()
        self.assertEqual(rc, 0)
        self.assertIn("試せなかった", md)
        self.assertEqual(json.loads(self.m.STATE.read_text())["tested"]["claude"], "2.1.319")


if __name__ == "__main__":
    unittest.main()
