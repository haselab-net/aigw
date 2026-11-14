"""Sharing by folder (the deployment notes, 2026-11-04): a folder shared
with someone shares every session in it and in the folders under it, with
the limits sharing one session has.

    python3 -m unittest discover -s tests -v
"""
import getpass
import pwd
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B

# Someone to share with: a real account (sharing checks it exists) that is
# not whoever runs the tests (sharing with yourself is refused) -- so not a
# fixed "root", which made the suite fail when run as root.
OTHER = next(u for u in ["nobody", "root"] + [p.pw_name for p in pwd.getpwall()]
             if u != getpass.getuser() and u in {p.pw_name for p in pwd.getpwall()})


class FolderSharingTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = (B.STATE_DIR, B.MAIL_PRESETS)
        B.STATE_DIR = Path(self.tmp.name)
        B.MAIL_PRESETS = {"mail-tui"}
        B.apply_folder_ops([
            {"op": "put", "folder": {"id": "fa", "name": "A"}},
            {"op": "put", "folder": {"id": "fb", "name": "B", "parent": "fa"}},
            {"op": "put", "folder": {"id": "fc", "name": "C"}},
            {"op": "assign", "session": "s1", "folder": "fb"},
            {"op": "assign", "session": "s2", "folder": "fb"},
            {"op": "assign", "session": "s3", "folder": "fb"},
            {"op": "assign", "session": "s4", "folder": "fc"},
        ])

    def tearDown(self):
        B.STATE_DIR, B.MAIL_PRESETS = self.saved
        self.tmp.cleanup()

    def mode(self, sid, preset="claude-tui", user=OTHER):
        return B.share_mode({"id": sid, "preset": preset}, user)

    def test_inherited_from_parent(self):
        self.assertIsNone(self.mode("s1"))
        B.apply_folder_ops([{"op": "share", "id": "fa", "username": OTHER, "mode": "write"}])
        self.assertEqual(self.mode("s1"), "write")
        self.assertEqual(self.mode("s1", preset="root-shell"), "read")
        self.assertIsNone(self.mode("s2", preset="mail-tui"))
        self.assertIsNone(self.mode("s4"))
        self.assertIsNone(self.mode("unfiled"))
        B.apply_folder_ops([{"op": "unshare", "id": "fa", "username": OTHER}])
        self.assertIsNone(self.mode("s1"))

    def test_everyone_read_only(self):
        B.apply_folder_ops([{"op": "share", "id": "fb", "username": "*", "mode": "read"}])
        self.assertEqual(self.mode("s3", user="anyone"), "read")
        with self.assertRaises(ValueError):
            B.apply_folder_ops([{"op": "share", "id": "fb", "username": "*", "mode": "write"}])
        with self.assertRaises(ValueError):
            B.apply_folder_ops([{"op": "share", "id": "fb", "username": "no-such-user-xyz"}])

    def test_put_keeps_shares_and_moving_out_unshares(self):
        B.apply_folder_ops([{"op": "share", "id": "fb", "username": OTHER, "mode": "read"}])
        B.apply_folder_ops([{"op": "put", "folder": {"id": "fb", "name": "B2", "shared_read": []}}])
        self.assertEqual(self.mode("s1"), "read")
        B.apply_folder_ops([{"op": "assign", "session": "s1", "folder": ""}])
        self.assertIsNone(self.mode("s1"))


if __name__ == "__main__":
    unittest.main()
