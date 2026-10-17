"""Every Japanese string the UI shows has an English and a Simplified
Chinese translation in static/i18n.js (the deployment notes), and t() fills {name}
placeholders. Needs node.

    python3 -m unittest discover -s tests -v
"""
import html.parser
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
# The deployment's own pages, when this checkout sits inside the
# ai-sandbox-server mirror (the deployment notes).
SITE = ROOT.parent / "opt" / "aigw" / "static"
JA = re.compile(r"[぀-ヿ㐀-鿿]")

DUMP = """
global.window = {}; global.document = { documentElement: {} };
global.localStorage = { getItem: () => process.argv[2], setItem() {} };
require(process.argv[1]);
const i = window.aigwI18n;
// The deployment pages' own words, the same add() they make in the page.
for (const f of process.argv.slice(3)) {
  const src = require("fs").readFileSync(f, "utf8");
  for (const m of src.matchAll(/\/\* i18n-begin \*\/([\s\S]*?)\/\* i18n-end \*\//g)) eval(m[1]);
}
console.log(JSON.stringify({ dict: i._dict, lang: i.lang(),
  sample: i.t("「{a}」と「{b}」をつなぎます。", { a: "X", b: "Y" }),
  missing: i.t("辞書に無い文字列") }));
"""


SITE_PAGES = [p for p in (SITE / "site-extras.js", SITE / "login.html", SITE / "email-unlock.html") if p.exists()]


def node(lang, site=True):
    out = subprocess.run(["node", "-e", DUMP, str(STATIC / "i18n.js"), lang]
                         + ([str(p) for p in SITE_PAGES] if site else []),
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def used_keys():
    keys = set()
    js_files = [STATIC / "app.js", STATIC / "outbox-browse.html"]
    js_files += [p for p in (SITE / "site-extras.js", SITE / "email-unlock.html") if p.exists()]
    for f in js_files:
        for m in re.finditer(r"""(?<![\w.])t\((["'])((?:(?!\1)[^\\]|\\.)*)\1""", f.read_text()):
            keys.add(m.group(2))

    class P(html.parser.HTMLParser):
        skip = 0

        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style"):
                self.skip += 1
            for a, v in attrs:
                if a in ("title", "placeholder", "aria-label") and v and "${" not in v:
                    keys.add(v.strip())

        def handle_endtag(self, tag):
            if tag in ("script", "style"):
                self.skip -= 1

        def handle_data(self, d):
            if not self.skip and d.strip():
                keys.add(d.strip())

    for f in [STATIC / "index.html", STATIC / "outbox-browse.html"] + [
            p for p in (SITE / "login.html", SITE / "email-unlock.html") if p.exists()]:
        P().feed(f.read_text())
    return {k for k in keys if JA.search(k) and "${" not in k}


class I18nTest(unittest.TestCase):
    def test_every_shown_string_is_translated(self):
        d = node("en")["dict"]
        keys = used_keys()
        self.assertGreater(len(keys), 150)
        for lang in ("en", "zh-CN"):
            missing = sorted(k for k in keys if k not in d[lang])
            self.assertEqual(missing, [], lang)

    def test_placeholders_survive_translation(self):
        d = node("en")["dict"]
        for lang in ("en", "zh-CN"):
            for k, v in d[lang].items():
                self.assertEqual(set(re.findall(r"\{(\w+)\}", k)), set(re.findall(r"\{(\w+)\}", v)), (lang, k))

    def test_t(self):
        self.assertEqual(node("en")["sample"], "Link “X” and “Y”.")
        self.assertEqual(node("zh-CN")["sample"], "将连接「X」与「Y」。")
        self.assertEqual(node("ja")["sample"], "「X」と「Y」をつなぎます。")
        self.assertEqual(node("en")["missing"], "辞書に無い文字列")
        self.assertEqual(node("xx")["lang"], "ja")  # unknown stored value

    def test_core_dictionary_has_no_deployment_words(self):
        # The published core must not carry this deployment's own pages
        # (the deployment notes): those add() their words themselves.
        core = node("en", site=False)["dict"]["en"]
        for k in core:
            self.assertNotIn("strongSwan", k)
            self.assertNotIn("setup.bat", k)


if __name__ == "__main__":
    unittest.main()
