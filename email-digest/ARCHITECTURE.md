# email-digest の作り(芯と拡張の口)

状態: **実装済み**(テストの pending は全部外した)。

aigw 本体の分け方(`ext/README.md`)と同じ考え方にする:

- **芯は、拡張が1つも無くても動く。** 芯 = まとめのページとサーバー、項目の置き場、設定の読み込み、
  aigw への通知、aigw へのセッションの受け渡し、Gmail(API とコネクタ)、Google カレンダー(API)、手順書。
- **拡張は、決まった口からだけ差し込む。** 拡張は `digest/private/` に置ける。**この写しには含まれていない。**
- **純度のテストが、芯が拡張の名前を書いていないことを確かめる**(語の一覧は拡張の側にあり、無ければ飛ばす)。

## 1. 置き場所

```
email-digest/
  ARCHITECTURE.md  README.md  .gitignore
  gmail.py  gcal.py      Gmail・カレンダーの API。トークンは $MAILBOX_DIR/.gmail/・.gcal/、サイトの設定は $MAILBOX_DIR/.config/mailbox/oauth.json
  test.sh  test/         テスト(偽のデータだけ)
  digest/                芯
    ext.mjs              拡張の口(private/ を探して読む。無ければ空)
    compose.mjs          手順書・セッションの指示・claude -p への依頼文を、型 + 拡張の断片から組み立てる
    entries.mjs          共用方式のときに箱に置く入口を作る(2節)
    PROCEDURE.in.md  CLAUDE.in.md  prompts/regular.md  prompts/quick.md     型
    config.example.json  RULES.example.md  .claude/settings.json  .gitignore(組み立てた PROCEDURE.md・CLAUDE.md)
    server.mjs client.js speak.js conf.mjs lib.mjs digestconf.py add.mjs set-status.mjs item.mjs wait.mjs
    autostart.mjs session-end.mjs done-sync.mjs quick-raw.mjs check-denials.py backfill.py ref-info.py gmail-link.py
    run-check.sh quick-check.sh start.sh
    private/             拡張を置ける場所(この写しには無い)
```

`private/` を `digest/` の下に置くのは、箱への置き方(`digest/` を丸ごと写す・共用のコピーを読む)を変えずに、拡張が有れば一緒に届くため。

## 2. 2つの置き方(どちらでも同じコードが動く)

| | 写し方式(今) | 共用方式 |
|---|---|---|
| コード(`CODE`) | `~/digest/`(箱の中に写す) | 全員の箱が読む読み取り専用のコピーの `digest/` |
| データ(`DATA`) | `CODE` と同じ | `~/digest/`(`DIGEST_DATA`) |
| 本人の値(`LOCAL`) | `~/digest/local/` | `~/digest/local/` |
| 本人の HOME(`MAILBOX_HOME`) | `CODE` の1つ上 | `DATA` の1つ上 |
| gmail.py・gcal.py のトークン(`MAILBOX_DIR`) | gmail.py の隣(= HOME) | HOME(`MAILBOX_DIR`) |

既定の決め方(写し方式では今と全く同じ値になる):

- `DATA = $DIGEST_DATA || CODE`(今と同じ)
- `LOCAL = $DIGEST_LOCAL || DATA/local`(今は `CODE/local`)
- `MAILBOX_HOME = $MAILBOX_HOME || dirname(DATA)`(今は `dirname(CODE)`)
- メールのアカウントの控え・トークンは `MAILBOX_HOME/.gmail/`(今は `CODE/..`)

**環境変数を誰が渡すか**: 共用方式の `DIGEST_DATA`・`MAILBOX_DIR` は、ホストの systemd のユニット(root の側。定期チェックと
まとめページの常駐)が渡す。箱の持ち主は設定しない。箱の中で人や Claude が手で動かすときは、下の入口が渡す。

**入口(共用方式だけ)**: 箱の中の文書・メモ・記憶・スクリプトは `~/gmail.py`・`~/gcal.py`・`~/digest/<道具>` を
そのパスで呼んでいる(送信の決まり `~/gmail.py send <id> --yes` も)。共用方式でもこれらが今のまま動くように、
`node <CODE>/entries.mjs install` が箱に薄い入口を作る:

