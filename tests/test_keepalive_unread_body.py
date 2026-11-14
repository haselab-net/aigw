"""A POST answered without reading its body must not desync a kept-alive
connection: aigw-gateway pools its connections to the backend, so leftover
body bytes ("{}") used to become the start of the next request ("{}GET ..."
-> 501 -> 502 at the gateway -> 500 for /email/'s auth_request).

    python3 -m unittest discover -s tests -v
"""
import http.server
import re
import socket
import threading
import unittest

from test_shared_search import B

STOP = (b"POST /sessions/000000000000/stop HTTP/1.1\r\nHost: x\r\n"
        b"Content-Type: application/json\r\nContent-Length: %d\r\n\r\n")


class KeepAliveUnreadBodyTest(unittest.TestCase):
    def setUp(self):
        self.saved = B.resolve_session_access
        B.resolve_session_access = lambda sid, who: (None, (404, {"error": "no such session"}))
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), B.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        B.resolve_session_access = self.saved

    def _statuses(self, payload, want):
        s = socket.create_connection(self.server.server_address, timeout=5)
        try:
            s.sendall(payload)
            buf = b""
            while len(re.findall(rb"HTTP/1\.1 \d{3}", buf)) < want:
                d = s.recv(65536)
                if not d:
                    break
                buf += d
        finally:
            s.close()
        return [int(m) for m in re.findall(rb"HTTP/1\.1 (\d{3})", buf)]

    def test_second_request_on_same_connection_is_parsed(self):
        self.assertEqual(self._statuses(STOP % 2 + b"{}" + STOP % 2 + b"{}", 2), [404, 404])

    def test_oversized_unread_body_closes_instead_of_reading(self):
        n = B.Handler.UNREAD_BODY_DRAIN_MAX + 1
        s = socket.create_connection(self.server.server_address, timeout=5)
        try:
            s.sendall(STOP % n)
            buf = b""
            while True:
                d = s.recv(65536)
                if not d:
                    break  # the server closed the connection
                buf += d
            self.assertEqual(re.findall(rb"HTTP/1\.1 (\d{3})", buf), [b"404"])
        finally:
            s.close()


if __name__ == "__main__":
    unittest.main()
