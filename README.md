# aigw

**スマホのブラウザで動くPWA(Webアプリ)から、テキストチャットの画面で
ターミナル操作や Claude Code などのAIエージェントとの対話を行うための
仕組み**。ターミナルへの入力・出力をチャットのメッセージのように
やり取りするUIで、tmuxペインの中身をチャット形式で見たり操作したりできる。

その認証・実行基盤として、「パスキー(WebAuthn)でrootシェルの窓を
開閉するデーモン」と「1ユーザー1プロセスのバックエンドへ、systemdの
ソケットアクティベーションで振り分けるプロキシ」を備えている。

**現状のスコープ**: このリポジトリには、上記2つの仕組み、PWAの
コアフロントエンド(セッション一覧・チャットUI)、そしてセッション管理・
tmux操作を行うバックエンド本体(`bin/aigw-backend`・`bin/aigw-gateway`)の
汎用コアが入っている。サーバー固有の実装(特定ドメイン限定の自己登録、
社内ドキュメントビューア連携など)は「拡張ポイントの実装」という形で
コアから切り離されており、このリポジトリには含まれない——後述の
「バックエンドの拡張ポイント」を参照。「WebAuthnでLinuxのroot権限を
時限式に開閉する」「systemdでuid単位にプロセスをファンアウトする」
「モバイル向けPWAでtmuxセッションを操作するUI」の実装例として読むもの、
という位置づけ。

**外部依存**: `bin/aigw-backend`は、コンテナ内でコマンドを実行するための
別ツール(`sandbox exec`/`sandbox ip`相当のCLI)の存在を前提にしている。
このツール自体は本リポジトリには含まれない。将来的にはこの依存ツール
自体も公開し、Linux/Windows(MSYS2等)で動く形にする計画があるが、
現時点では未着手。

## このリポジトリについて

**このリポジトリは、実際に稼働しているホスト上のツリーからの
スナップショットである。** 内部リポジトリのコミット履歴は含まれず、
更新は「Snapshot YYYY-MM-DD」という単一のコミットとして、まとめて
反映される。各修正がいつ・どの順で入ったかは公開されない。

コード中にあった「このデプロイ固有のドキュメントへの参照」は、公開時に
一般的な文章へ書き換えてある。機材名(`winbox-a`/`winbox-b`/`linuxbox`)や
外部ツール名(`media-cli`)も同様に中立な仮名で、実在のホスト名ではない。

**製品ではなく実装例**である。サポート・後方互換性・追従の保証は無い。
脆弱性報告の窓口は`SECURITY.md`を参照。

## 何が入っているか

| ファイル | 役割 |
|---|---|
| `bin/aigw-unlockd` | パスキー解錠の信頼の起点。root権限で動く唯一のプロセスで、WebAuthnの検証(`Fido2Server`)とroot用tmuxサーバーの起動/停止を一手に握る。ネットワークに直接触れるプロセス(ゲートウェイやバックエンド)は一切信用せず、検証結果を左右できない。 |
| `bin/aigw-passkey` | パスキーの登録・一覧・失効・状態表示を行うCLI。判定は一切せず、`aigw-unlockd`のUnixソケットへ中継するだけ。 |
| `bin/aigw-proxy-handler` | ソケットアクティベーションされた接続1本ごとに、対象ユーザーの停止中バックエンドを起こしてから中継する。 |
| `bin/aigw-reap-idle` | しばらく使われていないユーザーごとのバックエンドを止める。 |
| `bin/aigw-root-tmux-grant` | パスキー解錠が成立した瞬間だけ、そのユーザーにroot用tmuxサーバーへのアクセスを与える(逆に閉じる)。 |
| `bin/aigw-gateway` | 共有フロントドア。OAuthログイン・PWA配信・per-userバックエンドへのプロキシ。サーバー固有のルート(下記「バックエンドの拡張ポイント」)は`aigw_site_routes`という任意のPythonモジュールに委譲する形になっており、そのモジュール自体は本リポジトリに含まれない。 |
| `bin/aigw-backend` | ユーザーごとのバックエンド。tmuxセッション管理・SSE配信。`sandbox exec`相当の外部CLIに依存する(前述)。 |
| `bin/aigw-set-email` | 各ユーザーが自分のGoogleアカウントのメールアドレスを自分のGECOS "Other"欄に自己登録するCLI(`aigw-gateway`はログイン時にこれで発行されたメール↔Unixユーザー名の対応を見る)。`root`への昇格はsudo経由、`etc/sudoers.d/aigw.example`参照。 |
| `systemd/*` | 上記を動かすためのユニット一式(`aigw-gateway.service`・`aigw-backend@.service`含む)。 |
| `etc/tmpfiles.d/aigw-backend.conf` | `/run/aigw-backend/`(ソケットアクティベーション用ディレクトリ)を早期boot時に作る`systemd-tmpfiles`設定。`/etc/tmpfiles.d/`にコピーする。 |
| `etc/sudoers.d/aigw.example` | `aigw-set-email`をNOPASSWDで許可するsudoersルールの例。`/etc/sudoers.d/aigw`として設置(グループ名は自分のデプロイに合わせて変更)。 |
| `requirements.txt` | `aigw-gateway`/`aigw-backend`が必要とするPythonパッケージ。 |
| `static/index.html`・`static/app.js`・`static/manifest.json`・`static/sw.js` | モバイル向けPWAのコアフロントエンド(セッション一覧・チャット画面・tmuxペインの表示/操作)。バックエンドAPI(未公開)への依存はあるが、コード自体にサーバー固有の情報は無い。 |

