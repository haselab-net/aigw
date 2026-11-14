"""Session folders (the deployment notes, 2026-11-04): the stored tree is
validated -- unlimited depth, no cycles. Built-in folders come from
extensions (tests/test_ext_contract.py).

    python3 -m unittest discover -s tests -v
"""
import tempfile
import unittest
from pathlib import Path

from test_shared_search import B


class FoldersTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = B.STATE_DIR
        B.STATE_DIR = Path(self.tmp.name)

    def tearDown(self):
        B.STATE_DIR = self.saved
        self.tmp.cleanup()

    def test_default_is_empty(self):
        doc = B.load_folders()
        self.assertEqual(doc["folders"], [])

    def test_deep_nesting_and_assign(self):
        chain = [{"id": f"f{i}", "name": f"n{i}", "parent": f"f{i-1}" if i else None} for i in range(12)]
        doc = B.save_folders({"folders": chain, "assign": {"s1": "f11", "s2": "", "s3": "gone"}})
        self.assertEqual(len(doc["folders"]), 12)
        self.assertEqual(doc["assign"], {"s1": "f11", "s2": ""})
        self.assertEqual(B.load_folders(), doc)

    def test_cycle_rejected(self):
        with self.assertRaises(ValueError):
            B.validate_folders({"folders": [{"id": "a", "name": "a", "parent": "b"},
                                            {"id": "b", "name": "b", "parent": "a"}]})
        with self.assertRaises(ValueError):
            B.validate_folders({"folders": [{"id": "a", "name": "a", "parent": "zz"}]})

    def test_stored_folder_of_a_removed_extension(self):
        # A built-in folder saved while its extension was installed reads
        # back as an ordinary one: nothing in it is lost.
        doc = B.validate_folders({"folders": [{"id": "gone", "name": "📦 Gone", "parent": None,
                                               "archived": False, "last_stopped": []},
                                              {"id": "a", "name": "a", "parent": "gone"}],
                                  "assign": {"s1": "gone"}})
        self.assertEqual([f["id"] for f in doc["folders"]], ["gone", "a"])
        self.assertEqual(doc["assign"], {"s1": "gone"})

    def test_inherit_folder(self):
        B.save_folders({"folders": [{"id": "a", "name": "a", "last_stopped": ["old"]}], "assign": {"old": "a"}})
        B.inherit_folder("old", "new")
        doc = B.load_folders()
        self.assertEqual(doc["assign"], {"new": "a"})
        self.assertEqual(doc["folders"][0]["last_stopped"], ["new"])

    def test_ops_do_not_clobber(self):
        B.apply_folder_ops([{"op": "put", "folder": {"id": "a", "name": "A"}},
                            {"op": "put", "folder": {"id": "b", "name": "B"}}])
        # Two tabs: each sends only its own change.
        B.apply_folder_ops([{"op": "assign", "session": "s1", "folder": "a"}])
        B.apply_folder_ops([{"op": "put", "folder": {"id": "b", "parent": "a"}}])
        doc = B.load_folders()
        self.assertEqual(doc["assign"], {"s1": "a"})
        self.assertEqual([(f["id"], f["name"], f["parent"]) for f in doc["folders"]],
                         [("a", "A", None), ("b", "B", "a")])

    def test_ops_order_and_delete(self):
        B.apply_folder_ops([{"op": "put", "folder": {"id": x, "name": x}} for x in "abc"])
        B.apply_folder_ops([{"op": "put", "folder": {"id": "c"}, "before": "a"}])
        self.assertEqual([f["id"] for f in B.load_folders()["folders"]], ["c", "a", "b"])
        B.apply_folder_ops([{"op": "put", "folder": {"id": "c"}, "before": "end"}])
        self.assertEqual([f["id"] for f in B.load_folders()["folders"]], ["a", "b", "c"])
        B.apply_folder_ops([{"op": "put", "folder": {"id": "d", "name": "d", "parent": "a"}}])
        with self.assertRaises(ValueError):
            B.apply_folder_ops([{"op": "delete", "id": "a"}])
        B.apply_folder_ops([{"op": "assign", "session": "s", "folder": "d"}, {"op": "delete", "id": "d"}])
        self.assertEqual(B.load_folders()["assign"], {})
        with self.assertRaises(ValueError):
            B.apply_folder_ops([{"op": "put", "folder": {"id": "a", "parent": "a"}}])
        B.apply_folder_ops([{"op": "delete", "id": "b"}])
        self.assertEqual([f["id"] for f in B.load_folders()["folders"]], ["a", "c"])


if __name__ == "__main__":
    unittest.main()