- `~/gmail.py`・`~/gcal.py`: `MAILBOX_DIR=<HOME>` を渡して共用のコピーの gmail.py・gcal.py を起動するだけのもの。
  シンボリックリンクにはしない(gmail.py は自分の場所(`__file__`)の隣にトークンを探すので、リンクだと共用のフォルダを見てしまう)。
- `~/digest/<道具>`(add.mjs・set-status.mjs・item.mjs・wait.mjs・done-sync.mjs・autostart.mjs・conf.mjs・session-end.mjs・
  quick-raw.mjs・backfill.py・ref-info.py・gmail-link.py・check-denials.py・run-check.sh・quick-check.sh・start.sh と、拡張が `entries` で足す名前):
  `DIGEST_DATA` を自分のフォルダにして、共用のコピーの同じ名前を同じ引数で起動するだけのもの(.mjs は node で、.py は python で、.sh は sh で動く形)。
- 入口は1行目に「entries.mjs が作った入口。直さない」と書く。入口でないファイルは上書きしない(写し方式の本物のコードを守る)。
  何度動かしても同じ結果。作るのはホストの準備の手順(root の側、利用者として動かす)と、共用のコピーを新しくしたとき。
- 入口は判断を持たない(どこを起動するかだけ)ので、「箱にコードを置かない」の例外にはしない。

組み立てる文書・依頼文の中のパスは、型では `{{bin}}`(入口のあるフォルダ。写し方式は CODE、共用方式は DATA で、どちらも `~/digest`)、
`{{data}}`・`{{code}}`・`{{gmail}}`・`{{gcal}}` で書き、組み立てで埋める。箱の Claude の許可の一覧などに書いた `~/digest/…`・`~/gmail.py` の
パスは、入口があるのでそのまま当たる。

スケジューラが呼ぶ名前(`digest/run-check.sh`・`digest/start.sh --fg`・`node digest/conf.mjs check`)は、共用のコピーの `digest/` の下に同じ名前である。
定期チェックと今すぐチェックの lock は今と同じ `$DATA/.run.lock`。データの場所は変えない。コードのファイル名はデータのファイル名
(`items.json`・`cursor.json`・`quick.json`・`*.log`・`quick/`・`end-requests/` など)と重ねない(写し方式では同じフォルダに並ぶため)。

## 3. 拡張の口(`digest/ext.mjs`)

`ext.mjs` は `EXT = $DIGEST_EXT || CODE/private` の `EXT/ext/*.mjs` を読み、`order` の順に並べる。`DIGEST_EXT` はテストで偽の拡張を差すためのもの。

- **無ければ黙って飛ばす**: `EXT` が無い・`ext/` が空 → 拡張は無く、芯はメールだけで動く。
- **有って壊れていれば止める**: モジュールが読めない・形が違う(下の表のキーの型が違う、関数でない知らないキーがある)→ 例外。黙って飛ばさない。
- **要るものを箱が宣言できる**: `local/config.json` の `"ext": {"require": ["ext/<名前>", "text/<断片のファイル名から .md を除いたもの>", …]}`。
  断片は、ファイルがあるだけでなく、口を1つ以上中身のある文で埋めていること(空・見出しだけは足りない扱い)。
  1つでも無ければ、`node conf.mjs check` が足りないものを出して 1 で終わり、`run-check.sh`・`quick-check.sh` は claude を呼ぶ前に止まって
  スマホに知らせる(今すぐチェックは状態を `error` にする)。キーを書かない箱(芯だけの箱)は今までどおり。

拡張のモジュールは `export default { … }` で次を持つ(どれも無くてよい):

