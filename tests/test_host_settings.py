"""The `claude` shell function typed into a shell pane (the deployment notes,
the deployment notes, 2026-11-10): on the host it passes the
managed settings (the aigw-task-hook hooks) as --settings too, since an
organization's remote settings replace /etc/claude-code/managed-settings.json.

    python3 -m unittest discover -s tests -v
"""
import importlib.machinery
import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "bin" / "aigw-backend"


def load():
    loader = importlib.machinery.SourceFileLoader("aigw_backend_host_settings", str(SCRIPT))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


B = load()


class HostSettingsTest(unittest.TestCase):
    def func(self, location, settings_exists=True):
        sent = []
        orig_exec, orig_path = B.tmux_exec, B.HOST_MANAGED_SETTINGS
        with tempfile.NamedTemporaryFile() as f:
            B.tmux_exec = lambda loc, args: sent.append(args)
            B.HOST_MANAGED_SETTINGS = f.name if settings_exists else f.name + ".missing"
            try:
                B._inject_claude_session_id_wrapper(location, "t")
            finally:
                B.tmux_exec, B.HOST_MANAGED_SETTINGS = orig_exec, orig_path
            return sent[0][3], f.name

    def run_func(self, body, *calls):
        with tempfile.TemporaryDirectory() as d:
            fake = os.path.join(d, "claude")
            with open(fake, "w") as f:
                f.write('#!/bin/sh\necho "$*"\n')
            os.chmod(fake, 0o755)
            script = body + "\n" + "\n".join(calls)
            env = dict(os.environ, PATH=d + ":" + os.environ["PATH"], AIGW_SESSION_ID="abc")
            return subprocess.run(["bash", "-c", script], env=env, capture_output=True, text=True).stdout.splitlines()

    def test_host_gets_settings(self):
        body, path = self.func("root")
        out = self.run_func(body, "claude", "claude --resume x", "claude auth login")
        self.assertEqual(out, [f"--settings {path} --session-id abc", f"--settings {path} --resume x", "auth login"])

    def test_container_does_not(self):
        body, _ = self.func("container")
        self.assertEqual(self.run_func(body, "claude"), ["--session-id abc"])

    def test_no_file_no_flag(self):
        body, _ = self.func("host", settings_exists=False)
        self.assertEqual(self.run_func(body, "claude"), ["--session-id abc"])


if __name__ == "__main__":
    unittest.main()