### フロントエンドの拡張ポイント

`static/index.html`には2つの空のフック(`#site-extra-header-links`・
`#site-extra-auth-rows`)があり、`static/app.js`はページ読み込み時に
`window.aigwSiteExtras.init(...)`(存在すれば)を呼ぶ。`/agents/
site-extras.js`という決まった場所に置いた追加スクリプトがあれば、
サーバー固有の機能をコアの
ファイルを一切変更せずに追加できる——ファイルが無いデプロイでは黙って
404になり、何も変わらない。3Dモデル添付を開く処理も同じ仕組み
(`window.aigwSiteExtras.openModel3d`)で、無ければ素のファイルを
ブラウザ既定の扱いで開く。

### バックエンドの拡張ポイント

`bin/aigw-gateway`・`bin/aigw-backend`はどちらも起動時に一度だけ
`try: import aigw_site_routes`(無ければ`None`のまま)し、組み込みの
どのルートにも一致しなかったリクエストをその戻り値へ委譲する
(`aigw_site_routes.handle_get(handler, ctx, path, qs)`のように、
コア側の`sign`/`unsign`等いくつかの関数参照を束ねた小さな`ctx`
オブジェクトを明示的に渡す——両ファイルとも`.py`拡張子を持たない
実行ファイルで、Pythonの通常のimport解決には乗らないため)。
`aigw_site_routes`が存在しなければ、それらのリクエストは単に404に
フォールバックするだけで、コア自体の動作には一切影響しない。

このモジュール自体(社内向けのアカウント自己登録・独自ドキュメント
ビューア連携など、デプロイごとに異なる実装)は本リポジトリには
含まれない——それぞれのデプロイが自分の`aigw_site_routes.py`を
別途用意する前提の拡張ポイントである。

## 設計の要点

### なぜ `sudo` ラッパーではなくデーモンなのか

最初は「決まった動詞だけを許すNOPASSWDのsudoラッパー」として作った。しかし
この方式には構造的な弱点がある:

- ユーザーがargv・環境変数を完全に握ったプロセスがrootで走る。動詞の
  allowlist・引数検証を書くほど、その検証コード自体が攻撃面になる。
- sudoルールがある以上、rootへの経路をアプリケーション経由に限定できない。
  そのUnixアカウントとして動く**何でも**(SSH鍵ログイン、cron)が
  パスワード無しでrootになれてしまう。

今の方式は逆で、**sudoルールは1行も無く、ユーザーが引数を渡すroot側の
プログラムも存在しない**。`aigw-root-tmux@<user>.service`という、ただの
`tmux -D -S ...`サーバー(rootで動くだけの何の変哲もないtmux)を用意しておき、
`aigw-unlockd`がWebAuthnの検証に成功した15分間だけ、そのソケットへの
アクセス権(tmuxの`server-access`ACL + ファイルパーミッション)を
`aigw-root-tmux-grant`で与える/剥奪する。ユーザーが動かせるのは
ただのシェルであり、あらかじめ用意された「rootにできる動詞」の集合ではない。

### 検証結果をどこで計算するか

ネットワークに直接触れるプロセス(ゲートウェイは無権限ユーザーで動き、
バックエンドはリクエストしたUnixユーザーで動く)のどちらも、WebAuthnの
アサーションが妥当かどうかを判定しない。判定するのは`aigw-unlockd`
だけで、これはネットワークから見えない(Unixドメインソケットのみ)。
ゲートウェイ/バックエンドが仲介するのは、ブラウザの
`navigator.credentials.*` が作った不透明なJSONのやり取りだけ——
もしゲートウェイやバックエンドの脆弱性を突かれても、`aigw-unlockd`の
署名検証(WebAuthn認証器の秘密鍵はデバイスの外に出ない)を偽造すること
はできない。

