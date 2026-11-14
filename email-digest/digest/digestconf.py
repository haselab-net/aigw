"""利用者ごとの設定(local/config.json)を Python から読む。中身と既定は conf.mjs と同じ(conf.mjs に読ませる)。

  from digestconf import conf, get
  get("me.name")  ->  値(無ければ None か既定)
"""
import json, os, subprocess

CODE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("DIGEST_DATA") or CODE  # items.json など(conf.mjs と同じ)
LOCAL = os.environ.get("DIGEST_LOCAL") or os.path.join(DATA, "local")
MAILBOX_HOME = os.environ.get("MAILBOX_HOME") or os.path.dirname(DATA)
GMAIL_DEFAULT = os.path.join(os.path.dirname(CODE), "gmail.py")


def _load():
    # 既定の計算(通知の送り先など)を二重に持たないよう、conf.mjs に JSON で出させる
    out = subprocess.run(["node", os.path.join(CODE, "conf.mjs"), "json"], capture_output=True, text=True, timeout=20)
    if out.returncode != 0:
        raise RuntimeError("digestconf: " + out.stderr.strip()[:300])
    return json.loads(out.stdout)


conf = _load()


def get(key, default=None):
    o = conf
    for k in key.split("."):
        if not isinstance(o, dict) or k not in o:
            return default
        o = o[k]
    return default if o in ("", None, [], {}) else o
