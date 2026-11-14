"""digestconf.py returns the same values as conf.mjs (it asks conf.mjs). Fake data only."""
import json, os, shutil, subprocess, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class DigestConf(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="digestconf-", dir=os.environ.get("TEST_TMP"))
        self.code = os.path.join(self.tmp, "digest")
        shutil.copytree(os.path.join(ROOT, "digest"), self.code, ignore=shutil.ignore_patterns("__pycache__", "test"))
        os.makedirs(os.path.join(self.code, "local"), exist_ok=True)
        with open(os.path.join(self.code, "local", "config.json"), "w") as f:
            json.dump({"account": "test@example.com", "me": {"name": "田中", "nameRe": "田中|tanaka"}}, f)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def py(self, expr):
        env = {k: v for k, v in os.environ.items() if not k.startswith(("DIGEST_", "MAILBOX_"))}
        out = subprocess.run([sys.executable, "-I", "-c", f"import sys; sys.path.insert(0, {self.code!r}); import digestconf as d, json; print(json.dumps({expr}))"],
                             capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr)
        return json.loads(out.stdout)

    def test_values(self):
        self.assertEqual(self.py('d.get("me.name")'), "田中")
        self.assertEqual(self.py('d.get("me.nameRe")'), "田中|tanaka")
        self.assertIsNone(self.py('d.get("no.such")'))
        self.assertEqual(self.py('d.get("no.such", "x")'), "x")
        self.assertEqual(self.py('d.get("me.mentions", "dflt")'), "dflt")  # empty list → default
        self.assertEqual(self.py('d.get("session")'), {"preset": "mail-tui", "cwd": "digest", "group": "digest"})

    def test_paths(self):
        self.assertEqual(self.py("d.CODE"), self.code)
        self.assertEqual(self.py("d.LOCAL"), os.path.join(self.code, "local"))
        self.assertEqual(self.py("d.DATA"), self.code)
        self.assertEqual(self.py("d.GMAIL_DEFAULT"), os.path.join(self.tmp, "gmail.py"))


if __name__ == "__main__":
    unittest.main()
