"""POST /notify (the deployment notes): a push not tied to a session, from this
user's own devbox or Email box only, with a same-site url and a rate limit.

    python3 -m unittest discover -s tests -v
"""
import unittest

from test_shared_search import B


class NotifyApiTest(unittest.TestCase):
    def setUp(self):
        self.saved = {n: getattr(B, n) for n in ("container_ip", "box_ip", "MAILBOX", "NOTIFY_RATE")}
        B.container_ip = lambda: "172.17.0.5"
        B.box_ip = lambda name: {"mail": "172.17.0.9"}[name]
        B.MAILBOX = {"container_name": "mail"}
        B._notify_peers.clear()
        B._notify_sent.clear()

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(B, n, v)
        B._notify_peers.clear()
        B._notify_sent.clear()

    def test_peers(self):
        self.assertEqual(B.notify_peer_kind("172.17.0.5"), "devbox")
        self.assertEqual(B.notify_peer_kind("172.17.0.9"), "mail")
        self.assertIsNone(B.notify_peer_kind("172.17.0.7"))

    def test_no_mailbox_configured(self):
        B.MAILBOX = None
        self.assertIsNone(B.notify_peer_kind("172.17.0.9"))
        self.assertEqual(B.notify_peer_kind("172.17.0.5"), "devbox")

    def test_payload(self):
        p = B.notify_payload({"title": "待ち", "message": "成立しました", "url": "/email/"})
        self.assertEqual((p["title"], p["message"], p["url"], p["session_id"]), ("待ち", "成立しました", "/email/", None))
        self.assertEqual(B.notify_payload({"message": "x"})["title"], "aigw")
        for bad in ({"message": ""}, {"message": "x", "url": "//evil.example/"}, {"message": "x", "url": "https://evil.example/"},
                    {"message": "x", "url": "/\\\\evil"}, {"message": "x" * 301}, {"message": "x", "title": "t" * 61},
                    {"message": 1}, []):
            with self.assertRaises(ValueError, msg=bad):
                B.notify_payload(bad)

    def test_rate(self):
        B.NOTIFY_RATE = (3, 600)
        self.assertEqual([B.notify_rate_ok() for _ in range(4)], [True, True, True, False])


if __name__ == "__main__":
    unittest.main()
