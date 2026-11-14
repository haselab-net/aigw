# 新着チェックの手順(定期チェック・今すぐチェックの Claude への指示)

この手順は仕組みの側で、誰の箱でも同じ。**この利用者のこと**(本人の名前・読む先・決まった例外・追加の手順)は
`local/PROCEDURE.md` に、定形ルールは `local/RULES.md` に、アカウントや ID は `local/config.json` にある。
始める前に `local/PROCEDURE.md` があれば読み、`node conf.mjs get <キー>` で設定の値を引く(キーは `config.example.json`)。
下の `<code>` はこのファイルのあるフォルダ、`<data>` は items.json のあるフォルダ(既定は同じ。`DIGEST_DATA` で変わる)。
「本人」は設定の `me.name` の人。

前回チェック時刻は `<data>/cursor.json` の `last`(UNIX 秒)。終わったら現在時刻に更新する。
読む先の道具が失敗したとき(終了コードが 0 でない・何も出さない・エラーだけを出す)は、その読む先の名前と短い理由を
`echo '<名前>: <理由>' >> <data>/.failed-sources` で1行ずつ書き、まとめのメモにも書く。黙って先へ進まない。
チェックの後に利用者へ通知が出て、`cursor.json` は回の前の値に戻り、`held` に回の開始時刻が入る(次の回に同じ時刻から読み直す)。
`cursor.json` に `held` があるときは読み直しの回: `held.at` より前の分は、読めた読む先では既に項目か対応不要のまとめの行になっている。
個別の項目は id で重ならないが、対応不要のまとめには `held.at` より前の分を足さない。`held` は台本が消す。
{{cursor}}
{{guard}}

## 0. 準備
- `<code>/start.sh`(まとめページ port 9100 を起動)
{{prepare}}

## 1. メール(Gmail コネクタ。設定の `account` に全アドレスが集まっている前提)
- `search_threads` で `after:<last> -in:sent`(受信トレイ以外も対象:ラベル振り分け・アーカイブ・プロモーション/ソーシャル等の各タブ)。
  広告・メルマガ・自動通知(ニュース・SNS など)は除外するが、タブに誤分類された人からのメールは拾う。
  定例で他の人が担当している案内は項目にしない(どれかは `local/PROCEDURE.md`)。
- 取りこぼしの洗い直しは `<code>/backfill.py <after YYYY/MM/DD> <before YYYY/MM/DD>`(一斉配信と自分が最後のスレッドを機械的に除いた候補を出す)。
  Gmail API の1分あたり上限があるので `BF_CHUNK=8 BF_SLEEP=1` 程度で。errors が残ったら時間を置いて再実行。
- 中身が必要なものは `get_message`(PLAIN_TEXT)か `{{gmail}} show <id>`。
- 本人がその後に返信済み(同じスレッドに SENT が後にある)なら status=既決。
- **既に項目のあるスレッドに新しい返信が来たら、同じ id(`mail:<threadId>`)で項目を出し直す**(既決のスレッドに返信が来ても未決に戻らなかったため)。
  time は新しい返信の時刻、summary は新しい返信の中身(前の経緯は一言)、status は新しい返信で決める(対応が要るなら未決、知らせだけなら未読)。
  add.mjs は、既決の項目でも time が新しくなっていれば開き直す(`REOPEN` と出る)。同じスレッドから `:<名前>` のような別の id の項目は作らない(done-sync がスレッドごとアーカイブするので、片方を既決にするともう片方も消える)。
  Gmail が同じ話を別スレッドに分けたとき(In-Reply-To が無い返信)は、新しいスレッドの id(`mail:<新しい threadId>`)のまま出してよい。
  add.mjs が、件名が Re:/Fwd: 付きで、Re: を除いた件名と本人以外の差出人が同じ前の項目に、前の項目の id でまとめる(`SAME-TALK` と出る。項目の threadId が新しいスレッド、
  前のスレッドは refs)。前の Claude セッションが autostart.mjs で再開されて続きを受ける(メールのスレッドにつき一つの Claude)。
{{mail-extra}}

