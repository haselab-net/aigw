#!/usr/bin/env python3
# まとめ項目の refs(mail:<threadId>)に、差出人・件名・時刻・リンクを付ける(2026-11-05 ユーザー依頼)
# 使い方: ref-info.py <threadId>...  → {"mail:<threadId>": {"label", "time", "url", "mobile"}} を JSON で出す(add.mjs が呼ぶ)
#        ref-info.py --keys <threadId>... → {"<threadId>": {"subj", "addrs", "reply"}}(同じ話のスレッドを見分ける。add.mjs が呼ぶ)
#        ref-info.py --fill            → items.json の refs を持つ項目で、refInfo の無いものを埋める(既存の項目の後付け用)
import importlib.util, json, os, sys, email.utils, re
from datetime import timedelta, timezone

spec = importlib.util.spec_from_file_location("gmail", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gmail.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
JST = timezone(timedelta(hours=9))


def info(tids):
    if not tids:
        return {}
    svc = g.service()
    got = g._batch_get(svc, lambda t: svc.users().threads().get(
        userId="me", id=t, format="metadata", metadataHeaders=["From", "Subject", "Date"]), tids)
    out = {}
    for t in tids:
        msgs = (got.get(t) or {}).get("messages") or []
        if not msgs:
            continue
        first, last = g._headers(msgs[0], "subject"), g._headers(msgs[-1], "from", "date")
        name, addr = email.utils.parseaddr(last.get("from", ""))
        try:
            tm = email.utils.parsedate_to_datetime(last["date"]).astimezone(JST).strftime("%Y-%m-%dT%H:%M")
        except Exception:
            tm = ""
        subj = re.sub(r"\s+", " ", first.get("subject", "(件名なし)")).strip()
        out["mail:" + t] = {"label": f"{name or addr}: {subj}" + (f"({len(msgs)}通)" if len(msgs) > 1 else ""),
                            "time": tm, "url": g.thread_url(t), "mobile": g.thread_url(t, True)}
    return out


def norm_subject(s):
    s = re.sub(r"\s+", " ", s or "").strip()
    while True:
        t = re.sub(r"^(?:re|fw|fwd|aw|wg|sv|答复|回复|转发|返信|転送)\s*(?:\[\d+\])?\s*[:：]\s*", "", s, flags=re.I)
        if t == s:
            return s.lower()
        s = t


def keys(tids):
    """{threadId: {"subj", "addrs"}}: 件名(Re:/Fwd: を除く)と、本人以外の差出人。Gmail が同じ話を別スレッドに分けたもの
    (In-Reply-To が無い返信)を add.mjs が1つの項目にまとめるのに使う(2026-11-10 ユーザー依頼)"""
    if not tids:
        return {}
    svc = g.service()
    got = g._batch_get(svc, lambda t: svc.users().threads().get(
        userId="me", id=t, format="metadata", metadataHeaders=["From", "Subject"]), tids)
    try:  # 本人の送信元アドレス(別のアカウントから転送されて SENT の付かない本人のメールもある)
        me = {x["sendAsEmail"].lower() for x in svc.users().settings().sendAs().list(userId="me").execute().get("sendAs", [])}
    except Exception:
        me = set()
    out = {}
    for t in tids:
        msgs = (got.get(t) or {}).get("messages") or []
        if not msgs:
            continue
        addrs = sorted({email.utils.parseaddr(g._headers(m, "from").get("from", ""))[1].lower()
                        for m in msgs if "SENT" not in (m.get("labelIds") or [])} - me - {""})
        subj = g._headers(msgs[0], "subject").get("subject", "")
        out[t] = {"subj": norm_subject(subj), "addrs": addrs, "reply": norm_subject(subj) != re.sub(r"\s+", " ", subj).strip().lower()}
    return out


if __name__ == "__main__":
    if sys.argv[1:2] == ["--keys"]:
        print(json.dumps(keys(sys.argv[2:]), ensure_ascii=False))
        sys.exit(0)
    if sys.argv[1:] == ["--fill"]:
        db = os.path.join(os.environ.get("DIGEST_DATA") or os.path.dirname(os.path.abspath(__file__)), "items.json")
        d = json.load(open(db))
        n = 0
        for it in d["items"]:
            miss = [r[5:] for r in it.get("refs") or [] if r.startswith("mail:") and r not in (it.get("refInfo") or {})]
            if miss and it.get("status") != "既決":
                it.setdefault("refInfo", {}).update(info(miss)); n += len(miss)
        # ページのサーバーと同じく一時ファイルから置き換える(読んでから書くまでの間に変わったものは失う。数秒なので後付けの1回だけに使う)
        json.dump(d, open(db + ".tmp", "w"), ensure_ascii=False, indent=1); os.replace(db + ".tmp", db)
        print("filled", n)
    else:
        print(json.dumps(info(sys.argv[1:]), ensure_ascii=False))
