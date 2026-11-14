"""The core runs without any extension, and extensions plug in only through
the extension API (ext/README.md). Part of the core's own tests: it also runs
on the public snapshot, where the private extensions are left out.

    python3 -m unittest discover -s tests -v

A check the core does not meet yet may carry @PENDING
(unittest.expectedFailure) while it is being worked on; an unexpected
success fails the suite, so a mark cannot be forgotten.
"""
import json
import re
import tempfile
import textwrap
import unittest
from pathlib import Path

from test_shared_search import B

ROOT = Path(__file__).resolve().parent.parent
PENDING = unittest.expectedFailure

FAKE_EXT = '''
calls = []

def register(api):
    api.folder({"id": "fx", "name": "FX"}, undeletable=True, unshareable_reason="fx: one by one")
    api.session_group("fxg", infer=lambda meta: meta.get("label", "").startswith("fx: "), folder="fx")
    api.get(("fx", "counts"), lambda req, parts, qs, body: (200, {"n": 3}))
    api.peer_post(("fx", "poke"), "mail", lambda req, parts, qs, body: (200, {"poked": True}))
    api.archive_on_exit(lambda meta: meta.get("group") == "fxg")
    api.static(js=["fx.js"], css=["fx.css"])
    api.config("fx", lambda: {"on": True})
    calls.append("registered")
'''


def write_ext(base, name, source):
    d = Path(base) / name
    d.mkdir(parents=True)
    (d / "backend.py").write_text(textwrap.dedent(source))
    (d / "static").mkdir()
    return d


class _ExtCase(unittest.TestCase):
    """Loads the given extensions into the backend under test, and puts the
    real ones back afterwards (other test files expect them)."""
    exts = {}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "sessions"
        self.root.mkdir()
        ext_dir = Path(self.tmp.name) / "ext"
        ext_dir.mkdir()
        for name, src in self.exts.items():
            write_ext(ext_dir, name, src)
        stubs = {
            "session_roots": lambda: [self.root],
            "SESSIONS_DIR": self.root,
            "_unlockd_call": lambda verb, **fields: {"ok": True, "unlocked": True, "tier": "root"},
            "list_tmux_sessions": lambda: [],
            "list_host_tmux_sessions": lambda: [],
            "list_root_tmux_sessions": lambda: [],
            "ensure_watcher": lambda sid: None,
            "_load_links": lambda: {},
            "expire_links": lambda: None,
            "STATE_DIR": Path(self.tmp.name),
            "_folders_cache": {"key": None, "doc": None},
        }
        self.saved = {n: getattr(B, n) for n in stubs if hasattr(B, n)}
        for n, v in stubs.items():
            setattr(B, n, v)
        if hasattr(B, "load_extensions"):
            self.loaded = B.load_extensions(ext_dir)

    def tearDown(self):
        if hasattr(B, "load_extensions"):
            B.load_extensions(B.EXT_DIR)
        for n, v in self.saved.items():
            setattr(B, n, v)
        self.tmp.cleanup()

    def make(self, sid, **meta):
        (self.root / sid).mkdir()
        m = {"id": sid, "label": sid, "preset": "claude-tui", "tmux_location": "container", "stopped": True, **meta}
        (self.root / sid / "meta.json").write_text(json.dumps(m))


class NoExtensions(_ExtCase):
    exts = {}

    def test_loader_exists_and_loads_nothing(self):
        self.assertEqual(self.loaded, [])
        self.assertEqual(B.ext_config(), [])

    def test_no_builtin_folders(self):
        self.assertEqual(B.load_folders()["folders"], [])

    def test_no_groups(self):
        with self.assertRaises(ValueError):
            B.create_session("claude-tui", "x", group="fxg")
        self.assertIsNone(B.session_group({"group": "fxg"}))

    def test_extension_routes_absent(self):
        self.assertIsNone(B.ext_route("GET", ("fx", "counts")))
        self.assertIsNone(B.ext_peer_route("POST", ("fx", "poke"), "mail"))

    def test_sessions_of_an_unknown_group_still_listed(self):
        # Data from when an extension was installed: shown at the top, not lost.
        self.make("dddd00000001", group="gone-ext")
        rows = {s["id"]: s for s in B.list_sessions()}
        self.assertIn("dddd00000001", rows)
        self.assertIsNone(rows["dddd00000001"].get("group"))


