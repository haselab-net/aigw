"""A folder's 作業フォルダ (the deployment notes, 2026-11-04): ＋ starts a
session there (made first), and a new session started in or under one is
filed into that folder.

    python3 -m unittest discover -s tests -v
"""
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B


class FolderWorkdirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = (B.STATE_DIR, B.SANDHOME, B.HOME)
        root = Path(self.tmp.name)
        B.STATE_DIR = root / "state"
        B.HOME = root / "home"
        B.SANDHOME = B.HOME / "sandhome"
        B.SANDHOME.mkdir(parents=True)
        B.apply_folder_ops([
            {"op": "put", "folder": {"id": "fa", "name": "A", "workdir": "~/proj/a/"}},
            {"op": "put", "folder": {"id": "fb", "name": "B", "parent": "fa", "workdir": "proj/a/b"}},
            {"op": "put", "folder": {"id": "fc", "name": "C", "parent": "fa"}},
            {"op": "put", "folder": {"id": "fz", "name": "Z", "workdir": "old", "archived": True}},
        ])

    def tearDown(self):
        B.STATE_DIR, B.SANDHOME, B.HOME = self.saved
        self.tmp.cleanup()

    def test_normalize(self):
        self.assertEqual(B.normalize_folder_workdir(" ~/x//y/./ "), "x/y")
        self.assertEqual(B.normalize_folder_workdir("/x"), "x")
        with self.assertRaises(ValueError):
            B.normalize_folder_workdir("x/../../etc")
        doc = B.load_folders()
        self.assertEqual(next(f for f in doc["folders"] if f["id"] == "fa")["workdir"], "proj/a")

    def test_plus_makes_dir_and_inherits(self):
        self.assertEqual(B.folder_cwd_for_new_session("claude-tui", "fc"), "proj/a")
        self.assertTrue((B.SANDHOME / "proj/a").is_dir())
        self.assertEqual(B.folder_cwd_for_new_session("host-shell", "fb"), str(B.HOME / "proj/a/b"))
        self.assertTrue((B.HOME / "proj/a/b").is_dir())
        self.assertIsNone(B.folder_cwd_for_new_session("mail-tui", "fa"))

    def test_auto_filing(self):
        B.file_new_session({"id": "s1", "cwd": str(B.SANDHOME / "proj/a/b/deep")}, "claude-tui")
        B.file_new_session({"id": "s2", "cwd": str(B.SANDHOME / "proj/a")}, "shell")
        B.file_new_session({"id": "s3", "cwd": str(B.SANDHOME / "proj/ab")}, "claude-tui")
        B.file_new_session({"id": "s4", "cwd": str(B.SANDHOME / "old")}, "claude-tui")
        B.file_new_session({"id": "s5", "cwd": str(B.HOME / "proj/a")}, "host-shell")
        B.file_new_session({"id": "s6", "cwd": None}, "claude-tui", "fc")
        B.file_new_session({"id": "s7", "cwd": str(B.SANDHOME / "proj/a")}, "claude-tui-otherbox")
        a = B.load_folders()["assign"]
        self.assertEqual(a, {"s1": "fb", "s2": "fa", "s5": "fa", "s6": "fc"})


if __name__ == "__main__":
    unittest.main()
