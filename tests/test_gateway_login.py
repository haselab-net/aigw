"""/agents/login starts an OAuth login (new aigw_oauth_state / aigw_next
cookies) only for a real page navigation: an image or fetch() that nginx's
auth_request bounced there must not replace a login the user is in the
middle of (2026-10-17).

    python3 -m unittest discover -s tests -v
"""
import http.client
import importlib.machinery
import importlib.util
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

GATEWAY = Path(__file__).resolve().parent.parent / "bin" / "aigw-gateway"


def load_gateway():
    loader = importlib.machinery.SourceFileLoader("aigw_gateway_under_test", str(GATEWAY))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


G = load_gateway()


class LoginRouteTest(unittest.TestCase):
    def setUp(self):
        self.saved = G.load_oauth_client
        G.load_oauth_client = lambda: {"client_id": "cid", "client_secret": "x"}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), G.Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        G.load_oauth_client = self.saved

    def get(self, headers):
        c = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=10)
        c.request("GET", f"{G.BASE_PATH}/login?next=/sandbox/port9000/x/shot", headers=headers)
        r = c.getresponse()
        if r.status != 302:  # a redirect here carries no body or length
            r.read()
        cookies = [v for k, v in r.getheaders() if k.lower() == "set-cookie"]
        c.close()
        return r.status, cookies

    def test_background_requests_do_not_start_a_login(self):
        for mode in ("no-cors", "cors", "same-origin"):
            status, cookies = self.get({"Sec-Fetch-Mode": mode, "Sec-Fetch-Dest": "image"})
            self.assertEqual(status, 401, mode)
            self.assertFalse([c for c in cookies if G.OAUTH_STATE_COOKIE in c or G.NEXT_COOKIE in c], mode)

    def test_navigation_starts_a_login(self):
        status, cookies = self.get({"Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"})
        self.assertEqual(status, 302)
        self.assertTrue(any(c.startswith(G.OAUTH_STATE_COOKIE + "=") for c in cookies))

    def test_browser_without_fetch_metadata_still_logs_in(self):
        status, cookies = self.get({})
        self.assertEqual(status, 302)
        self.assertTrue(any(c.startswith(G.OAUTH_STATE_COOKIE + "=") for c in cookies))


if __name__ == "__main__":
    unittest.main()
