# ext/ — aigw の拡張(外せる機能)

aigw の本体(`bin/aigw-backend`・`bin/aigw-gateway`・`static/`)は、拡張が1つも無くても全部の機能が動く。
特定の使い方・特定の配備のための機能は、ここの拡張として足す。拡張のフォルダを消せば、その機能だけが消える。

- **本体は拡張の名前を知らない**。本体のコードに、拡張の名前や、拡張だけが使う言葉は出てこない(テスト`tests/test_ext_contract.py`の`CorePurity`)。
- 本体は「拡張点」を用意するだけ。拡張は、起動時に本体の拡張 API に自分を登録する。
- 拡張は、公開するものとしないものを分けられる。公開のスナップショットは、公開しない拡張のフォルダを丸ごと外す。外した形でも本体が動くことはテストで確かめる。
- **機械や配備の違いは設定で、機能の有無は拡張で**。ssh でつなぐ機械(`/etc/aigw/ssh_machines.json`)や Email の箱(`/etc/aigw/mailbox.json`)のように、
  本体の機能を「どこで・何に」使うかの違いは設定で書く。本体に無い機能を足すのが拡張。

## これまでの「サイト固有の追加」との関係

公開版を分けたとき(2026-09)から、配備だけの機能は次の2つのファイルで足していた。拡張はこれを広げたもので、2つは拡張の1つ(`ext/site/`)に移す。

| これまで | 拡張での形 |
|---|---|
| `aigw_site_routes.py`(`/usr/local/sbin/`、ゲートウェイとバックエンドが`import`。無ければ 404) | `ext/site/gateway.py`(ゲートウェイの経路)と`ext/site/backend.py`(バックエンドの経路) |
| `site-extras.js`(`/opt/aigw/static/`、`app.js`の`initSiteExtras()`が1回呼び、`index.html`の2つの空の差し込み口に入れる) | `ext/site/static/site.js`。差し込み口は`aigwExt`の`slots` |

移し終えた(2026-11-13)。本体はもう`aigw_site_routes`も`site-extras.js`も読まない。

## 置き場所と読み込み

```
ext/<name>/backend.py     バックエンドの部分(無くてもよい)。register(api) を持つ
ext/<name>/gateway.py     ゲートウェイの部分(無くてもよい)。register(api) を持つ
ext/<name>/static/*.js    画面の部分(無くてもよい)。aigwExt.register(...) を呼ぶ
ext/<name>/static/*.css
ext/<name>/reap-keep      aigw-reap-idle の拡張点(無くてもよい)。実行できるファイルで、ユーザー名を引数に 0 で終われば
                          そのユーザーのバックエンドを止めない
ext/<name>/tests/         その拡張のテスト(test_<name>_*.py。本体のテストの中で tests/test_ext_suites.py が走らせる)
ext/<name>/README.md      その拡張の説明
```

- インストール先は`/usr/local/lib/aigw/ext/<name>/`。バックエンドとゲートウェイは、起動時に`AIGW_EXT_DIR`(既定はそのパス)の下の
  `*/backend.py`・`*/gateway.py`を名前の順に読み込む。読み込みに失敗した拡張は、ログに1行書いて飛ばす(本体は止めない)。
- 画面の部分は、バックエンドが`/config`(`GET /agents/api/config`、本人だけ)の`ext`で知らせ(`[{"name", "js": [...], "css": [...], "config": {...}}]`)、`app.js`が`/agents/ext/<name>/<file>`から読み込む。
  ゲートウェイは`/agents/ext/`を`AIGW_EXT_DIR/<name>/static/`から静的に返す。ログインが要る。パスは`<name>/<file>`の1段だけで、
  `<file>`は英数字で始まる`.js`か`.css`、解決した先がその`static/`の中のファイルであること(外へのシンボリックリンクは断る)。
  `app.js`は最初の表示の前に読み込みを待つ(長くて4秒)。
- `aigw-reap-idle`は`AIGW_EXT_DIR`の下の`*/reap-keep`を聞く(上)。

