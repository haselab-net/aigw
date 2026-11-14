#!/usr/bin/env python3
# 定期チェック(run-check.sh)の Claude が Auto モードで断られた操作を数え、あればスマホに知らせる(2026-11-04)。
# 使い方: check-denials.py <会話の id>。会話の記録(~/.claude/projects/*/<id>.jsonl)の tool_result だけを見る。
import glob, json, os, re, sys, urllib.request
# 送り先は設定の notifyUrl(lib.mjs と同じ。conf.mjs が既定を決める)。無ければ例外にして run.log に出す
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from digestconf import get as cget
def notify_url():
    u = cget("notifyUrl")
    if not u: raise RuntimeError("設定の notifyUrl が空")
    return u

sid = sys.argv[1]
paths = glob.glob(os.path.expanduser(f"~/.claude/projects/*/{sid}.jsonl"))
if not paths:
    print(f"check-denials: 会話の記録が見つからない ({sid})"); sys.exit(0)
uses, denied = {}, []
for line in open(paths[0], errors="replace"):
    try: e = json.loads(line)
    except ValueError: continue
    c = (e.get("message") or {}).get("content")
    if not isinstance(c, list): continue
    for b in c:
        if b.get("type") == "tool_use":
            inp = b.get("input") or {}
            uses[b.get("id")] = f"{b.get('name')}: {inp.get('command') or inp.get('file_path') or inp.get('url') or ''}"
        elif b.get("type") == "tool_result" and b.get("is_error"):
            t = b.get("content")
            t = " ".join(x.get("text", "") for x in t if isinstance(x, dict)) if isinstance(t, list) else str(t or "")
            if "denied by the Claude Code auto mode" in t:
                denied.append(uses.get(b.get("tool_use_id"), "?"))
print(f"check-denials: 断られた操作 {len(denied)} 件")
for d in denied:
    print("  - " + d[:300].replace("\n", " "))
if denied:
    msg = f"{len(denied)}件。最初: {denied[0]}"
    body = json.dumps({"title": f"定期チェック: Auto モードで断られた操作 {len(denied)} 件"[:60],
                       "message": msg[:299], "url": re.sub(r"^https?://[^/]+", "", cget("pageUrl", "/email/"))}).encode()
    try:
        req = urllib.request.Request(notify_url(), data=body, headers={"content-type": "application/json"})
        print("check-denials: notify ->", urllib.request.urlopen(req, timeout=5).status)
    except Exception as ex:
        print("check-denials: notify failed:", ex)
