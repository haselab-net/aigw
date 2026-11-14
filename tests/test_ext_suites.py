"""Runs each extension's own tests (ext/<name>/tests, ext/README.md) as part
of the core's suite, so `python3 -m unittest discover -s tests` (and the
pre-commit hook) covers them. Where an extension is left out (the public
snapshot) there is nothing to run.

    python3 -m unittest discover -s tests -v
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_tests(loader, tests, pattern):
    for d in sorted((ROOT / "ext").glob("*/tests")):
        if not d.is_dir():
            continue
        if str(d) not in sys.path:
            sys.path.insert(0, str(d))
        # A loader of its own: discover() keeps state on the loader it runs on.
        tests.addTests(unittest.TestLoader().discover(str(d), pattern="test*.py", top_level_dir=str(d)))
    return tests
