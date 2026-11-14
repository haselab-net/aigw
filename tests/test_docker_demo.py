"""The Docker demo's pieces that do not need Docker (docker/README.md):
the demo login extension, the `sandbox` stand-in, and the two gateway
settings the demo relies on. docker/test.sh builds and runs the image itself.

    python3 -m unittest discover -s tests -v
"""
import http.client
import json
import os
import pwd
import subprocess
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

from test_gateway_login import G, load_gateway

ROOT = Path(__file__).resolve().parent.parent
DEMO_EXT = ROOT / "docker" / "ext"
SANDBOX = ROOT / "docker" / "sandbox"
ME = pwd.getpwuid(os.getuid()).pw_name


class DemoLoginTest(unittest.TestCase):
    def setUp(self):
        self.store = Path(tempfile.mkdtemp(prefix="aigw-test-demo-")) / "sessions.json"
        self.secret = self.store.parent / "cookie_secret"
        self.secret.write_bytes(b"test-secret")
        self.saved = (G.SESSION_STORE_PATH, G.SESSION_STORE_LOCK_PATH, G.COOKIE_SECRET_FILE)
        G.SESSION_STORE_PATH, G.SESSION_STORE_LOCK_PATH = self.store, self.store.with_name(".lock")
        G.COOKIE_SECRET_FILE = str(self.secret)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), G.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        G.SESSION_STORE_PATH, G.SESSION_STORE_LOCK_PATH, G.COOKIE_SECRET_FILE = self.saved
        G.load_extensions(G.EXT_DIR)

    def get(self, path, cookie=None, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
        headers = {"Cookie": cookie} if cookie else {}
        if host:
            headers["Host"] = host
        c.request("GET", path, headers=headers)
        r = c.getresponse()
        body = r.read()
        c.close()
        return r, body

    def test_without_demo_user_nothing_is_registered(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AIGW_DEMO_USER", None)
            self.assertEqual(G.load_extensions(DEMO_EXT), ["demo"])
        self.assertEqual(G._EXT["GET"], [])
        r, _ = self.get("/agents/demo-login")
        self.assertEqual(r.status, 404)

    def test_demo_login_gives_a_working_session(self):
        with mock.patch.dict(os.environ, {"AIGW_DEMO_USER": ME}):
            G.load_extensions(DEMO_EXT)
        r, body = self.get("/agents/demo-login")
        self.assertEqual(r.status, 302)
        self.assertEqual(r.getheader("Location"), "/agents/")
        self.assertEqual(r.getheader("Content-Length"), "0")   # curl must not wait for a body
        cookie = r.getheader("Set-Cookie").split(";")[0]
        r, body = self.get("/agents/api/me", cookie)
        self.assertEqual((r.status, json.loads(body)), (200, {"username": ME}))

    def test_only_loopback_names_get_a_login(self):
        with mock.patch.dict(os.environ, {"AIGW_DEMO_USER": ME}):
            os.environ.pop("AIGW_DEMO_HOSTS", None)
            G.load_extensions(DEMO_EXT)
        for host in ("localhost:8878", "127.0.0.1", "[::1]:8878", "LOCALHOST"):
            r, _ = self.get("/agents/demo-login", host=host)
            self.assertEqual(r.status, 302, host)
        for host in ("evil.example", "evil.example:8878", "127.0.0.1.evil.example", "[::2]:8878"):
            r, _ = self.get("/agents/demo-login", host=host)
            self.assertEqual(r.status, 403, host)
            self.assertIsNone(r.getheader("Set-Cookie"), host)

    def test_demo_hosts_adds_names(self):
        with mock.patch.dict(os.environ, {"AIGW_DEMO_USER": ME, "AIGW_DEMO_HOSTS": "box.lan, other"}):
            G.load_extensions(DEMO_EXT)
        self.assertEqual(self.get("/agents/demo-login", host="box.lan:8878")[0].status, 302)
        self.assertEqual(self.get("/agents/demo-login", host="evil.example")[0].status, 403)

    def test_unknown_demo_user_fails_the_load(self):
        with mock.patch.dict(os.environ, {"AIGW_DEMO_USER": "no-such-user-aigw-demo"}):
            self.assertEqual(G.load_extensions(DEMO_EXT), [])


class GatewayHostTest(unittest.TestCase):
    def test_default_is_loopback(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AIGW_GATEWAY_HOST", None)
            self.assertEqual(load_gateway().GATEWAY_HOST, "127.0.0.1")

    def test_env_overrides(self):
        with mock.patch.dict(os.environ, {"AIGW_GATEWAY_HOST": "0.0.0.0"}):
            self.assertEqual(load_gateway().GATEWAY_HOST, "0.0.0.0")


class SandboxStandInTest(unittest.TestCase):
    def setUp(self):
        self.home = Path(tempfile.mkdtemp(prefix="aigw-test-sbx-"))

    def run_sandbox(self, *args):
        env = {"HOME": str(self.home), "PATH": os.environ["PATH"]}
        return subprocess.run(["sh", str(SANDBOX), *args], capture_output=True, text=True, env=env, timeout=10)

    def test_exec_runs_here_with_sandhome_and_its_own_tmux_dir(self):
        r = self.run_sandbox("--stdin", "exec", "--", "sh", "-c", 'echo "$HOME|$PWD|$TMUX_TMPDIR"')
        self.assertEqual(r.returncode, 0, r.stderr)
        home, cwd, tmux = r.stdout.strip().split("|")
        self.assertEqual(home, str(self.home / "sandhome"))
        self.assertEqual(os.path.realpath(cwd), os.path.realpath(home))
        self.assertEqual(tmux, f"/tmp/aigw-sandbox-{os.getuid()}")

    def test_exec_passes_stdin_and_exit_status(self):
        env = {"HOME": str(self.home), "PATH": os.environ["PATH"]}
        r = subprocess.run(["sh", str(SANDBOX), "--stdin", "exec", "--", "sh", "-c", "cat; exit 3"],
                           input="abc", capture_output=True, text=True, env=env, timeout=10)
        self.assertEqual((r.returncode, r.stdout), (3, "abc"))

    def test_ip_is_loopback(self):
        self.assertEqual(self.run_sandbox("ip").stdout.strip(), "127.0.0.1")
        self.assertEqual(self.run_sandbox("ip", "--box", "x").stdout.strip(), "127.0.0.1")

    def test_anything_else_fails(self):
        r = self.run_sandbox("new", "x")
        self.assertEqual(r.returncode, 2)
        self.assertIn("not available", r.stderr)


if __name__ == "__main__":
    unittest.main()