## 1b. 受信トレイに残った未読の片付け
上の 1 は前回以降の新着だけを見るので、除外したお知らせなどが未読のまま受信トレイに溜まる。毎回、日付にかかわらず次を片付ける。
`{{gmail}} list -q "<クエリ>" -n 500` は件名・差出人・snippet を JSON 行で出す(続きは stderr の nextPageToken を `--page-token` に)。
- **新着(`in:inbox is:unread category:updates`)・ソーシャル(`category:social`)・フォーラム(`category:forums`)**: 中身を見る。
  1 と同じ基準で、人からのもの・本人の対応が要るもの・知っておくべき通知(締切・請求・アカウント・セキュリティ・手続きなど)は項目にする。既に同じスレッドの項目があれば、その項目の time より新しいメッセージがあるときだけ、上の「出し直す」のとおり同じ id で出す。
  それ以外の自動通知・SNS 通知は `{{gmail}} read <threadId...>` で既読にし、threadId を `misc:noaction` の refs に入れる(既決にすると受信トレイから外れる)。
- **プロモーション(`in:inbox category:promotions`)**: 本文も snippet も読まず、**差出人と件名だけ**で判断する。
  大事そうなもの(人からのメール、所属先・取引先や `local/PROCEDURE.md` に挙げた相手、請求・契約・アカウント・セキュリティ・締切に関わる件名)は受信トレイに残し、未読の項目として足す(summary は「プロモーションに分類されていた」と件名だけ)。
  それ以外は `{{gmail}} archive <threadId...>` でアーカイブする(既読にはしない。取り消しは `{{gmail}} unarchive`)。迷ったら残す。
- 処理した件数(項目にした/既読/アーカイブ/残した)を add.mjs のメモに書く。

{{sources}}
## 3b. 定形ルール
- 1〜3 で読んだもの(項目にしなかったものも)を `local/RULES.md` の各ルールと照らし、当たったものはそこに書いた処理をする(カレンダーへの追記など。送信・投稿・削除は含まない)。ファイルが無ければ飛ばす。
  処理したものは対応不要のまとめに入れず、必ず1件ずつ **未読** の項目にして、title の頭に「[定形済]」、summary の先頭に「[定形] <何をしたか>」を書く。できなかったら「[定形] 未処理: <理由>」で未決。
{{rules-extra}}
{{checks}}

