# email-digest — メールの新着まとめ(aigw の箱の中で動く)

aigw の箱(sandbox)の中で、Gmail の新着を1日数回 Claude が読み、未決・未読・既決の項目にして1枚のページに並べる仕組み。
項目から aigw の Claude セッションを起こして対応する。作りは `ARCHITECTURE.md`、始め方は `digest/README.md`。

- `digest/`: 仕組み(まとめのページとサーバー、項目の置き場、設定、定期チェックの台本と手順書の型)。
- `gmail.py`・`gcal.py`: Gmail・Google カレンダーの API(トークンは `$MAILBOX_DIR/.gmail/`・`.gcal/`、サイトの設定は `$MAILBOX_DIR/.config/mailbox/oauth.json`)。
- 拡張は `digest/private/` に置ける(ARCHITECTURE.md 3)。この写しには含まれていない。

置き方は2つ(ARCHITECTURE.md 2): 箱の `~/` に `digest/`・`gmail.py`・`gcal.py` を写す(写し方式)か、全員の箱が読む共用のコピーを使い、
箱には本人の値(`~/digest/local/`)とデータと入口(`node <共用のコピー>/digest/entries.mjs install`)だけを置く(共用方式)。

テスト(偽のデータだけ): `sh test.sh`