## バックエンドの拡張 API

`register(api)`に渡す`api`が持つもの。拡張は本体の関数を直接呼ばず、ここに無いものが要るときは拡張点を本体に足す。

| 呼び出し | 本体の拡張点 |
|---|---|
| `api.folder(folder, undeletable=True, unshareable_reason=None)` | 組み込みのフォルダ(一覧の先頭、名前・場所は変えられず、消せない。保存されるのは`last_stopped`だけ)。フォルダ単位で共有できない、を指定できる(その理由が断るときの文言)。拡張が無くなると、保存されていた同じ id のフォルダはふつうのフォルダとして残る |
| `api.session_group(name, infer=None, folder=None)` | セッションのまとまり。`create_session(group=…)`が受け付ける名前になる。`infer(meta)`は記録の無い古いセッションの判定。`folder`はそのまとまりの既定のフォルダ |
| `api.get(path, handler)` / `api.post(path, handler)` | 本人の API(`/agents/api/…`)の経路。`path`は`("tasks", "x")`のような組。`handler(req, parts, qs, body)`→`(code, json)`。本体の経路が先(同じパスなら本体)。本人だけ(共有の相手には 403)。例外は 500 にして本体は続ける |
| `api.peer_post(path, peer, handler, unlock_exempt=False)` | 通知専用リスナー(docker0)の経路。`peer`は呼べる相手の種類(`"mail"`=本人の Email の箱)。ほかの相手には 403。本文は 8 KB まで。`unlock_exempt`はその処理の間だけ(と、その処理が`api.background`で始めたものの中だけ)ホストの段のパスキーの窓を求めない。root の段は求める(セキュリティ上の判断なので、使う拡張の README に理由を書く) |
| `api.archive_on_exit(predicate)` | 終わったら自動でアーカイブするセッションの条件(終わりが記録されるとき。人がアーカイブから戻したものは戻したまま) |
| `api.static(js=[...], css=[...])` | 画面の部分のファイル |
| `api.config(key, fn)` | `/config`に足す値 |
| `api.background(fn, *args)` | `fn`を別のスレッドで走らせる。いまの処理のパスキーの例外(`unlock_exempt`)を引き継ぐ(スレッドは要求ごとの状態を引き継がないので) |
| `api.log` / `api.create_session` / `api.list_sessions` / `api.load_meta` / `api.save_meta` / `api.iter_session_dirs` / `api.group_of(meta)`(本体の`session_group`) / `api.send_initial_message` / `api.file_new_session` / `api.succeed_replaced_session` / `api.box_ip` / `api.sign_requester` / `api.mailbox` / `api.mail_presets` / `api.session_id_re` / `api.UnlockRequired` / `api.ConversationRunning` / `api.resolve_workdir` / `api.list_subdirs` / `api.sandhome` | 拡張が使ってよい本体の機能(ここに並べたものだけ。使うときに引くので、テストの差し替えも効く) |

## ゲートウェイの拡張 API

| 呼び出し | 本体の拡張点 |
|---|---|
| `api.get(path_prefix, handler)` / `api.post(path_prefix, handler)` | ゲートウェイの経路(ログインの前後を問わない)。`handler(h, path, qs)`→処理したら true。`h`は今の要求(`_send_json`などを持つ)。これまでの`aigw_site_routes`と同じ所(ログイン・OAuth の後、本体のファイルの前)で聞く。例外は 500 |
| `api.signup(handler)` | 登録の無い Google ログインを受け取ったとき(`maybe_start_signup`) |
| `api.ctx` | Cookie の署名など、これまで`SITE_CTX`で渡していたもの |

## 画面の拡張 API(`window.aigwExt`)

`static/ext.js`が持つ登録簿(DOM に触らないので node でテストできる。`tests/test_ext_frontend.py`)。`app.js`は拡張点でここを引く。
`aigwExt.register(name, hooks)`。`hooks`が持てるもの:

