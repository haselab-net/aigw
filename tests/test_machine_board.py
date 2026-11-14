"""The Windows machines' blackboard (the deployment notes, 2026-11-06):
sessions on a Windows machine appear by themselves; claims from inside a
session (aigw-board, through the talkto file) and from the page; the check
marks ended (stopped / fell / deleted) and long-idle (30 min) entries.

    python3 -m unittest discover -s tests -v
"""
import json
import tempfile
import time
import unittest
from pathlib import Path

from test_shared_search import B


class BoardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "board").mkdir()
        (root / "s").mkdir()
        self.root = root
        self.rows = []
        self.saved = {n: getattr(B, n) for n in ("BOARD_DIR", "BOARD_PATH", "BOARD_LOCK_PATH", "SSH_MACHINES",
                                                 "list_sessions", "session_roots", "_board_ssh_uses",
                                                 "BOARD_SSH_CONFIG")}
        B.BOARD_DIR = root / "board"
        B.BOARD_PATH = B.BOARD_DIR / "board.json"
        B.BOARD_LOCK_PATH = B.BOARD_DIR / "board.lock"
        B.SSH_MACHINES = {"win1": {"drives": True}, "win1-desktop": {"drives": True, "ssh_host": "win1"},
                          "win2": {"drives": True}, "linux1": {}}
        B.list_sessions = lambda on_behalf_of=None: self.rows
        B.session_roots = lambda: [root / "s"]
        self.ssh = {}
        B._board_ssh_uses = lambda talkto: dict(self.ssh)
        B.BOARD_SSH_CONFIG = str(root / "ssh_config")

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)
        self.tmp.cleanup()

    def sess(self, sid, events_ts=None, **kw):
        d = self.root / "s" / sid
        d.mkdir(exist_ok=True)
        (d / "meta.json").write_text(json.dumps({"id": sid, "label": "L-" + sid}))
        (d / "events.jsonl").write_text(json.dumps({"type": "agent_output", "ts": events_ts or time.time(), "text": "x"}) + "\n")
        row = {"id": sid, "label": "L-" + sid, "alive": True, "stopped": False, **kw}
        self.rows.append(row)
        return row

    def entries(self):
        return B.board_view()["entries"]

    def test_machines(self):
        self.assertEqual(B.board_machines(), ["win1", "win2"])

    def test_auto_entry_for_session_on_windows_and_its_end(self):
        row = self.sess("aaaaaaaaaaa1", tmux_location="ssh:win1-desktop")
        self.sess("aaaaaaaaaaa2", tmux_location="ssh:linux1")
        self.sess("aaaaaaaaaaa3", tmux_location="container")
        B.board_check()
        es = self.entries()
        self.assertEqual([(e["machine"], e["session_id"], e["source"], e["state"]) for e in es],
                         [("win1", "aaaaaaaaaaa1", "auto", "using")])
        B.board_check()
        self.assertEqual(len(self.entries()), 1)  # not added twice
        row.update(alive=False)
        B.board_check()
        e = self.entries()[0]
        self.assertEqual((e["state"], e["ended_why"]), ("ended", "fell"))

    def test_machine_asleep_is_not_fell(self):
        B.SSH_MACHINES["win1"].update(wol_mac="00:11:22:33:44:55", wol_via="jump", wol_broadcast="10.0.0.255")
        up = {"win1": False}
        saved = B.ssh_reachable
        B.ssh_reachable = lambda m, wait=True: up.get(m, True)
        self.addCleanup(setattr, B, "ssh_reachable", saved)
        row = self.sess("ccccccccccc1", tmux_location="ssh:win1-desktop")
        B.board_check()
        row.update(alive=False)          # the machine went to sleep
        B.board_check()
        self.assertEqual([e["state"] for e in self.entries()], ["asleep"])
        row.update(alive=True)           # woken: the same entry carries on
        up["win1"] = True
        B.board_check()
        self.assertEqual([e["state"] for e in self.entries()], ["using"])
        row.update(alive=False)          # awake and gone: it fell
        B.board_check()
        self.assertEqual([(e["state"], e.get("ended_why")) for e in self.entries()], [("ended", "fell")])

    def test_claim_from_session_idle_and_stop(self):
        row = self.sess("bbbbbbbbbbb1", tmux_location="container", events_ts=time.time() - 3600)
        status, msg = B.board_from_session("bbbbbbbbbbb1", {"op": "use", "machine": "win2-desktop" if False else "win2", "what": "Unity のビルド"})
        self.assertEqual(status, "ok")
        self.assertIn("win2", msg)
        B.board_check()
        e = self.entries()[0]
        self.assertEqual((e["machine"], e["what"], e["state"]), ("win2", "Unity のビルド", "idle"))
        self.assertIn("30分以上動きなし", B.board_text())
        row.update(stopped=True)
        B.board_check()
        self.assertEqual(self.entries()[0]["ended_why"], "stopped")

    def test_unknown_machine_and_release(self):
        self.sess("ccccccccccc1", tmux_location="container")
        self.assertEqual(B.board_from_session("ccccccccccc1", {"op": "use", "machine": "nope"})[0], "failed")
        B.board_from_session("ccccccccccc1", {"op": "use", "machine": "win1", "what": "a"})
        B.board_from_session("ccccccccccc1", {"op": "note", "what": "b"})
        self.assertEqual(self.entries()[0]["what"], "b")
        B.board_from_session("ccccccccccc1", {"op": "done"})
        self.assertEqual(self.entries()[0]["ended_why"], "released")
        self.assertEqual(B.board_from_session("ccccccccccc1", {"op": "done"})[0], "failed")

    def test_talkto_line_parsing(self):
        items = B._parse_talkto_lines([json.dumps({"id": "abcdef0123456789", "board": {"op": "show"}}).encode(),
                                       json.dumps({"id": "abcdef0123456780", "text": "hi"}).encode()])
        self.assertEqual(items[0][1], {"op": "show"})
        self.assertEqual(items[1][1], "hi")


    def test_ssh_names_and_targets(self):
        Path(B.BOARD_SSH_CONFIG).write_text(
            "Host jump\n    HostName 10.0.0.1\n"
            "Host win1 oldname  # old name\n    HostName 10.0.0.5\n    HostKeyAlias old.local\n"
            "Host *\n    User x\n")
        names = B._board_ssh_names()
        for n in ("win1", "win1-desktop", "oldname", "10.0.0.5", "old.local", "win2"):
            self.assertIn(n, names)
        self.assertEqual(names["oldname"], "win1")
        self.assertNotIn("jump", names)
        self.assertNotIn("10.0.0.1", names)
        t = lambda *a: B._board_ssh_target(list(a), names)
        self.assertEqual(t("ssh", "-F", "/x/config", "OldName", "dir"), "win1")
        self.assertEqual(t("scp", "a.txt", "user@win2:/c/tmp/"), "win2")
        self.assertEqual(t("ssh", "-W", "[10.0.0.5]:22", "jump"), "win1")
        self.assertIsNone(t("ssh", "jump", "ls"))
        self.assertIsNone(t("ssh", "linux1"))

    def test_ssh_from_session_appears_ends_and_revives(self):
        self.sess("ccccccccccc1", tmux_location="container")
        self.ssh = {("ccccccccccc1", "win2"): "ssh win2"}
        B.board_check()
        es = self.entries()
        self.assertEqual([(e["machine"], e["source"], e["state"], e["command"]) for e in es],
                         [("win2", "ssh", "using", "ssh win2")])
        B.board_check()
        self.assertEqual(len(self.entries()), 1)
        self.ssh = {}
        B.board_check()
        e = self.entries()[0]
        self.assertEqual((e["state"], e["ended_why"]), ("ended", "disconnected"))
        self.assertIn("SSH終了", B.board_text())
        self.ssh = {("ccccccccccc1", "win2"): "scp x win2:"}
        B.board_check()
        es = self.entries()
        self.assertEqual(len(es), 1)
        self.assertEqual((es[0]["state"], es[0]["command"]), ("using", "scp x win2:"))
        self.assertNotIn("ended_why", es[0])

    def test_ssh_entry_of_stopped_session(self):
        row = self.sess("ccccccccccc2", tmux_location="container")
        self.ssh = {("ccccccccccc2", "win1"): "ssh win1"}
        B.board_check()
        row.update(stopped=True, alive=False)
        self.ssh = {}
        B.board_check()
        e = self.entries()[0]
        self.assertEqual((e["state"], e["ended_why"]), ("ended", "stopped"))

    def test_ssh_uses_reads_proc(self):
        # The real scan: no process of ours carries a made-up talkto path.
        B._board_ssh_uses = self.saved["_board_ssh_uses"]
        self.assertEqual(B._board_ssh_uses({"/nonexistent/talkto": "x"}), {})


if __name__ == "__main__":
    unittest.main()
