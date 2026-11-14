# セキュリティ上の報告について / Reporting a vulnerability

このリポジトリは、実際に動いているホームサーバー用ゲートウェイのコアを
公開したものです(`README.md`の「このリポジトリについて」を参照)。
**製品ではなく実装例**であり、サポートや修正の保証はありません。

脆弱性を見つけた場合は、公開のIssueではなく、GitHubの
**Security → Report a vulnerability**(private vulnerability reporting)から
報告してください。届いた内容は非公開のまま扱います。

報告に含めてほしいもの:

- どのファイル・どの関数の話か(このリポジトリは単一コミットのスナップショット
  なので、コミットハッシュではなくファイル名と関数名で指定してください)
- 前提となる権限(未認証か、ログイン済みの一般ユーザーか、同一ホスト上の
  ローカルユーザーか)
- 想定される影響

特に価値があるのは、**セッションCookieの検証・回転**(`bin/aigw-gateway`)、
**共有セッションの権限境界**(`resolve_session_access`と2つのallowlist)、
**WebAuthnの検証**(`bin/aigw-unlockd`)まわりの指摘です。

---

This is the core of a home-server gateway that is actually running, published
as a worked example rather than a supported product. Please report
vulnerabilities through GitHub's private vulnerability reporting (Security →
Report a vulnerability) instead of a public issue. Point at files and
functions rather than commits: this repository is a squashed snapshot, not a
commit-by-commit history.