## 簡易チェック(まとめページの「今すぐチェック」)
{{#quick}}- `<code>/quick-check.sh` がメールの未読と本人宛てだけを見る(1b・done-sync は省く)。2段階: 1段目はメール一覧を機械的に取り、要約前の「速報」としてページに出す(`quick-raw.mjs`)。2段目は claude -p が取ってあるファイル(`<data>/quick/`)から項目を作る。何も来ていなければ claude は呼ばない。定形ルール(3b)も行う。cursor.json の last を進めるので、次の定期チェックはその続きから。定期チェックと同じ lock を使う。{{/quick}}

## 4. まとめ
- 1件ずつ JSON にして `node <code>/add.mjs <file> "<メモ>"`。
  - id: `mail:<threadId>`{{ids}}
{{item-rules}}
  - メールの link は `{{gmail}} link <threadId>` の出力を使う(ブラウザで開いたときと同じ `#all/FMfcgz…` 形式、authuser は設定の account)。自分で URL を組み立てない。
    スマホでは Gmail がスマホ版へ転送して #all/… を捨てるため、ページが `https://mail.google.com/mail/mu/mp/39/#cv/all/<threadId>` に差し替える(server.mjs の mobileAttr。id が mail:<16進> の項目だけ)。
  - status: 本人の対応が要る=未決、情報のみ=未読、対応済み=既決(本人が画面で変えたものは add.mjs が保つ)
  - summary は日本語2〜3行、action は要る対応を1行
  - 締切・期日が分かるものは `due` を入れる(`"2026-10-30"`、時刻が分かれば `"2026-10-30T17:00"`、JST)。本人がする対応の期限(回答・提出・申込・支払い)を入れ、イベントの日しか無いときはその日時。ページが「締切 10/30(金) あと13日」と出し、2日以内は赤くする。
  - **対応不要のまとめは1項目だけ**。メールの配信・通知{{noaction-kinds}}など、読んだが対応も知らせも要らないものは、巡回ごとに項目を立てない。
    その回の分を `{"id":"misc:noaction","source":"misc","time":"<この回の時刻>","from":"定期チェック","title":"対応不要のまとめ","summary":"<行>\n<行>…","action":"","link":"","refs":[…]}` の1件にして add.mjs に渡す。
{{#refs}}    **refs** には、対応不要にしたメールの `mail:<threadId>`(全部)を入れる(既決にしてもメールが消えなかったため)。本人がまとめを既決にすると、done-sync がメールをアーカイブする。{{/refs}}
    **要約の中の語をリンクにする**: 行の中で元を指す語に `[語](ref)` の印を付ける。ref は `mail:<threadId>`{{ref-kinds}}。
    1つの語に複数のメールが当たるときは空白で区切って並べる(`[配信元](mail:<id1> mail:<id2>)`。ページは語を1つ目のリンクにし、2つ目から ²³ を付ける)。差出人ごとに印を付け、件数だけの塊(「プロモーション21件をアーカイブ」)は塊ごとに1つの印にまとめてよい。
    例: `01/01 09:00 [メール] 配信・通知: [配信元A](mail:<id>)(メンテナンスのお知らせ)・[配信元B](mail:<id> mail:<id>)(イベントの案内)`
{{#refs-mark}}    印の付いたメールは add.mjs が refs に足す。印の無い refs はページの「要約に無い元のメッセージ」に一覧で出る(差出人・件名は add.mjs が Gmail から付ける)。{{/refs-mark}}
{{#line-format}}    行は1つの元につき1行で、`MM/DD HH:MM [メール] <差出人>: <件数と中身を一言>`(語に上の印を付ける)。{{/line-format}}
    add.mjs が、まだ既決になっていなければ前の行の上に足し(最大80行)、既決にされた後なら新しい行だけで未読に戻す。回ごとの対応不要の項目(`misc:<時刻>` など)は作らない。
- **待ちの条件を照らす**: `node <code>/wait.mjs list` が成立前の待ち(`cond` 条件・`at` 日時・`task` 成立したら頼むこと)を出す。
  この回に読んだメール{{labels}}(項目にしなかったものも)に `cond` に当たるものがあれば、`node <code>/wait.mjs fire <id> "<何が来たか一言と元のリンク>"` で成立させる(未決に戻り、通知が飛ぶ)。
  当たるか迷うものは成立させ、理由に「要確認」と書く。日時(`at`)はページのサーバーが1分ごとに見るので、ここでは扱わない。
- 既決の片付け:
  毎回 `node <code>/done-sync.mjs` を実行。{{done-sync-note}}
  メールは gmail.py のトークンが gmail.modify なら `gmail.py archive` でその場でアーカイブする。
  トークンが読み取り専用のときは出力された threadId を Gmail コネクタ `unlabel_thread [INBOX]` でアーカイブ → `node <code>/done-sync.mjs --mail-done <threadId...>`。取り消しは `{{gmail}} unarchive <threadId>`。
  済んだ項目には `synced` が付き、二度は処理しない。まとめ項目は refs の分を片付ける。
{{done-extra}}
  ページで既決にすると、サーバーがその場で done-sync を走らせる(ログは done-sync.log)。
- 調べて分かった事実(人・件の経緯・締切・手続き)は `~/notes` に残す(`doc --root ~/notes`、書き方は the deployment notes)。
- 会話への報告は短く:新規の未決だけ列挙し、ページ URL(設定の `pageUrl`)を添える。

## まとめページから Claude で対応する
- 各項目の「AIで対応」→ aigw のセッション(設定の `session` の preset・cwd・group。既定は mail-tui・digest・digest)を作り、
  項目の文脈を1通目として aigw が送る。手順は `CLAUDE.md`(作業フォルダなので Claude Code が自動で読む)。
- 作ったセッションは items.json の `session {id, claude_session_id}` に保存。次からボタンは
  「AIを開く」になり、生きていればそのまま開く/終わっていれば同じ会話を resume で起動し直す。
- 起動されたセッションは、片付いたら `node <code>/set-status.mjs <id> 既決 "<メモ>"` で既決にする(メモはページに出る)。
- add.mjs は既存項目の session を消さない(Object.assign で上書きされるのは新しいキーだけ)。
