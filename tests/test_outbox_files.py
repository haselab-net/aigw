"""GET /sessions/<id>/files/<name>: a top-level outbox/ file is served by
whatever name the session gave it (Japanese, spaces), never anything
outside outbox/, and a plain file carries its save name in an RFC 5987
Content-Disposition.

    python3 -m unittest discover -s tests -v
"""
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote

from test_shared_search import B

SID = "cccc000000000001"


class OutboxFilesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        stubs = {
            "session_roots": lambda: [self.root],
            "_unlockd_call": lambda verb, **fields: {"ok": verb == "status", "unlocked": False},
            "list_tmux_sessions": lambda: [],
            "list_host_tmux_sessions": lambda: [],
            "list_root_tmux_sessions": lambda: [],
            "ensure_watcher": lambda sid: None,
            "_load_links": lambda: {},
            "expire_links": lambda: None,
        }
        self.saved = {name: getattr(B, name) for name in stubs}
        for name, value in stubs.items():
            setattr(B, name, value)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), B.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

        d = self.root / SID
        (d / "outbox").mkdir(parents=True)
        (d / "meta.json").write_text(json.dumps(
            {"id": SID, "label": SID, "preset": "shell", "tmux_location": "container", "stopped": True}))
        (d / "events.jsonl").write_text("")
        self.outbox = d / "outbox"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        for name, value in self.saved.items():
            setattr(B, name, value)
        self.tmp.cleanup()

    def get(self, raw_name):
        """`raw_name` goes into the URL as is (already percent-encoded)."""
        url = f"http://127.0.0.1:{self.server.server_port}/sessions/{SID}/files/{raw_name}"
        try:
            with urllib.request.urlopen(url) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def test_japanese_name(self):
        (self.outbox / "報告書.pdf").write_bytes(b"%PDF-1")
        status, headers, body = self.get(quote("報告書.pdf", safe=""))
        self.assertEqual(status, 200)
        self.assertEqual(body, b"%PDF-1")
        self.assertEqual(headers["Content-Type"], "application/pdf")
        self.assertIn("filename*=UTF-8''%E5%A0%B1%E5%91%8A%E6%9B%B8.pdf", headers["Content-Disposition"])
        self.assertTrue(headers["Content-Disposition"].startswith("inline;"))

    def test_name_with_spaces(self):
        (self.outbox / "my notes 2.txt").write_text("x")
        status, headers, body = self.get(quote("my notes 2.txt", safe=""))
        self.assertEqual((status, body), (200, b"x"))
        self.assertIn("filename*=UTF-8''my%20notes%202.txt", headers["Content-Disposition"])

    def test_frozen_snapshot_saves_under_its_original_name(self):
        name = f"{B.FROZEN_SNAPSHOT_PREFIX}1730000000000000_請求書.zip"
        (self.outbox / name).write_bytes(b"PK")
        status, headers, _ = self.get(quote(name, safe=""))
        self.assertEqual(status, 200)
        self.assertIn("filename*=UTF-8''" + quote("請求書.zip", safe=""), headers["Content-Disposition"])

    def test_image_has_no_content_disposition(self):
        (self.outbox / "図 1.png").write_bytes(b"\x89PNG")
        status, headers, _ = self.get(quote("図 1.png", safe=""))
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "image/png")
        self.assertIsNone(headers["Content-Disposition"])

    def test_ascii_name_still_served(self):
        (self.outbox / "out.glb").write_bytes(b"glTF")
        self.assertEqual(self.get("out.glb")[0], 200)

    def test_missing_file_is_404(self):
        self.assertEqual(self.get(quote("ない.pdf", safe=""))[0], 404)

    def test_cannot_leave_outbox(self):
        for raw in ("..", "%2E%2E", "..%2Fmeta.json", "%2E%2E%2Fmeta.json", "a%2F..%2F..%2Fmeta.json",
                    "..%5Cmeta.json", "a%00b", "."):
            self.assertEqual(self.get(raw)[0], 400, raw)

    def test_symlink_out_of_outbox_is_refused(self):
        os.symlink(self.root / SID / "meta.json", self.outbox / "link.json")
        self.assertEqual(self.get("link.json")[0], 400)

    def get_path(self, path):
        url = f"http://127.0.0.1:{self.server.server_port}/sessions/{SID}/{path}"
        try:
            with urllib.request.urlopen(url) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def host_dir(self):
        """A directory the session's sandbox cannot see, with a secret in it."""
        d = Path(tempfile.mkdtemp(dir=self.tmp.name, prefix="host-"))
        (d / "secret.txt").write_text("host only")
        (d / "sub").mkdir()
        (d / "sub" / "secret.txt").write_text("host only")
        return d

    def assert_nothing_served(self):
        for path in ("files/secret.txt", "outbox-dirs", "outbox-dirs?dir=sub",
                     "outbox-files/secret.txt", "outbox-files/sub/secret.txt"):
            status, body = self.get_path(path)
            self.assertNotEqual(status, 200, path)
            self.assertNotIn(b"host only", body, path)
            self.assertNotIn(b"secret", body, path)

    def test_outbox_swapped_for_a_symlink_serves_nothing(self):
        host = self.host_dir()
        self.outbox.rmdir()
        os.symlink(host, self.outbox)
        self.assert_nothing_served()

    def test_session_dir_swapped_for_a_symlink_serves_nothing(self):
        host = self.host_dir()
        real = Path(tempfile.mkdtemp(dir=self.tmp.name, prefix="elsewhere-"))
        (self.root / SID).rename(real / SID)
        (real / SID / "outbox").rmdir()
        os.symlink(host, real / SID / "outbox")
        os.symlink(real / SID, self.root / SID)
        self.assert_nothing_served()

    def test_scan_skips_a_symlink_out_of_outbox(self):
        host = self.host_dir()
        os.symlink(host / "secret.txt", self.outbox / "leak.txt")
        os.symlink(host / "sub", self.outbox / "leakdir")
        (self.outbox / "ok.txt").write_text("fine")
        os.symlink(self.outbox / "ok.txt", self.outbox / "alias.txt")  # stays inside: still shown
        events = []
        saved = B.append_event
        B.append_event = lambda sid, ev: events.append(ev)
        try:
            B._scan_outbox_for_attachments(SID, self.outbox, set())
        finally:
            B.append_event = saved
        shown = sorted(e["source_filename"] for e in events)
        self.assertEqual(shown, ["alias.txt", "ok.txt"])
        for f in self.outbox.iterdir():
            if f.is_file() and not f.is_symlink():
                self.assertNotEqual(f.read_text(), "host only", f.name)

    def test_scan_skips_an_outbox_that_links_out(self):
        host = self.host_dir()
        self.outbox.rmdir()
        os.symlink(host, self.outbox)
        events = []
        saved = B.append_event
        B.append_event = lambda sid, ev: events.append(ev)
        try:
            B._scan_outbox_for_attachments(SID, self.outbox, set())
        finally:
            B.append_event = saved
        self.assertEqual(events, [])
        self.assertEqual(sorted(p.name for p in host.iterdir()), ["secret.txt", "sub"])  # no snapshot written there

    def test_swapped_after_opening_still_reads_what_was_checked(self):
        host = self.host_dir()
        (self.outbox / "a.txt").write_text("mine")
        fd = B.open_in_outbox(SID, "a.txt")
        try:
            (self.outbox / "a.txt").unlink()
            os.symlink(host / "secret.txt", self.outbox / "a.txt")
            self.assertEqual(os.read(fd, 100), b"mine")
        finally:
            os.close(fd)

    def test_links_inside_outbox_are_followed_and_links_out_are_not(self):
        host = self.host_dir()
        (self.outbox / "run3").mkdir()
        (self.outbox / "run3" / "img.png").write_bytes(b"\x89PNG")
        os.symlink("run3", self.outbox / "latest")                        # relative, a directory
        os.symlink(self.outbox / "run3" / "img.png", self.outbox / "abs.png")  # absolute, inside
        os.symlink("../img.png", self.outbox / "run3" / "up.png")             # inside, but nothing there
        os.symlink("../run3/img.png", self.outbox / "run3" / "back.png")      # .. back into outbox
        os.symlink("../../meta.json", self.outbox / "run3" / "out.json")      # leaves outbox
        os.symlink(host, self.outbox / "hostdir")
        self.assertEqual(B.read_outbox_file(SID, "latest/img.png"), b"\x89PNG")
        self.assertEqual(B.read_outbox_file(SID, "abs.png"), b"\x89PNG")
        self.assertEqual(B.read_outbox_file(SID, "run3/back.png"), b"\x89PNG")
        for rel in ("run3/out.json", "hostdir/secret.txt", "../meta.json", "run3/../../meta.json"):
            with self.assertRaises((ValueError, OSError), msg=rel):
                B.read_outbox_file(SID, rel)
        with self.assertRaises(OSError):
            B.read_outbox_file(SID, "run3/up.png")  # outbox/img.png does not exist
        dirs, files = B.list_outbox_entries(SID, "")
        self.assertEqual(dirs, ["latest", "run3"])          # not hostdir
        self.assertIn("abs.png", [f["name"] for f in files])
        _, files = B.list_outbox_entries(SID, "latest")
        self.assertEqual(sorted(f["name"] for f in files), ["back.png", "img.png"])  # not out.json, up.png

    def test_snapshot_never_writes_through_a_planted_link(self):
        host = self.host_dir()
        (self.outbox / "a.txt").write_text("from the session")
        mtime = (self.outbox / "a.txt").stat().st_mtime
        frozen = f"{B.FROZEN_SNAPSHOT_PREFIX}{int(mtime * 1_000_000)}_a.txt"
        os.symlink(host / "planted.txt", self.outbox / frozen)  # dangling, predictable name
        B._freeze_outbox_snapshot(SID, "a.txt", mtime)
        self.assertFalse((host / "planted.txt").exists())

    def test_snapshot_refuses_a_name_swapped_for_a_link_out(self):
        host = self.host_dir()
        os.symlink(host / "secret.txt", self.outbox / "a.txt")
        with self.assertRaises(OSError):
            B._freeze_outbox_snapshot(SID, "a.txt", 1.0)
        self.assertEqual([p.name for p in self.outbox.iterdir()], ["a.txt"])

    def test_carry_over_copies_plain_files_only(self):
        host = self.host_dir()
        (self.outbox / "a.txt").write_text("mine")
        os.symlink(host / "secret.txt", self.outbox / "leak.txt")
        new = self.root / "dddd000000000002"
        (new / "outbox").mkdir(parents=True)
        B._carry_over_history(SID, new)
        self.assertEqual(sorted(p.name for p in (new / "outbox").iterdir()), ["a.txt"])

    def test_too_long_name(self):
        self.assertEqual(self.get(quote("あ" * 86, safe=""))[0], 400)  # 258 bytes


if __name__ == "__main__":
    unittest.main()
