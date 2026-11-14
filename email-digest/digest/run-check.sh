#!/bin/sh
# 定期の新着チェックを1回行う。ホストの systemd timer が箱の中で利用者として呼ぶ(docker exec など。aigw は経由しない)
# 読むのは claude.ai のコネクタ(この箱の ~/.claude のログイン)も使うので、必ず箱の中の claude で動かす
# 利用者ごとのもの(アカウント・前後に動かす道具)は local/config.json(conf.mjs)、手順の追記は local/PROCEDURE.md、定形ルールは local/RULES.md
# 拡張(private/。ext.mjs)があれば、読む前後の処理と手順書の断片が足される。設定の ext.require が欠けていれば claude を呼ばずに止まって知らせる
CODE=$(cd "$(dirname "$0")" && pwd)
DATA=${DIGEST_DATA:-$CODE}
export HOME=${MAILBOX_HOME:-$(dirname "$DATA")}
export CODE DATA EXT="${DIGEST_EXT:-$CODE/private}"
# 箱の道具は名前で呼ぶ。自分の ~/bin にあればそれが先、無ければ箱の PATH の共用のもの
export PATH="$HOME/bin:$PATH"
cd "$HOME" || exit 1
LOG=$DATA/run.log
exec 9>"$DATA/.run.lock"; flock -n 9 || { echo "$(date -Is) skip: 前回がまだ実行中" >> "$LOG"; exit 0; }
cf() { node "$CODE/conf.mjs" "$@"; }
# 初めての回: 前回チェック時刻が無ければ1日前から
[ -f "$DATA/cursor.json" ] || echo "{\"last\": $(( $(date +%s) - 86400 ))}" > "$DATA/cursor.json"
# 「秒<TAB>コマンド」の行を順に動かす(sh -c なので $HOME などが使える。秒が 0 なら時限なし)
run_lines() { while IFS="$(printf '\t')" read -r sec cmd; do if [ "$sec" = 0 ]; then sh -c "$cmd" >> "$LOG" 2>&1 9>&-; else timeout "$sec" sh -c "$cmd" >> "$LOG" 2>&1 9>&-; fi; done; }
# 設定の hooks.<名前> を順に動かす
hooks() { cf hooks "$1" | run_lines; }
sh "$CODE/start.sh" >/dev/null 2>&1
# 拡張が揃っているか・手順書を組み立てられるか。だめなら claude を呼ばない(守りの文や確かめの手順が抜けたまま動かないように)
# 知らせは lib.mjs から直に(拡張が読めないときも届くように)
notify() { node --input-type=module -e "import { notifyText } from '$CODE/lib.mjs'; await notifyText(process.argv[1], process.argv[2]);" "$1" "$2" >> "$LOG" 2>&1; }
stop() { echo "=== $(date -Is) stop: $1" >> "$LOG"; notify "定期チェックを止めた" "$1"; exit 1; }
node "$CODE/ext.mjs" verify >> "$LOG" 2>&1 || stop "拡張が足りないか読めない(run.log。local/config.json の ext.require)"
node "$CODE/compose.mjs" >> "$LOG" 2>&1 || stop "手順書を組み立てられない(run.log)"
PROMPT=$(node "$CODE/compose.mjs" prompt regular) || stop "依頼文を組み立てられない(run.log)"
# 拡張の読む前の処理
node "$CODE/ext.mjs" cmds prepare regular | run_lines
echo "=== $(date -Is) start" >> "$LOG"
# チェックの前に動かすもの(設定の hooks.preCheck)
hooks preCheck
# 箱には uuidgen が無い(util-linux の別パッケージ)。無ければカーネルの乱数 UUID を使う。空だと check-denials が会話の記録を引けない(2026-11-14)
SID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)
# 読めなかった読む先の記録(Claude と、読む先の道具の入口が書く)と、回の前の cursor.json の控え(読めなかったら戻す)
rm -f "$DATA/.failed-sources"; cp "$DATA/cursor.json" "$DATA/.cursor-before"
# この回の範囲(拡張の後の処理が使う。2026-11-11)
LAST=$(python3 -c "import json;print(json.load(open('$DATA/cursor.json'))['last'])" 2>/dev/null || echo 0); START=$(date +%s)
export LAST START
timeout 1800 env -u AIGW_BOX_TAG claude --session-id "$SID" -p "$PROMPT" \
  --permission-mode auto >> "$LOG" 2>&1
rc=$?
# 新しく未決になった項目に Claude セッションを起動する(aigw の箱用 POST /sessions、2026-11-07)
node "$CODE/autostart.mjs" >> "$LOG" 2>&1
# Auto モードで断られた操作があればスマホに知らせる(まとめが欠けていないかの確認、2026-11-04)
python3 "$CODE/check-denials.py" "$SID" >> "$LOG" 2>&1
# 読めなかった読む先(手順書の「読む先が読めなかったら」で Claude が書く)を知らせる。名前だけ(中身は run.log とまとめのメモ)
if [ -s "$DATA/.failed-sources" ]; then
  notify "定期チェックで読めなかった読む先" "$(cut -d: -f1 "$DATA/.failed-sources" | sort -u | tr '\n' ' ')($(date -d "@$LAST" '+%m/%d %H:%M') からの分。run.log)"
  # この回は時刻を進めない: cursor.json を回の前に戻し(読む先ごとの時刻も)、held に回の開始を残す(次の回に同じ時刻から読み直す)
  node "$CODE/cursor.mjs" hold "$LAST" "$START" "$DATA/.cursor-before"
  echo "=== $(date -Is) last を $LAST のまま(読めなかった読む先がある)" >> "$LOG"
else
  node "$CODE/cursor.mjs" clear-held
fi
rm -f "$DATA/.failed-sources" "$DATA/.cursor-before"
# チェックの後に動かすもの(設定の hooks.postCheck)
hooks postCheck
echo "=== $(date -Is) end rc=$rc" >> "$LOG"
# 拡張の後の処理。裏に回すと、終了後にホスト(mailbox-box-run)が同じタグのプロセスとして片付けるので、lock を放してから前面で
exec 9>&-
node "$CODE/ext.mjs" cmds after regular > "$DATA/.after-cmds" 2>>"$LOG"
while read -r cmd; do sh -c "$cmd" >> "$LOG" 2>&1; done < "$DATA/.after-cmds"
rm -f "$DATA/.after-cmds"
exit 0
