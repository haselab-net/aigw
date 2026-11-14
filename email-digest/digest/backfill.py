#!/usr/bin/env python3
"""期間内のスレッドから「人からの、まだ返していないもの」の候補を出す(まとめの取りこぼし洗い直し用)。
使い方: backfill.py <after YYYY/MM/DD> <before YYYY/MM/DD> [追加の検索式]
受信トレイ以外(ラベル振り分け・アーカイブ・各タブ)も含む。一斉配信(List-Id / List-Unsubscribe / Precedence: bulk)と
自分が最後に送ったスレッドは除く。1行1 JSON。"""
import importlib.util, json, sys, re, os
spec = importlib.util.spec_from_file_location("g", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gmail.py")); g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
after, before = sys.argv[1], sys.argv[2]
extra = " ".join(sys.argv[3:])
svc = g.service()
q = f"after:{after} before:{before} -in:chats {extra}".strip()
ids, tok = [], None
while True:
    for k in range(8):  # 1分あたりの上限に当たったら待ち直す
        try:
            r = svc.users().threads().list(userId="me", q=q, maxResults=500, pageToken=tok).execute(); break
        except Exception as e:
            if "rateLimitExceeded" not in str(e) or k == 7: raise
            __import__("time").sleep(30)
    ids += [t["id"] for t in r.get("threads", [])]
    tok = r.get("nextPageToken")
    if not tok: break
print(json.dumps({"query": q, "threads": len(ids)}), file=sys.stderr)
# 自分: Gmail の送信元アドレス(sendAs)全部と、設定の me.nameRe(local/config.json)
_mine = [re.escape(x["sendAsEmail"]) for x in svc.users().settings().sendAs().list(userId="me").execute().get("sendAs", [])]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from digestconf import get as cget
ME = re.compile("|".join(_mine + ([cget("me.nameRe")] if cget("me.nameRe") else [])) or "\\0never", re.I)
NOREPLY = re.compile(r"no-?reply|donotreply|mailer-daemon|notification|notify|info@|news|magazine|support@|system|admin@|portal|calendar-notification", re.I)
def batch(chunk):
    out = {}
    b = svc.new_batch_http_request()
    for t in chunk:
        b.add(svc.users().threads().get(userId="me", id=t, format="metadata",
              metadataHeaders=["From", "To", "Cc", "Subject", "Date", "List-Id", "List-Unsubscribe", "Precedence", "Auto-Submitted"]),
              callback=lambda rid, resp, err, t=t: out.__setitem__(t, resp if not err else {'_err': str(err)[:80]}))
    b.execute()
    return out
import time
n = 0; errs = []
def fetch(chunk):
    got = batch(chunk)
    bad = [t for t, th in got.items() if not th or '_err' in th]
    for k in range(5):
        if not bad: break
        time.sleep(2 * (k + 1)); again = batch(bad); got.update(again)
        bad = [t for t, th in again.items() if not th or '_err' in th]
    errs.extend(bad); return got
for i in range(0, len(ids), int(__import__("os").environ.get("BF_CHUNK", "25"))):
    time.sleep(float(__import__("os").environ.get("BF_SLEEP", "1.3")))  # threads.get は1件10単位、上限は1分あたり15000単位
    for t, th in fetch(ids[i:i+int(__import__("os").environ.get("BF_CHUNK", "25"))]).items():
        if not th or '_err' in th: continue
        msgs = th.get("messages", [])
        if not msgs: continue
        H = lambda m: {h["name"].lower(): h["value"] for h in m.get("payload", {}).get("headers", [])}
        last = msgs[-1]; h = H(last)
        if "SENT" in last.get("labelIds", []): continue                 # 最後が自分
        if any(k in h for k in ("list-id", "list-unsubscribe", "auto-submitted")) or h.get("precedence", "").lower() in ("bulk", "list", "junk"): continue
        if NOREPLY.search(h.get("from", "")): continue
        replied = any("SENT" in m.get("labelIds", []) for m in msgs)
        print(json.dumps({"thread": t, "n": len(msgs), "date": h.get("date"), "from": h.get("from"), "to": (h.get("to") or "")[:80],
                          "subject": h.get("subject"), "labels": last.get("labelIds", []), "replied_before": replied,
                          "snippet": last.get("snippet", "")[:160]}, ensure_ascii=False))
        n += 1
print(json.dumps({"candidates": n, "errors": len(errs)}), file=sys.stderr)