`/run/aigw-unlockd.sock` はあえて`0666`(誰でも接続できる)にしてある。
接続できても「ここに資格情報があるが妥当か」と**尋ねられる**だけで、
状態を変える動詞はすべて`SO_PEERCRED`で呼び出し元の実uidを見て
本人(かroot)以外を拒否する。ソケットのパーミッションではなく、
この署名検証とuidチェックの組み合わせが実際の境界になっている。

### ソケットアクティベーションによるuid単位のファンアウト

1ユーザー1バックエンドプロセスを、そのユーザーがアクセスしたときだけ
systemdに起動させたい。`aigw-backend-proxy@<port>.socket`
(`port = 21000 + (uid - 1000)`)がuidごとに1つずつ事前有効化されており、
接続が来ると`aigw-proxy-handler`が実際のバックエンドソケットへ中継する
(存在しなければ`systemctl start`で起こしてから)。

素朴に「リクエストごとに新規TCP/Unix接続」だと、1回のページ読み込みで
添付が100枚あれば100本超の接続バーストになり、systemdの既定の
`TriggerLimitBurst`/`MaxConnections`にすぐ当たって
`Trigger limit hit`でソケット自体がfailedに落ちる(復旧しない)。
対策は3つ同時: (1) ゲートウェイ側で接続をポートごとに使い回すプール、
(2) 上限自体も余裕を持って引き上げる、(3) 完了したインスタンスの
自動回収(`CollectMode=inactive-or-failed`、`socat`のBroken pipeを
`SuccessExitStatus`で正常終了扱いにする)。どれか1つでは足りない。

## 導入時に必要な設定

### Python実行環境

`aigw-gateway`/`aigw-backend`の1行目(shebang)は`/opt/aigw/venv/bin/python3`
に固定してある。この通りの場所にvenvを作れば、シェバンを書き換える必要は無い:

```sh
python3 -m venv /opt/aigw/venv
/opt/aigw/venv/bin/pip install -r requirements.txt
```

`google-auth-oauthlib`/`google-auth`は`aigw-gateway`のOAuthログイン処理が
直接importする必須の依存(無いとログインできない)。`pywebpush`は
`aigw-backend`がtry/exceptで囲んで遅延importしており、無ければWeb Push
送信を静かにスキップするだけの任意の依存。

### 専用システムユーザーとCookie署名鍵

```sh
useradd --system --no-create-home --shell /usr/sbin/nologin aigw
mkdir -p /etc/aigw
openssl rand -base64 32 > /etc/aigw/cookie_secret
chown aigw:aigw /etc/aigw/cookie_secret
chmod 600 /etc/aigw/cookie_secret
```

`aigw-gateway`はこのファイルを無条件に読む(`Path(...).read_bytes()`)。
セッションCookieのHMAC署名鍵なので、**存在しないとログインが機能する
以前にクラッシュする**。値を変えると既存の全セッションが即座に無効になる。

### Web Push用VAPID鍵ペア(任意)

```sh
/opt/aigw/venv/bin/python3 <<'EOF'
from py_vapid import Vapid02, b64urlencode
from cryptography.hazmat.primitives import serialization

v = Vapid02()
v.generate_keys()
v.save_key("/etc/aigw/vapid_private.pem")

raw_pub = v.public_key.public_bytes(
    serialization.Encoding.X962,
    serialization.PublicFormat.UncompressedPoint,
)
with open("/etc/aigw/vapid_public.txt", "w") as f:
    f.write(b64urlencode(raw_pub))
EOF
chmod 644 /etc/aigw/vapid_private.pem /etc/aigw/vapid_public.txt
```

（`py_vapid`は`pywebpush`が依存として引き込む。`vapid_public.txt`は
ブラウザの`PushManager.subscribe()`にそのまま渡す生の楕円曲線点の
base64url表現で、`save_public_key()`が書き出すPEM形式とは別物なので
注意。）このペアが無くても`aigw-gateway`は`/agents/api/vapid-public-key`を
404で返すだけで、コア機能(ログイン・セッション操作)には影響しない
——Web Pushだけが使えなくなる。

### 自己登録用sudoersルール

```sh
cp etc/sudoers.d/aigw.example /etc/sudoers.d/aigw
# ファイル内の %sandboxusers を、自分のデプロイでaigwを使わせたい
# グループ名に置き換える
chmod 440 /etc/sudoers.d/aigw
visudo -c -f /etc/sudoers.d/aigw
```

### systemdユニットの設置