| hook | 本体の拡張点 |
|---|---|
| `folders: [{id, label, draggable, hideWhenEmpty, ownArchive, archiveOpen, archiveClose, openKey}]` | 組み込みのフォルダの見せ方。`archiveOpen`/`archiveClose`は自分のアーカイブの開閉ボタンの文言(`{n}`は件数、`t()`で訳す)。`openKey`は開いているかをこの名前の localStorage にも残す |
| `folderOf(session)` → id か null | フォルダの割り当てが無いセッションの既定のフォルダ |
| `todo: {load() → Promise, rows(session) → [行], extraRows() → [行]}` | 「やること」の一覧への行の追加。`rows`の行は`{title}`(そのセッションの名前の代わり)か`{href, icon, tip}`(リンクのボタン)。`extraRows`の行は一覧の上に出す`{href, icon, who, msg, className}` |
| `links: [{match(url, el) → bool, open(url, el)}]` | 画面の中のリンクの扱い(ふつうのクリック) |
| `back(): bool` | 戻るボタンを先に処理する(true なら本体は何もしない) |
| `closeOverlay(then): bool` | 拡張が画面の上に出しているもの(クラス`ext-overlay`)を閉じる。true なら閉じ終わってから`then()`を呼ぶ |
| `model3d(url, label, opts): bool` | 3D モデルの添付を開く(true なら本体は何もしない。無ければファイルをそのまま開く) |
| `slots: {"header-links": fn(el, app), "settings": fn(el, app)}` | `index.html`の差し込み口(これまでの`site-extras.js`の2つ) |
| `i18n: {en: {...}, "zh-CN": {...}}`(か`{ja: 英語}`) | 訳語。`window.aigwI18n.add`を直接呼んでもよい(`tests/test_i18n.py`は`/* i18n-begin */ … /* i18n-end */`の中を読む) |

拡張が使ってよい画面の機能は`aigwExt.app`(`api`・`t`・`escapeHtml`・`sessions()`・`refreshSessions()`・`openSession(meta)`・`openSessionById(id)`・`findSession(id)`・`render()`・`plainClick(e)`)。
フックが例外を投げても、ログに書いて「答え無し」として扱う。

## テスト

- `tests/test_ext_contract.py`(本体のテスト、公開版でも走る)
  - `NoExtensions`: 拡張なしで本体が動く(組み込みのフォルダが無い・知らないまとまりは断る・拡張の経路は無い・`/config`の`ext`は空・古いメタのセッションは一覧の先頭に出る)
  - `FakeExtension`: テスト用の小さな拡張で、拡張点が全部働く
  - `BrokenExtension`: 読み込みに失敗する拡張は飛ばされ、本体は動く
  - `CorePurity`: 本体のファイルに拡張の名前が出てこない
- `tests/test_ext_frontend.py`: `static/ext.js`の登録簿(node)
- `ext/<name>/tests/`: その拡張の振る舞い(本体と拡張を両方読み込んで確かめる)
- `tests/test_ext_suites.py`: `ext/*/tests`を本体のテストの中で走らせる(拡張が無ければ何もしない)。本体のテストは拡張なしで走る
  (`tests/test_shared_search.py`の読み込みが`EXT_DIR`を空の場所にする)。拡張のテストは自分で`B.load_extensions(ROOT / "ext")`して、終わったら戻す
- 公開の確かめ: `publish-snapshot`が外した形の木で、本体のテストを走らせる

## 移し方 {#migration}

1. テストを先に書く。まだ満たさないものは`expectedFailure`で印を付け、満たしたら外す
2. 本体に、拡張の読み込み・拡張点・`static/ext.js`・`/agents/ext/`を作る
3. 公開しない拡張を1つずつ移す(順番と中身は各拡張の README)
4. これまでの`aigw_site_routes.py`・`site-extras.js`を`ext/site/`へ移し、本体からそれを読む部分を消す
5. `CorePurity`の印を外し、全部のテストが通ることを確かめる。外した形の木でも本体のテストを走らせる
6. 両ホストに入れる(バックエンドとゲートウェイの再起動が要る)
