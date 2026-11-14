"""aigw-passkey revoke (2026-11-04): revoking one key while another
root-capable one remains only closes the window; only the last one stops
the root tmux server and every pane in it.

    python3 -m unittest discover -s tests -v
"""
import importlib.machinery
import importlib.util
import unittest
from pathlib import Path

_path = Path(__file__).resolve().parent.parent / "bin" / "aigw-unlockd"
_loader = importlib.machinery.SourceFileLoader("aigw_unlockd", str(_path))
_spec = importlib.util.spec_from_loader("aigw_unlockd", _loader)
U = importlib.util.module_from_spec(_spec)
try:
    # Needs fido2 (aigw's venv) and a readable /etc/aigw/webauthn.json:
    # run as root with /opt/aigw/venv/bin/python3; skipped elsewhere.
    _loader.exec_module(U)
except (ImportError, SystemExit) as e:
    raise unittest.SkipTest(f"aigw-unlockd not importable here: {e!r}")


def cred(cid, tier="root", be=False):
    return {"id": cid, "tier": tier, "backup_eligible": be}


class RevokeTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.store = {"credentials": []}
        stubs = {
            "_resolve_uid": lambda user: 1001,
            "_require_peer_is_user_or_root": lambda uid, user: None,
            "_load_creds": lambda user: self.store,
            "_save_creds": lambda user, store: None,
            "_stop_unit": lambda user: self.calls.append("stop"),
            "_revoke_access": lambda user: self.calls.append("sever") or True,
            "_audit": lambda *a, **k: None,
            "_peer_sudo_user": lambda pid: None,
            "ROOT_REQUIRES": "device_bound",
        }
        self.saved = {n: getattr(U, n) for n in stubs}
        for n, v in stubs.items():
            setattr(U, n, v)

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(U, n, v)

    def revoke(self, cid):
        return U.verb_revoke_credential(0, 1, {"user": "u", "credential_id": cid})

    def test_other_root_key_left_only_severs(self):
        self.store["credentials"] = [cred("a"), cred("b")]
        self.assertEqual(self.revoke("a"), {"ok": True, "stopped_panes": False})
        self.assertEqual(self.calls, ["sever"])

    def test_last_root_key_stops(self):
        # a host-tier key and a synced root key cannot reopen the root window
        self.store["credentials"] = [cred("a"), cred("h", tier="host"), cred("s", be=True)]
        self.assertEqual(self.revoke("a"), {"ok": True, "stopped_panes": True})
        self.assertEqual(self.calls, ["stop"])

    def test_stop_flag_stops_even_with_other_root_key(self):
        self.store["credentials"] = [cred("a"), cred("b")]
        r = U.verb_revoke_credential(0, 1, {"user": "u", "credential_id": "a", "stop_panes": True})
        self.assertEqual(r, {"ok": True, "stopped_panes": True})
        self.assertEqual(self.calls, ["stop"])

    def test_stop_flag_must_be_true_not_truthy(self):
        self.store["credentials"] = [cred("a"), cred("b")]
        r = U.verb_revoke_credential(0, 1, {"user": "u", "credential_id": "a", "stop_panes": "yes"})
        self.assertEqual(r, {"ok": True, "stopped_panes": False})
        self.assertEqual(self.calls, ["sever"])

    def test_unknown_key_touches_nothing(self):
        self.store["credentials"] = [cred("a")]
        self.assertFalse(self.revoke("zz")["ok"])
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