| キー | 使うところ | 意味 |
|---|---|---|
| `name`, `order` | 全部 | 名前(項目の `source` と同じ)と並び順 |
| `label`, `icon`, `color` | server.mjs・speak.js | ページの表示名・アイコン・帯の色、読み上げの種類名(`label` のあるものが「読む先」) |
| `hostRe` | server.mjs | URL がこの読む先のものか(短いリンクの表示名・refs の一覧のアイコン) |
| `urlRe` | add.mjs・done-sync.mjs | 個別の項目の link として正しい URL(無いと add.mjs が WARN、done-sync が SKIPPED を出す) |
| `refRe` | add.mjs・done-sync.mjs・server.mjs | まとめ項目の要約の印・refs のうち、この拡張が片付けるもの |
| `refTime(ref)`, `refLabel(ref)` | server.mjs | refs の一覧の時刻と表示名(refInfo が無いとき) |
| `markRead(items, ctx)` | done-sync.mjs | 既決にした項目を元の場所で片付ける。`ctx` = `{conf, DATA, load, mark, within, log}` |
| `prepare` | run-check.sh・quick-check.sh | 読む前に動かすコマンド `[{cmd, timeout, when}]`(`when` は regular・quick・both) |
| `quick` | quick-check.sh | 今すぐチェックの取り込み `[{out, cmd, slow}]`。`slow` は裏で走らせ、2段目の前に待つ |
| `quickTag` | server.mjs | 「今すぐチェック(…)」のボタンの文字 |
| `quickRaw(read)` | quick-raw.mjs | 1段目の速報の行 `{source,time,from,title,text,link}` |
| `after` | run-check.sh・quick-check.sh | 終わってから動かすコマンド `{regular, quick}`(lock を放してから) |
| `entries` | entries.mjs | 共用方式で箱に入口を作る道具の名前(`private/` からの相対) |

シェルの台本は `node ext.mjs cmds <prepare|quick|after> <regular|quick>` が出す行を、今の `hooks` と同じやり方で動かす。
コマンドには `CODE`・`DATA`・`LAST`・`START`・`Q` を環境変数で渡す。

拡張が無いときの芯の振る舞い:

- ページ: 見出しとボタンはメールだけ(「新着まとめ(メール)」)。知らない URL は今と同じく汎用のリンク(ドメイン名)。
- add.mjs: まとめ項目の印のうち `mail:` だけを refs に足す。link の WARN は拡張の `urlRe` があるものだけ。
- done-sync.mjs: メールだけを片付ける。拡張の無い `source` の項目は `synced` にしない。
- run-check.sh・quick-check.sh: 前後の処理が無い。今すぐチェックは1段目(メール一覧)だけ。

### 設定

- `config.example.json` は芯のキーだけ: `account`・`pageUrl`・`notifyUrl`・`me`・`session`・`hooks`(・`ext`)。
- 拡張のキーの見本は `private/config.example.json`(断片)、既定は `private/defaults.json`。`conf.mjs` は「芯の既定 ← 拡張の既定 ← `local/config.json`」の順に重ねる。
- `node conf.mjs example` が芯の見本と拡張の断片を重ねた見本を出す。
- 既に `local/config.json` にあるキーは、名前も意味も変えない。

## 4. 文書と依頼文の組み立て(`digest/compose.mjs`)

Claude が読む文書(`PROCEDURE.md`・`CLAUDE.md`)と claude -p への依頼文は、型(`*.in.md`・`prompts/*.md`)に拡張の断片
(`private/text/<NN>-<名前>.md`)を差し込んで作る。

- 型の `{{名前}}` は**足す口**。断片の同じ名前の部分を、断片のファイル名の順に入れる。行に `{{名前}}` だけがあれば段落の口
  (断片の間は改行でつなぎ、何も無ければその行ごと消す)、文の中にあれば語の口(そのままつなぐ)。
- 型の `{{#名前}}既定{{/名前}}` は**置き換える口**。断片に同じ名前があればそれ、無ければ既定の文。
- **展開は1回だけ**。断片から入れた文は口として読み直さない。その後で値(`{{bin}}`・`{{code}}`・`{{data}}`・`{{gmail}}`・`{{gcal}}`、
  依頼文では `{{last}}`・`{{start}}`・`{{q}}`)だけを埋める。HOME の下なら `~/…` で書く。
- 断片のファイルは `<!-- slot: 名前 -->` の行で区切る。**どの型にも無い口の名前を断片が書いていたら、組み立ては失敗する**
  (置き間違えた断片が黙って落ちないように)。失敗したら run-check.sh・quick-check.sh は claude を呼ばずに止まって知らせる。
- 組み立てた `PROCEDURE.md`・`CLAUDE.md` の1行目は「組み立てた文書。直すときは型・断片・local/ を直す」の注記。
  `.claude/settings.json`(Stop フック。`DIGEST_DATA` を付けて共用のコピーの session-end.mjs を呼ぶ)と一緒に **DATA に書く**
  (共用方式ではコードが読み取り専用で、項目のセッションの作業フォルダ `~/digest` は DATA のため)。一時ファイルに書いてから置き換える。
  中身が変わらなければ書き直さない。写し方式では今と同じ場所・同じ名前になる。