class FakeExtension(_ExtCase):
    exts = {"fx": FAKE_EXT}

    def test_loaded(self):
        self.assertEqual(self.loaded, ["fx"])

    def test_folder(self):
        ids = [f["id"] for f in B.load_folders()["folders"]]
        self.assertEqual(ids[0], "fx")
        with self.assertRaises(ValueError):
            B.apply_folder_ops([{"op": "delete", "id": "fx"}])

    def test_group_recorded_and_inferred(self):
        self.assertEqual(B.session_group({"group": "fxg"}), "fxg")
        self.assertEqual(B.session_group({"label": "fx: a"}), "fxg")
        self.assertIsNone(B.session_group({"label": "a"}))

    def test_routes(self):
        h = B.ext_route("GET", ("fx", "counts"))
        self.assertEqual(h(None, ("fx", "counts"), {}, None), (200, {"n": 3}))
        self.assertIsNotNone(B.ext_peer_route("POST", ("fx", "poke"), "mail"))
        self.assertIsNone(B.ext_peer_route("POST", ("fx", "poke"), "devbox"))   # wrong peer

    def test_archive_on_exit(self):
        self.assertTrue(B.ext_archive_on_exit({"group": "fxg"}))
        self.assertFalse(B.ext_archive_on_exit({"group": None}))

    def test_config(self):
        self.assertEqual(B.ext_config(), [{"name": "fx", "js": ["fx.js"], "css": ["fx.css"], "config": {"fx": {"on": True}}}])


class BrokenExtension(_ExtCase):
    exts = {"aa_broken": "raise RuntimeError('boom')\n", "fx": FAKE_EXT}

    def test_broken_one_skipped_others_load(self):
        self.assertEqual(self.loaded, ["fx"])



# ---- the gateway's extension points (ext/<name>/gateway.py) ----
FAKE_GW_EXT = '''
def register(api):
    api.get("/agents/fxpage", lambda h, path, qs: h.seen.append(("get", path)) or True)
    api.post("/agents/fxpost", lambda h, path, qs: h.seen.append(("post", path)) or True)
    api.signup(lambda h, email, claims: h.seen.append(("signup", email)) or True)
'''


class GatewayExtension(unittest.TestCase):
    def setUp(self):
        from test_gateway_login import load_gateway
        self.G = load_gateway()
        self.tmp = tempfile.TemporaryDirectory()
        ext_dir = Path(self.tmp.name)
        d = ext_dir / "fx"
        d.mkdir()
        (d / "gateway.py").write_text(FAKE_GW_EXT)
        (ext_dir / "aa_broken").mkdir()
        (ext_dir / "aa_broken" / "gateway.py").write_text("raise RuntimeError('boom')\n")
        if hasattr(self.G, "load_extensions"):
            self.loaded = self.G.load_extensions(ext_dir)

    def tearDown(self):
        self.tmp.cleanup()

    def test_routes_and_signup(self):
        self.assertEqual(self.loaded, ["fx"])
        h = type("H", (), {"seen": []})()
        self.assertTrue(self.G.ext_handle("GET", h, "/agents/fxpage", {}))
        self.assertTrue(self.G.ext_handle("POST", h, "/agents/fxpost", {}))
        self.assertFalse(self.G.ext_handle("GET", h, "/agents/other", {}))
        self.assertTrue(self.G.ext_signup(h, "a@example.org", {}))
        self.assertEqual(h.seen, [("get", "/agents/fxpage"), ("post", "/agents/fxpost"), ("signup", "a@example.org")])

    def test_no_extensions(self):
        self.G.load_extensions(Path(self.tmp.name) / "none")
        h = type("H", (), {"seen": []})()
        self.assertFalse(self.G.ext_handle("GET", h, "/agents/fxpage", {}))
        self.assertFalse(self.G.ext_signup(h, "a@example.org", {}))

# The core's files never name an extension's feature. Words that only an
# extension uses; hexdigest/compare_digest are Python's own and fine.
EXT_WORDS = re.compile(r"(?i)(?<![a-z_])(?<!hex)(?<!compare_)digest"
                       r"|aigw_site_routes|site-extras|SiteExtras|SITE_CTX")   # the old site module (ext/site)
CORE_FILES = ["bin/aigw-backend", "bin/aigw-gateway", "bin/aigw-reap-idle",
              "static/app.js", "static/index.html", "static/i18n.js"]


class CorePurity(unittest.TestCase):
    def hits(self, rel):
        text = (ROOT / rel).read_text(errors="replace")
        return [i + 1 for i, line in enumerate(text.splitlines()) if EXT_WORDS.search(line)]

    def check(self, rel):
        lines = self.hits(rel)
        self.assertEqual(lines, [], f"{rel}: lines naming an extension's feature: {lines[:20]}")

    def test_backend(self):
        self.check("bin/aigw-backend")

    def test_gateway(self):
        self.check("bin/aigw-gateway")

    def test_reap_idle(self):
        self.check("bin/aigw-reap-idle")

    def test_app_js(self):
        self.check("static/app.js")

    def test_index_html(self):
        self.check("static/index.html")

    def test_i18n(self):
        self.check("static/i18n.js")

    def test_core_tests(self):
        own = Path(__file__).name
        bad = [p.name for p in (ROOT / "tests").glob("*.py") if p.name != own and self.hits(f"tests/{p.name}")]
        self.assertEqual(bad, [], "core tests that test an extension belong in ext/<name>/tests/")


if __name__ == "__main__":
    unittest.main()
