// aigw's display language: 日本語 / English / 简体中文 (the deployment notes, 2026-10-16).
//
// The Japanese text itself is the key: app.js says t("開始") and gets the
// translation for the chosen language, or the Japanese back when there is
// none (Japanese is the source language). "{name}" in a key is filled from
// t()'s second argument. index.html's own static text and title/placeholder/
// aria-label attributes are translated once by apply(), before app.js runs,
// so nothing app.js renders later (chat messages included) is ever touched
// by it.
//
// The choice is kept in this browser (localStorage, read before the first
// paint) and in the user's own backend (GET/POST /prefs), so another device
// picks it up after logging in. Loaded by index.html, outbox-browse.html and
// the deployment's own pages (login, ...), which all share this origin;
// those add their own words with add().
(function () {
  const LANGS = { ja: "日本語", en: "English", "zh-CN": "简体中文" };
  const STORE_KEY = "aigw-lang";

  const D = {
    en: {
      "Shell (root・sandbox外)": "Shell (root, outside sandbox)",
      "設定": "Settings",
      "画面あり(デスクトップのセッション1で動く)。タップで画面なしに": "With screen (runs in desktop session 1). Tap for no screen",
      "画面なし(セッション0で動く)。タップで画面ありに": "No screen (runs in session 0). Tap for a screen",
      "(一覧を取得できません)": "(could not get the list)",
      "サブフォルダを開く…": "Open a subfolder…",
      "(サブフォルダなし)": "(no subfolders)",
      "新しいフォルダの名前": "Name of the new folder",
      "フォルダを作れませんでした: {err}": "Could not create the folder: {err}",
      "ドライブを選択…": "Choose a drive…",
      "ドライブを選ぶ…": "Choose a drive…",
      "(ドライブが見つかりません)": "(no drives found)",
      "新規": "New",
      "sandboxコンテナ内": "inside the sandbox container",
      "このホスト(sandbox外・あなた自身)": "this host (outside the sandbox, as you)",
      "このホストの root": "root on this host",
      "確認中…": "Checking…",
      "権限なし": "No access",
      "ログイン済み": "Logged in",
      "未ログイン": "Not logged in",
      "{where}のClaude Codeをログアウトします。よろしいですか?": "Log Claude Code out of {where}?",
      "ログアウトに失敗しました: {err}": "Logout failed: {err}",
      "ログインを開始できませんでした: {err}": "Could not start the login: {err}",
      "ログイン": "Log in",
      "ログアウト": "Log out",
      "{where}のCodexをログアウトします。よろしいですか?": "Log Codex out of {where}?",
      "実行中…": "Running…",
      "停止しました": "Stopped",
      "全ユーザーのheadful ChromeをKillします。よろしいですか?": "Kill headful Chrome for all users?",
      "ファイルを添付": "Attach a file",
      "このブラウザはパスキー(WebAuthn)に対応していません": "This browser does not support passkeys (WebAuthn)",
      "認証を開始できませんでした": "Could not start authentication",
      "生体認証がキャンセルまたは失敗しました: {err}": "Biometric authentication was cancelled or failed: {err}",
      "認証に失敗しました": "Authentication failed",
      "{label} がアンロック中。タップでロック(今すぐ解除)": "{label} is unlocked. Tap to lock now",
      "root/hostのアンロックを今すぐ解除しますか?": "Lock root/host now?",
      "考え中…": "Thinking…",
      "サブエージェントはまだありません": "No subagents yet",
      "← 一覧": "← List",
      "読み込み中…": "Loading…",
      "(まだ内容がありません)": "(nothing here yet)",
      "ダウンロードに失敗しました": "Download failed",
      "💾 会話ログを保存": "💾 Save the conversation log",
      "閲覧のみ": "Read-only",
      "共同作業": "Co-work",
      "全員": "Everyone",
      "解除": "Remove",
      "まだ誰とも共有していません": "Not shared with anyone yet",
      "閲覧のみ: チャットのログだけが見えます(画面・送信・停止はできません)。全員 = このサーバーの aigw の全ユーザー。":
        "Read-only: they see only the chat log (no screen, sending or stopping). Everyone = every aigw user on this server.",
      "⚠️ 共同作業で共有すると、相手はあなたと同じ権限でコマンドを実行できます。":
        "⚠️ Sharing for co-work lets them run commands with your permissions.",
      "ユーザーを指定": "A specific user",
      "ユーザー名": "Username",
      "共有する": "Share",
      "共有解除に失敗しました: {err}": "Could not stop sharing: {err}",
      "共有に失敗しました: {err}": "Could not share: {err}",
      "思考(タップで全文)": "Thinking (tap for all of it)",
      "⏎なし": "no ⏎",
      "セッションは終了しました (終了コード {code})": "The session has ended (exit code {code})",
      "セッションは終了しました": "The session has ended",
      "画面のどこかをタップすると戻ります": "Tap anywhere to go back",
      "残り{h}時間{m}分": "{h} h {m} min left",
      "残り{h}時間": "{h} h left",
      "残り{m}分": "{m} min left",
      "🔗「{label}」とつなぐ相手をタップしてください": "🔗 Tap the session to link with “{label}”",
      "「{a}」と「{b}」の連携を切断します。よろしいですか?": "Unlink “{a}” and “{b}”?",
      "切断できませんでした: {err}": "Could not unlink: {err}",
      "「{a}」と「{b}」をつなぎます。": "Link “{a}” and “{b}”.",
      "何分で自動的に切断するかを入力してください(最大1440分=24時間)。": "Unlink automatically after how many minutes? (up to 1440 = 24 h)",
      "分数は正の数で入力してください": "Enter a positive number of minutes",
      "連携できませんでした: {err}": "Could not link: {err}",
      "🔓 解錠して表示": "🔓 Unlock to show",
      "🔒 {n} 件のセッションは、パスキーで解錠するまで名前を隠しています": "🔒 {n} sessions are hidden until you unlock with your passkey",
      "{owner}さんと共有": "shared by {owner}",
      "ドラッグで並べ替え": "Drag to reorder",
      "タップで再開": "Tap to resume",
      "タップで停止": "Tap to stop",
      "名前を変更": "Rename",
      "連携中(「{label}」)-- タップで切断": "Linked with “{label}” — tap to unlink",
      "他のセッションとつなぐ": "Link with another session",
      "アーカイブへ移動": "Archive",
      "🗄 アーカイブを閉じる": "🗄 Close the archive",
      "🗄 アーカイブを開く ({n})": "🗄 Open the archive ({n})",
      "アーカイブから戻す": "Restore from the archive",
      "👥 共有ログを閉じる": "👥 Close shared logs",
      "📨 Digest を閉じる": "📨 Close Digest",
      "👥 共有ログを開く ({n})": "👥 Open shared logs ({n})",
      "アーカイブできませんでした: {err}": "Could not archive: {err}",
      "元に戻せませんでした: {err}": "Could not restore: {err}",
      "「{label}」の会話ログを削除します。元に戻せません。よろしいですか?": "Delete the conversation log of “{label}”? This cannot be undone.",
      "新しい名前:": "New name:",
      "名前を変更できませんでした: {err}": "Could not rename: {err}",
      "接続": "Connect",
      "接続に失敗しました: {err}": "Could not connect: {err}",
      "ここが会話の最初です": "This is the start of the conversation",
      "読み込みに失敗しました(スクロールでやり直せます)": "Loading failed (scroll to try again)",
      "🔒 このセッションを読むにはパスキーでの解錠が要ります。開き直してください": "🔒 Reading this session needs a passkey unlock. Open it again",
      "🔒 パスキーの解錠が切れました。開き直してください": "🔒 The passkey unlock has expired. Open it again",
      "{owner}さんの共有ログ(閲覧のみ)": "{owner}'s shared log (read-only)",
      "{owner}さんと共有中": "Shared by {owner}",
      "{owner}さん": "{owner}",
      "見る": "Watch",
      "{owner}さんのセッション(見るだけ)": "{owner}'s session (watch only)",
      "保存": "Save",
      "共有": "Share",
      "自分": "Me",
      "AI(思考)": "AI (thinking)",
      "システム": "System",
      "このセッションはもうありません": "This session no longer exists",
      "検索中…": "Searching…",
      "検索できませんでした: {err}": "Search failed: {err}",
      "{n}件": "{n} hits",
      "(新しい順に表示、これより古いものは省略)": " (newest first; older ones omitted)",
      "見つかりませんでした": "Nothing found",
      "🔒 {n}個のセッション(ホスト・ルート・Email)は解錠すると検索できます": "🔒 {n} sessions (host, root, Email) can be searched after unlocking",
      "。": ". ",
      "[{owner}さん] ": "[{owner}] ",
      "{who} からログアウトしますか？": "Log out {who}?",
      "起動中…": "Starting…",
      "セッションを作成できませんでした: {err}": "Could not create the session: {err}",
      "終了しています": "Ended",
      "このセッションを停止しますか？(Claude が動いていれば Ctrl+C を2回送り、会話を残してから終わらせます)":
        "Stop this session? (If Claude is running, it gets Ctrl+C twice so the conversation is saved first)",
      "停止できませんでした: {err}": "Could not stop: {err}",
      "「{label}」を続きから再開しますか？(履歴は新しいセッションに引き継ぎ、このセッションは消えます)":
        "Resume “{label}”? (Its history moves to the new session and this one is removed)",
      "再開できませんでした: {err}": "Could not resume: {err}",
      "送信に失敗しました: {err}": "Sending failed: {err}",
      "もう一度お試しください。": "Please try again.",
      "ファイルが大きすぎます(上限{mb}MB)。": "The file is too large (limit {mb} MB).",
      "ファイルの添付に失敗しました: {err}": "Could not attach the file: {err}",
      "操作対象のマシン": "Machine to work on",
      "タップでログアウト": "Tap to log out",
      "チャットを検索": "Search chats",
      "再読み込み": "Reload",
      "チャットを検索(空白で区切るとすべてを含むもの)": "Search chats (separate words with spaces to require all)",
      "検索": "Search",
      "Shell (sandbox内)": "Shell (inside sandbox)",
      "Shell (sandbox外・ホスト)": "Shell (outside sandbox, host)",
      "名前(任意)": "Name (optional)",
      "開始": "Start",
      "作業ディレクトリ": "Working directory",
      "上のフォルダへ": "Up one folder",
      "ここに新しいフォルダを作る": "Create a new folder here",
      "続きから": "Continue from",
      "権限確認をスキップ(--dangerously-skip-permissions)": "Skip permission prompts (--dangerously-skip-permissions)",
      "作業ドライブ/フォルダ": "Working drive/folder",
      "画面の有無": "With or without a screen",
      "画面": "Screen",
      "キャンセル": "Cancel",
      "🗄 アーカイブを開く": "🗄 Open the archive",
      "👥 共有ログを開く": "👥 Open shared logs",
      "既存のtmuxセッション": "Existing tmux sessions",
      "全部再確認": "Check everything again",
      "sandbox内": "inside sandbox",
      "sandbox外(host)": "outside sandbox (host)",
      "Kill Chrome(全員)": "Kill Chrome (everyone)",
      "🔒 root/hostのロックが閉じているため、新着メッセージを取得できません": "🔒 root/host is locked, so new messages cannot be fetched",
      "🔓 解錠する": "🔓 Unlock",
      "ライブ表示に戻る": "Back to the live view",
      "● ライブに戻る": "● Back to live",
      "サブエージェント": "Subagents",
      "↓ 新着": "↓ New",
      "メッセージを入力...": "Type a message...",
      "Enterを送らずに文字だけ送る": "Send the text without Enter",
      "送信": "Send",
      "文字を送ってEnter(空ならEnterだけ)": "Send the text and Enter (just Enter if empty)",
      "実行": "Run",
      "フォルダ": "Folder",
      "(空のフォルダです)": "(empty folder)",
      "読み込めませんでした: {err}": "Could not load: {err}",
      "セッションが指定されていません。": "No session given.",
      "表示言語": "Language",
    },
    "zh-CN": {
      "Shell (root・sandbox外)": "Shell(root,沙箱外)",
      "設定": "设置",
      "画面あり(デスクトップのセッション1で動く)。タップで画面なしに": "有画面(在桌面会话 1 中运行)。点按切换为无画面",
      "画面なし(セッション0で動く)。タップで画面ありに": "无画面(在会话 0 中运行)。点按切换为有画面",
      "(一覧を取得できません)": "(无法获取列表)",
      "サブフォルダを開く…": "打开子文件夹…",
      "(サブフォルダなし)": "(没有子文件夹)",
      "新しいフォルダの名前": "新文件夹的名称",
      "フォルダを作れませんでした: {err}": "无法创建文件夹:{err}",
      "ドライブを選択…": "选择驱动器…",
      "ドライブを選ぶ…": "选择驱动器…",
      "(ドライブが見つかりません)": "(未找到驱动器)",
      "新規": "新建",
      "sandboxコンテナ内": "沙箱容器内",
      "このホスト(sandbox外・あなた自身)": "本主机(沙箱外,以你本人身份)",
      "このホストの root": "本主机的 root",
      "確認中…": "检查中…",
      "権限なし": "无权限",
      "ログイン済み": "已登录",
      "未ログイン": "未登录",
      "{where}のClaude Codeをログアウトします。よろしいですか?": "要将 {where} 的 Claude Code 退出登录吗?",
      "ログアウトに失敗しました: {err}": "退出登录失败:{err}",
      "ログインを開始できませんでした: {err}": "无法开始登录:{err}",
      "ログイン": "登录",
      "ログアウト": "退出登录",
      "{where}のCodexをログアウトします。よろしいですか?": "要将 {where} 的 Codex 退出登录吗?",
      "実行中…": "执行中…",
      "停止しました": "已停止",
      "全ユーザーのheadful ChromeをKillします。よろしいですか?": "要结束所有用户的有界面 Chrome 吗?",
      "ファイルを添付": "添加附件",
      "このブラウザはパスキー(WebAuthn)に対応していません": "此浏览器不支持通行密钥(WebAuthn)",
      "認証を開始できませんでした": "无法开始认证",
      "生体認証がキャンセルまたは失敗しました: {err}": "生物识别认证已取消或失败:{err}",
      "認証に失敗しました": "认证失败",
      "{label} がアンロック中。タップでロック(今すぐ解除)": "{label} 已解锁。点按立即锁定",
      "root/hostのアンロックを今すぐ解除しますか?": "要立即锁定 root/host 吗?",
      "考え中…": "思考中…",
      "サブエージェントはまだありません": "还没有子代理",
      "← 一覧": "← 列表",
      "読み込み中…": "加载中…",
      "(まだ内容がありません)": "(还没有内容)",
      "ダウンロードに失敗しました": "下载失败",
      "💾 会話ログを保存": "💾 保存对话记录",
      "閲覧のみ": "只读",
      "共同作業": "协作",
      "全員": "所有人",
      "解除": "取消",
      "まだ誰とも共有していません": "尚未与任何人共享",
      "閲覧のみ: チャットのログだけが見えます(画面・送信・停止はできません)。全員 = このサーバーの aigw の全ユーザー。":
        "只读:对方只能看到聊天记录(不能看画面、发送或停止)。所有人 = 本服务器上 aigw 的全部用户。",
      "⚠️ 共同作業で共有すると、相手はあなたと同じ権限でコマンドを実行できます。":
        "⚠️ 以协作方式共享后,对方可以用你的权限执行命令。",
      "ユーザーを指定": "指定用户",
      "ユーザー名": "用户名",
      "共有する": "共享",
      "共有解除に失敗しました: {err}": "取消共享失败:{err}",
      "共有に失敗しました: {err}": "共享失败:{err}",
      "思考(タップで全文)": "思考(点按查看全文)",
      "⏎なし": "无 ⏎",
      "セッションは終了しました (終了コード {code})": "会话已结束(退出码 {code})",
      "セッションは終了しました": "会话已结束",
      "画面のどこかをタップすると戻ります": "点按任意位置返回",
      "残り{h}時間{m}分": "剩余 {h} 小时 {m} 分钟",
      "残り{h}時間": "剩余 {h} 小时",
      "残り{m}分": "剩余 {m} 分钟",
      "🔗「{label}」とつなぐ相手をタップしてください": "🔗 请点按要与「{label}」连接的会话",
      "「{a}」と「{b}」の連携を切断します。よろしいですか?": "要断开「{a}」与「{b}」的连接吗?",
      "切断できませんでした: {err}": "无法断开:{err}",
      "「{a}」と「{b}」をつなぎます。": "将连接「{a}」与「{b}」。",
      "何分で自動的に切断するかを入力してください(最大1440分=24時間)。": "请输入几分钟后自动断开(最多 1440 分钟 = 24 小时)。",
      "分数は正の数で入力してください": "请输入正数的分钟数",
      "連携できませんでした: {err}": "无法连接:{err}",
      "🔓 解錠して表示": "🔓 解锁后显示",
      "🔒 {n} 件のセッションは、パスキーで解錠するまで名前を隠しています": "🔒 {n} 个会话的名称在用通行密钥解锁前被隐藏",
      "{owner}さんと共有": "{owner} 共享",
      "ドラッグで並べ替え": "拖动以排序",
      "タップで再開": "点按以继续",
      "タップで停止": "点按以停止",
      "名前を変更": "重命名",
      "連携中(「{label}」)-- タップで切断": "已与「{label}」连接 —— 点按断开",
      "他のセッションとつなぐ": "与其他会话连接",
      "アーカイブへ移動": "归档",
      "🗄 アーカイブを閉じる": "🗄 关闭归档",
      "🗄 アーカイブを開く ({n})": "🗄 打开归档({n})",
      "アーカイブから戻す": "从归档恢复",
      "👥 共有ログを閉じる": "👥 关闭共享记录",
      "📨 Digest を閉じる": "📨 关闭 Digest",
      "👥 共有ログを開く ({n})": "👥 打开共享记录({n})",
      "アーカイブできませんでした: {err}": "无法归档:{err}",
      "元に戻せませんでした: {err}": "无法恢复:{err}",
      "「{label}」の会話ログを削除します。元に戻せません。よろしいですか?": "要删除「{label}」的对话记录吗?此操作无法撤销。",
      "新しい名前:": "新名称:",
      "名前を変更できませんでした: {err}": "无法重命名:{err}",
      "接続": "连接",
      "接続に失敗しました: {err}": "连接失败:{err}",
      "ここが会話の最初です": "这是对话的开头",
      "読み込みに失敗しました(スクロールでやり直せます)": "加载失败(滚动可重试)",
      "🔒 このセッションを読むにはパスキーでの解錠が要ります。開き直してください": "🔒 阅读此会话需要用通行密钥解锁。请重新打开",
      "🔒 パスキーの解錠が切れました。開き直してください": "🔒 通行密钥解锁已过期。请重新打开",
      "{owner}さんの共有ログ(閲覧のみ)": "{owner} 的共享记录(只读)",
      "{owner}さんと共有中": "{owner} 共享中",
      "{owner}さん": "{owner}",
      "見る": "查看",
      "{owner}さんのセッション(見るだけ)": "{owner} 的会话(仅查看)",
      "保存": "保存",
      "共有": "共享",
      "自分": "我",
      "AI(思考)": "AI(思考)",
      "システム": "系统",
      "このセッションはもうありません": "此会话已不存在",
      "検索中…": "搜索中…",
      "検索できませんでした: {err}": "搜索失败:{err}",
      "{n}件": "{n} 条",
      "(新しい順に表示、これより古いものは省略)": "(按新到旧显示,更早的已省略)",
      "見つかりませんでした": "未找到",
      "🔒 {n}個のセッション(ホスト・ルート・Email)は解錠すると検索できます": "🔒 {n} 个会话(主机、root、Email)解锁后可搜索",
      "。": "。",
      "[{owner}さん] ": "[{owner}] ",
      "{who} からログアウトしますか？": "要退出 {who} 吗?",
      "起動中…": "启动中…",
      "セッションを作成できませんでした: {err}": "无法创建会话:{err}",
      "終了しています": "已结束",
      "このセッションを停止しますか？(Claude が動いていれば Ctrl+C を2回送り、会話を残してから終わらせます)":
        "要停止此会话吗?(如果 Claude 正在运行,会先发送两次 Ctrl+C 保存对话后再结束)",
      "停止できませんでした: {err}": "无法停止:{err}",
      "「{label}」を続きから再開しますか？(履歴は新しいセッションに引き継ぎ、このセッションは消えます)":
        "要继续「{label}」吗?(记录将转到新会话,此会话会被删除)",
      "再開できませんでした: {err}": "无法继续:{err}",
      "送信に失敗しました: {err}": "发送失败:{err}",
      "もう一度お試しください。": "请再试一次。",
      "ファイルが大きすぎます(上限{mb}MB)。": "文件过大(上限 {mb} MB)。",
      "ファイルの添付に失敗しました: {err}": "添加附件失败:{err}",
      "操作対象のマシン": "要操作的机器",
      "タップでログアウト": "点按退出登录",
      "チャットを検索": "搜索聊天",
      "再読み込み": "重新加载",
      "チャットを検索(空白で区切るとすべてを含むもの)": "搜索聊天(用空格分隔表示须全部包含)",
      "検索": "搜索",
      "Shell (sandbox内)": "Shell(沙箱内)",
      "Shell (sandbox外・ホスト)": "Shell(沙箱外,主机)",
      "名前(任意)": "名称(可选)",
      "開始": "开始",
      "作業ディレクトリ": "工作目录",
      "上のフォルダへ": "上一级文件夹",
      "ここに新しいフォルダを作る": "在此新建文件夹",
      "続きから": "继续",
      "権限確認をスキップ(--dangerously-skip-permissions)": "跳过权限确认(--dangerously-skip-permissions)",
      "作業ドライブ/フォルダ": "工作驱动器/文件夹",
      "画面の有無": "有无画面",
      "画面": "画面",
      "キャンセル": "取消",
      "🗄 アーカイブを開く": "🗄 打开归档",
      "👥 共有ログを開く": "👥 打开共享记录",
      "既存のtmuxセッション": "现有的 tmux 会话",
      "全部再確認": "全部重新检查",
      "sandbox内": "沙箱内",
      "sandbox外(host)": "沙箱外(主机)",
      "Kill Chrome(全員)": "结束 Chrome(所有人)",
      "🔒 root/hostのロックが閉じているため、新着メッセージを取得できません": "🔒 root/host 已锁定,无法获取新消息",
      "🔓 解錠する": "🔓 解锁",
      "ライブ表示に戻る": "返回实时画面",
      "● ライブに戻る": "● 返回实时",
      "サブエージェント": "子代理",
      "↓ 新着": "↓ 新消息",
      "メッセージを入力...": "输入消息...",
      "Enterを送らずに文字だけ送る": "只发送文字,不按 Enter",
      "送信": "发送",
      "文字を送ってEnter(空ならEnterだけ)": "发送文字并按 Enter(为空时只按 Enter)",
      "実行": "执行",
      "フォルダ": "文件夹",
      "(空のフォルダです)": "(空文件夹)",
      "読み込めませんでした: {err}": "无法加载:{err}",
      "セッションが指定されていません。": "未指定会话。",
      "表示言語": "显示语言",
    },
  };

  function readStored() {
    try {
      const v = localStorage.getItem(STORE_KEY);
      return v && v in LANGS ? v : null;
    } catch (e) {
      return null;
    }
  }

  let lang = readStored() || "ja";
  document.documentElement.lang = lang;

  function t(s, vars) {
    let out = (lang !== "ja" && D[lang] && D[lang][s]) || s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return out;
  }

  const ATTRS = ["title", "placeholder", "aria-label"];

  // Static markup only -- called once per page before its own script runs.
  function apply(root) {
    if (lang === "ja" || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const p = n.parentNode && n.parentNode.nodeName;
      if (p === "SCRIPT" || p === "STYLE") continue;
      const key = n.nodeValue.trim();
      if (!key) continue;
      const tr = t(key);
      if (tr !== key) n.nodeValue = n.nodeValue.replace(key, tr);
    }
    for (const el of root.querySelectorAll("[title],[placeholder],[aria-label]")) {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v) {
          const tr = t(v.trim());
          if (tr !== v.trim()) el.setAttribute(a, tr);
        }
      }
    }
    if (document.title) document.title = t(document.title);
  }

  // The choice also lives in the user's own backend (POST /prefs), so a
  // new device picks it up after logging in; the page is reloaded to
  // re-render everything in the new language.
  async function setLang(next) {
    if (!(next in LANGS) || next === lang) return;
    try { localStorage.setItem(STORE_KEY, next); } catch (e) { /* private mode */ }
    try {
      await fetch("/agents/api/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: next }),
      });
    } catch (e) { /* kept in this browser at least */ }
    location.reload();
  }

  // After login: if this browser has no choice yet, or another device
  // changed it, follow the server's.
  async function syncFromServer() {
    let r;
    try {
      r = await fetch("/agents/api/prefs").then((x) => (x.ok ? x.json() : null));
    } catch (e) {
      return;
    }
    const server = r && r.lang in LANGS ? r.lang : null;
    if (!server) {
      // First time on the server: record what this browser already uses.
      const local = readStored();
      if (local) fetch("/agents/api/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: local }),
      }).catch(() => {});
      return;
    }
    if (server !== lang) {
      try { localStorage.setItem(STORE_KEY, server); } catch (e) { /* private mode */ }
      location.reload();
    }
  }

  // A deployment's own pages (and site-extras.js) bring their own words:
  // add({ en: {...}, "zh-CN": {...} }) before apply()/t() needs them.
  function add(extra) {
    for (const [l, words] of Object.entries(extra || {})) {
      if (D[l]) Object.assign(D[l], words);
    }
  }

  window.aigwI18n = { t, apply, add, setLang, syncFromServer, LANGS, lang: () => lang, _dict: D };
  window.t = t;
})();