```sh
cp systemd/*.service systemd/*.socket systemd/*.timer /etc/systemd/system/
cp etc/tmpfiles.d/aigw-backend.conf /etc/tmpfiles.d/aigw-backend.conf
systemd-tmpfiles --create
systemctl daemon-reload
systemctl enable --now aigw-gateway.service aigw-unlockd.service \
  aigw-reap-idle.timer
# aigw-backend@<user>.service・aigw-backend-proxy@<port>.socket は
# ソケットアクティベーション対象なので enable のみ(起動はしない):
for port in $(seq 21000 21099); do
  systemctl enable "aigw-backend-proxy@${port}.socket"
  systemctl start  "aigw-backend-proxy@${port}.socket"
done
```

`port = 21000 + (uid - 1000)`という前提(`aigw-backend-proxy@<port>.socket`
の対応するuid範囲)は`aigw-gateway`側のコードにハードコードされている。
別の割り当てにしたい場合はそちら側の定数も合わせて変える必要がある。

### リバースプロキシ・TLS(このリポジトリの範囲外)

`aigw-gateway`自体は`127.0.0.1:8878`で平文HTTPをlistenするだけで、TLS
終端は行わない。**WebAuthnはHTTPS(またはlocalhost)を要求し、Google
OAuthのredirect URIも実在するHTTPSのURLでなければならない**ため、実際に
動かすにはnginx等のリバースプロキシで`/agents/`を`127.0.0.1:8878`へ
そのまま(パスを剥がさずに)中継し、TLSを終端する設定が別途必要——
具体的な設定例は本リポジトリの範囲外。SSE(`text/event-stream`)を使うため
`proxy_buffering off`相当の設定が要る点にだけ注意。

### Google Cloud ConsoleでのOAuthクライアント作成(手作業)

`/etc/aigw/oauth_client.json`の`client_id`/`client_secret`は、Google Cloud
ConsoleでOAuth 2.0クライアントID(種別: ウェブアプリケーション)を作成し、
承認済みのリダイレクトURIに`https://<public_host>/agents/oauth2callback`を
登録して取得する。コマンドで再現できない手作業。

### WebAuthn設定

`aigw-unlockd`/`aigw-passkey` は WebAuthn の Relying Party 情報を
`/etc/aigw/webauthn.json` から読む(このリポジトリには実ファイルを含めない):

```json
{
  "rp_id": "example.com",
  "rp_name": "aigw root unlock (example.com)",
  "origin": "https://example.com"
}
```

- `rp_id`/`origin` は実際にこのサービスを配信するドメインと一致している
  必要がある(WebAuthnの検証がその場で失敗する)。
- 一度登録したパスキーは`rp_id`に紐づくため、**運用開始後にこの値を
  変えると既存のパスキーが全て無効になる**。

### OAuthクライアント設定

`aigw-gateway`はGoogle OAuthのクライアント情報を`/etc/aigw/oauth_client.json`
から読む(このリポジトリには実ファイルを含めない):

```json
{
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "public_host": "example.com"
}
```

- `public_host`は省略可——省略時はホストの`socket.getfqdn()`を使う。
  OAuthのredirect URI等に使うホスト名を明示したい場合にだけ指定する。

### SSH経由マシン設定(任意)

`aigw-backend`は、SSH経由でも操作したい追加のマシンがあれば
`/etc/aigw/ssh_machines.json`から読む(このリポジトリには実ファイルを
含めない。ファイルが無ければ空のまま——この機能を使わないデプロイでは
単に無視される):

```json
{
  "example-machine": {
    "tmux": "/usr/bin/tmux",
    "bash": "/usr/bin/bash",
    "claude": "/home/you/.local/bin/claude"
  }
}
```

### 既知の制限

- **コンテナ実行基盤(`sandbox`)が無い**: `shell`/`claude-tui`/`claude`の
  各プリセットはコンテナ内でコマンドを実行する外部CLIに依存しており
  (前述「外部依存」)、これが無いままではセッション作成自体が失敗する。
  このリポジトリのコードだけで最小限に動作確認したい場合、`sandbox`の
  代わりに素のローカルシェル/tmuxを直接使う経路への差し替えが必要になる
  (未実装)。
- **「Kill Chrome」ボタンは動かない**: `aigw-backend`のコードには、
  ヘッドフルChromeのデバッグセッションを止めるボタンの実装
  (`chromedbg-kill-own`をsudo経由で呼ぶ、`chrome-debug@<user>.service`を
  操作する)が残っているが、その対象となる`chrome-debug@`サービス一式・
  `chromedbg-*`ツール自体は全く別のデバッグ用サブシステムで本リポジトリ
  には含まれない。押しても失敗するだけで、ログイン・セッション操作等の
  中核機能には影響しない。

## ライセンス

MIT — `LICENSE` を参照。
