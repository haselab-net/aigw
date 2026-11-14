#!/usr/bin/env python3
# 互換用: 中身は `gmail.py link` に移した(2026-10-09)。新しく使うときは ~/gmail.py link <threadId>...
import importlib.util, sys, os
spec = importlib.util.spec_from_file_location("gmail", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gmail.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
url, token = g.thread_url, g.thread_token
if __name__ == "__main__":
    for t in sys.argv[1:]:
        print(url(t))
