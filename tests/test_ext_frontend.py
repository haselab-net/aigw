"""The page's extension registry, static/ext.js (window.aigwExt, ext/README.md):
what app.js asks it at its extension points. No DOM: runs in node.

    python3 -m unittest discover -s tests -v

"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

RUN = r"""
global.window = {};
require(process.argv[1]);
const x = window.aigwExt;
const out = {};
out.empty = { folders: x.folders(), folderOf: x.folderOf({ group: "g" }), back: x.back(),
              link: x.linkHandler("https://h/e/"), todoRows: x.todoRows({ id: "s" }) };
x.register("fx", {
  folders: [{ id: "fx", label: "FX", draggable: false, hideWhenEmpty: true, ownArchive: true }],
  folderOf: (s) => (s.group === "g" ? "fx" : null),
  todo: { load: () => Promise.resolve(), rows: (s) => (s.id === "s" ? [{ text: "row" }] : []), extraRows: () => [{ text: "extra" }] },
  links: [{ match: (u) => u.endsWith("/e/"), open: () => "opened" }],
  back: () => true,
  i18n: { "あ": "a" },
});
x.register("broken", { folderOf: () => { throw new Error("boom"); } });
out.after = { folders: x.folders(), folderOf: x.folderOf({ group: "g" }), other: x.folderOf({ group: "h" }),
              back: x.back(), link: x.linkHandler("https://h/e/") ? x.linkHandler("https://h/e/")("https://h/e/") : null,
              todoRows: x.todoRows({ id: "s" }), extraRows: x.extraTodoRows(), i18n: x.i18n(), names: x.names() };
Promise.all(x.loadAll()).then(() => { out.loaded = true; console.log(JSON.stringify(out)); });
"""


class ExtFrontend(unittest.TestCase):
    def run_node(self):
        r = subprocess.run(["node", "-e", RUN, str(ROOT / "static" / "ext.js")],
                           capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def test_registry(self):
        o = self.run_node()
        self.assertEqual(o["empty"], {"folders": [], "folderOf": None, "back": False, "link": None, "todoRows": []})
        a = o["after"]
        self.assertEqual([f["id"] for f in a["folders"]], ["fx"])
        self.assertEqual(a["folderOf"], "fx")
        self.assertIsNone(a["other"])            # and the broken one's throw is contained
        self.assertTrue(a["back"])
        self.assertEqual(a["link"], "opened")
        self.assertEqual(a["todoRows"], [{"text": "row"}])
        self.assertEqual(a["extraRows"], [{"text": "extra"}])
        self.assertEqual(a["i18n"], {"あ": "a"})
        self.assertEqual(a["names"], ["fx", "broken"])
        self.assertTrue(o["loaded"])


if __name__ == "__main__":
    unittest.main()
