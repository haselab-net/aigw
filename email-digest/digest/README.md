# 新着まとめ(digest)

メールの新着を1日数回 Claude が読み、未決・未読・既決の項目にして1枚のページに並べる仕組み。
aigw の箱(sandbox)の中で動く。項目から Claude のセッションを起こして対応し、既決にすると元の場所も片付く(メールはアーカイブ)。
拡張(`private/`。ARCHITECTURE.md 3)があれば、ほかの読む先と手順も足される。

ここにあるのは**仕組み**だけで、誰の箱でも同じ。**利用者ごとのもの**は `local/` に置き、仕組みはそれを読む。

| 置き場所 | 中身 |
|---|---|
| `local/config.json` | アカウント・本人の名前とメンション・前後に動かす道具・要る拡張(`ext.require`)。見本は `node conf.mjs example`、キーの既定は `conf.mjs` |
| `local/PROCEDURE.md` | 手順への本人の追記。決まった例外など。無くてもよい |
| `local/RULES.md` | 定形ルール(「〜が来たら…する」)。見本は `RULES.example.md`。無くてもよい |
| `~/.config/mailbox/oauth.json` | `gmail.py`・`gcal.py` のサイトの設定(`python`・`oauthClient`・`publicHost`) |

`items.json`・`cursor.json`・ログ・組み立てた手順書(`PROCEDURE.md`・`CLAUDE.md`)はデータのフォルダにできる(既定はこのフォルダ。`DIGEST_DATA` で変わる)。
`local/` とこれらは git に入れない。

## 始め方

ホスト側の準備(常駐の入り切り、`/email/`、ログインの戻り先)はサーバーの文書。箱の中では次のとおり。

1. **置く**: 写し方式なら箱の中で `cp -r <配布の場所>/email-digest/{digest,gmail.py,gcal.py} ~/`(上書きでき、`digest/local/` には触らない)。
   共用方式なら、ホストの準備が共用のコピーと入口(`entries.mjs install`)を用意し、`DIGEST_DATA`・`MAILBOX_DIR` を渡す。
2. **自分の値**: `node digest/conf.mjs example > digest/local/config.json` して書く。最低限 `me`(本人の名前・メンション・名前の正規表現)。
3. **Gmail・カレンダー**: `~/.config/mailbox/oauth.json` を書き、ホストで `gmail.py login`・`gcal.py login`。アカウントは `~/.gmail/account` に記録される。
4. **Claude のコネクタ**: 定期チェックの Claude は箱の Claude Code のアカウントで動き、Gmail を claude.ai の Gmail コネクタで検索する。箱で一度 `claude` にログインし、claude.ai の設定で Gmail のコネクタをつなぐ。
5. **確かめる**: `node digest/conf.mjs check`。試しに1回 `sh digest/run-check.sh` を動かし、`digest/run.log` を見る。
6. **常駐**: ホストで常駐を入れる。ページは aigw の `/email/`。

## 中身

- 定期チェックの手順(Claude への指示)は型 `PROCEDURE.in.md` から `compose.mjs` が `PROCEDURE.md` に組み立てる(`start.sh`・`run-check.sh`・`quick-check.sh` が書く)。
  `run-check.sh`(定期)と `quick-check.sh`(ページの「今すぐチェック」)が `claude -p` に渡す依頼文の型は `prompts/`。
- 項目に対応するセッションへの指示は型 `CLAUDE.in.md` から `CLAUDE.md` に組み立てる(作業フォルダなので Claude Code が自動で読む)。
- ページは `server.mjs`(port 9100、aigw の署名ヘッダで箱の持ち主だけ)と `client.js`・`speak.js`。
- 項目の追加・状態・待ち・片付けは `add.mjs`・`set-status.mjs`・`wait.mjs`・`done-sync.mjs`、セッションの自動起動は `autostart.mjs`。
- 拡張の口は `ext.mjs`、共用方式の入口は `entries.mjs`。

## 守ること

- 送信・投稿・削除は仕組みからはしない(定期チェックの指示にも書いてある)。項目のセッションでも本人の確認を取る。
- `local/`・`items.json`・ログ・`~/.config` の鍵は箱の外に出さない。仕組み側に本人や所属先の値(アカウント・ID・名前・ドメイン)を書かない。足すときは設定のキーにする。