- 書くのは `start.sh`(両方の起動の仕方)・`run-check.sh`・`quick-check.sh` の始め。依頼文は `node compose.mjs prompt <regular|quick>` が標準出力に出す。
- 本人の追記(`local/PROCEDURE.md`)・定形ルール(`local/RULES.md`)は今までどおり別のファイルで、組み立てには混ぜない。

## 5. 共用のものと箱ごとのもの

コードは全部共用(拡張も)。箱の中に置くのは本人の値・データ・入口だけ。

| 場所 | 中身 |
|---|---|
| `~/digest/local/config.json` | 本人の値(キーは今と同じ)。要る拡張の宣言 `ext.require` |
| `~/digest/local/PROCEDURE.md`・`RULES.md` | 本人の手順の追記・定形ルール |
| `~/digest/local/` のその他の文 | 拡張が設定のキーで指す本人の文。相対パスは **`~/digest/`(LOCAL の1つ上)から** |
| `~/digest/` のデータ | `items.json`・`cursor.json`・ログ・作業用の json とフォルダ・組み立てた文書(場所は今と同じ) |
| 入口(共用方式) | `~/gmail.py`・`~/gcal.py`・`~/digest/<道具>`(2節) |

拡張が箱ごとの小さな差し替え(`local/` の任意のモジュール)を読むことはある。有れば使い、無ければ共用の動き。

## 6. テスト

一つのコマンドで全部: `email-digest/` で `sh test.sh`(node の `node:test` と python の `unittest`)。偽のデータだけを使う。
各テストは一時フォルダに `HOME/digest/`(コードの写し)・偽の `gmail.py`・偽の `~/.aigw/viewer.key`・偽の `local/config.json` と、
`claude`・`uuidgen`・`curl` の偽物を `PATH` の先頭に置いて動かす。外へは何も送らない。

| ファイル | 中身 | 状態 |
|---|---|---|
| `test/core.test.mjs`(ケースは `test/core-cases.mjs`) | 芯の今の振る舞い(設定、ページ・認証・`/counts`・`/row`・`/status`、add.mjs、done-sync のメール、set-status・wait、quick-raw)。メールの項目だけ | 通る |
| `test/test_digestconf.py` | digestconf.py が conf.mjs と同じ値を返す | 通る |
| `test/shape.test.mjs` | 公開の形: 一時の写しから拡張の側を消し、core-cases の全部と、ページがメールだけ、compose・conf example、run-check.sh・quick-check.sh が参照エラー無しで偽の claude まで通る | 通る |
| `test/purity.test.mjs` | 公開のファイルに語の一覧の語が無い(一覧が無ければ skip) | 通る |
| `test/compose.test.mjs` | 組み立ての規則: 足す口・置き換える口・空の行・展開1回・知らない口で失敗・1行目の注記・DATA に書く | 通る |
| `test/require.test.mjs` | `ext.require`: 足りなければ conf check が 1、run-check.sh・quick-check.sh が claude を呼ばずに止まって知らせる、空・見出しだけの断片は足りない、壊れた拡張で止まる、書かなければ今どおり | 通る |
| `test/entries.test.mjs` | 入口: `~/gmail.py` が `MAILBOX_DIR` を渡して共用の gmail.py を呼ぶ、`node ~/digest/item.mjs` が共用のコードを DATA で動かす、入口でないファイルは上書きしない、手で変えた入口は戻す、2回動かしても同じ | 通る |
| `digest/private/test/`(この写しには無い) | 拡張がある形の写し取り | — |

写し取り(golden)は分ける前のコードから `UPDATE_GOLDEN=1 sh test.sh` で作った。作り直さない。分けたことで変わってよい差は、テストの中の置き換えの表に書いてある。

## 7. 分けても変わらないこと・変わること

変わらない(拡張が全部ある箱): ページの HTML、項目の扱い、片付け、通知、セッションの受け渡し、スケジューラの呼ぶ名前、lock、
データの場所、`local/config.json` のキー。依頼文と手順書は、移したファイルのパス・1行目の注記・型にしたために動いた数語のほかは同じ。

変わる: 手順書と項目のセッションへの指示はリポジトリでは型になり、読む文書は組み立てて DATA にできる。`RULES.example.md` の読む先の
例は一般の言い方にする。
