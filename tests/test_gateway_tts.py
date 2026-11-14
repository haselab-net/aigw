"""Read-aloud through Google Cloud Text-to-Speech (the deployment notes,
2026-11-11): only a Google voice name and a bounded text, a cache that does
not count twice, and a monthly allowance per host.

    python3 -m unittest discover -s tests -v
"""
import base64
import tempfile
import unittest
from pathlib import Path

from test_gateway_login import G


class TtsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.saved = {n: getattr(G, n) for n in ("TTS_KEY_PATH", "TTS_USAGE_PATH", "TTS_FREE_MONTHLY", "_tts_google")}
        G.TTS_KEY_PATH = d / "key"
        G.TTS_KEY_PATH.write_text("k\n")
        G.TTS_USAGE_PATH = d / "usage.json"
        self.calls = []

        def google(method, path, body=None):
            self.calls.append((method, path, body))
            return {"audioContent": base64.b64encode(b"MP3" + body["input"]["text"].encode()).decode()}
        G._tts_google = google
        G._tts_cache.clear()
        G._tts_user_times.clear()

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(G, n, v)
        self.tmp.cleanup()

    def test_synthesize_and_cache(self):
        code, mp3 = G.tts_synthesize("u", {"text": "こんにちは", "voice": "ja-JP-Wavenet-B"})
        self.assertEqual((code, mp3), (200, "MP3こんにちは".encode()))
        self.assertEqual(self.calls[0][2]["voice"], {"languageCode": "ja-JP", "name": "ja-JP-Wavenet-B"})
        G.tts_synthesize("u", {"text": "こんにちは", "voice": "ja-JP-Wavenet-B"})
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(G._tts_month_used("Wavenet"), 5)

    def test_refuses(self):
        for bad in ({"text": "", "voice": "ja-JP-Wavenet-B"}, {"text": "あ" * 401, "voice": "ja-JP-Wavenet-B"},
                    {"text": "x", "voice": "../x"}, {"text": "x"}, [], {"text": "x", "voice": "ja-JP-Neural2-B"}):
            self.assertEqual(G.tts_synthesize("u", bad)[0], 400, bad)
        G.TTS_KEY_PATH.unlink()
        self.assertEqual(G.tts_synthesize("u", {"text": "x", "voice": "ja-JP-Wavenet-B"})[0], 503)
        self.assertEqual(self.calls, [])

    def test_monthly_allowance(self):
        G.TTS_FREE_MONTHLY = dict(G.TTS_FREE_MONTHLY, Wavenet=10)
        self.assertEqual(G.tts_synthesize("u", {"text": "12345678", "voice": "en-US-Wavenet-D"})[0], 200)
        self.assertEqual(G.tts_synthesize("u", {"text": "abc", "voice": "en-US-Wavenet-D"})[0], 429)
        # Each kind has its own allowance.
        self.assertEqual(G.tts_synthesize("u", {"text": "abc", "voice": "en-US-Standard-B"})[0], 200)


if __name__ == "__main__":
    unittest.main()
