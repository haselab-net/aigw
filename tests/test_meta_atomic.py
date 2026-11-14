"""meta.json is never seen half-written (the deployment notes): an
Email session's transcript tailer once read it empty while it was being
rewritten, and died -- that session's chat log never got Claude's replies.

    python3 -m unittest discover -s tests -v
"""
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path

from test_shared_search import B


class MetaAtomicTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.saved = {"session_roots": B.session_roots}
        B.session_roots = lambda: [self.root]
        (self.root / "a00000000001").mkdir()

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(B, name, value)
        self.tmp.cleanup()

    def test_readers_never_see_partial(self):
        sid = "a00000000001"
        B.save_meta(sid, {"id": sid, "pad": "x" * 20000, "n": 0})
        stop = threading.Event()
        errors = []

        def writer(k):
            n = 0
            while not stop.is_set():
                n += 1
                try:
                    B.save_meta(sid, {"id": sid, "pad": "x" * (20000 + k), "n": n})
                except Exception as e:      # pragma: no cover - the failure being tested
                    errors.append(e)

        def reader():
            for _ in range(2000):
                try:
                    m = B.load_meta(sid)
                    if m is None or m["id"] != sid:
                        errors.append(m)
                except Exception as e:      # pragma: no cover
                    errors.append(e)

        ws = [threading.Thread(target=writer, args=(k,)) for k in range(3)]
        rs = [threading.Thread(target=reader) for _ in range(3)]
        for t in ws + rs:
            t.start()
        for t in rs:
            t.join()
        stop.set()
        for t in ws:
            t.join()
        self.assertEqual(errors, [])
        left = [p.name for p in (self.root / sid).iterdir() if p.name.endswith(".tmp")]
        self.assertEqual(left, [])

    def test_half_written_is_retried(self):
        sid = "a00000000001"
        p = self.root / sid / "meta.json"
        p.write_text("")
        t = threading.Timer(0.08, lambda: p.write_text(json.dumps({"id": sid})))
        t.start()
        self.assertEqual(B.load_meta(sid), {"id": sid})
        t.join()


if __name__ == "__main__":
    unittest.main()
