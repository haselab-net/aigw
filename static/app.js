(() => {
  "use strict";

  // If the same index.html/app.js is ever served identically from more than
  // one host, which server a tab/PWA icon (and the machine selector's
  // "local" entry, see MACHINE_LABELS) belongs to has to come from the
  // actual hostname the browser loaded, not a fixed string -- e.g.
  // "example.com" becomes "example", correct on any host with no per-host
  // file diff.
  const SHORT_HOSTNAME = location.hostname.split(".")[0];
  document.title = `aigw (${SHORT_HOSTNAME})`;

  // Every internal navigation (openSession/closeSession/openAuthView) writes
  // its state to location.hash so a reload can return to it -- but a plain
  // `location.hash = x` assignment pushes a *new* browser history entry each
  // time, which iOS/Android's own edge-swipe-back gesture then treats as
  // real navigation history to pop, entirely independently of aigw's own
  // JS-driven swipe-back handler (see below).
  // The two fighting over the same swipe was reported 2026-08-16 as "after
  // swiping back, the page I just left reappears" -- the OS gesture was
  // popping a stale hash entry back into view a moment after aigw's own
  // handler had already moved on. history.replaceState never adds an entry,
  // so there is nothing left for a native back gesture to find. See
  // setHash()'s callers for where `location.hash = ...` used to be.
  // Browser Back from a session returns to the list (2026-11-04, at the
  // user's request, with patrol): opening a session from a list view adds
  // one history entry; moving to another session (patrol, links) does not
  // add more; Back pops it and closes the session, and closing it any other
  // way (←, swipe) pops it too, so no stale entry is left for the OS
  // back gesture to find (the 2026-08-16 problem below).
  // The app's own path for any URL that names a session or the list: never
  // /todo (2026-11-08, the user: leaving やること for a session made
  // /todo#<id>, which does not come back to it).
  function appPath() { return /\/todo\/?$/.test(location.pathname) ? "/agents/" : location.pathname; }
  let sessionHistoryPushed = false;
  function pushSessionHistory() {
    if (sessionHistoryPushed) return;
    // The entry Back returns to must be the list's own URL. Opened from a
    // URL that already names the session (#<id>: a reload, a notification,
    // a page in the Email box) it would otherwise be that #<id>, and Back's
    // hashchange opened the same session again (2026-11-04, the user:
    // "戻るで一覧に戻れないことがあります。URLに#IDが付いてるから").
    const listUrl = listHash() ? `${appPath()}${location.search}#${listHash()}` : `${appPath()}${location.search}`;
    // Opened from the to-do list (/todo): that entry stays, so Back returns
    // to the list it was opened from (2026-11-09, the user: "タスクリストから
    // セッションに移動してその後またタスクリストに戻るって事ができない").
    if (!/\/todo\/?$/.test(location.pathname)) history.replaceState(null, "", listUrl);
    history.pushState({ aigw: "session" }, "", listUrl);
    sessionHistoryPushed = true;
  }
  function popSessionHistory() {
    if (!sessionHistoryPushed) return;
    sessionHistoryPushed = false;
    history.back();
  }
  window.addEventListener("popstate", () => {
    if (window.aigwExt.back()) return; // an extension's own entry (aigwExt back)
    if (!sessionHistoryPushed) return;
    sessionHistoryPushed = false;
    if (currentSessionId) closeSession();
  });

  function setHash(value) {
    const url = value ? `${appPath()}${location.search}#${value}` : `${appPath()}${location.search}`;
    history.replaceState(null, "", url);
  }

  const viewList = document.getElementById("view-list");
  const viewChat = document.getElementById("view-chat");
  const viewAuth = document.getElementById("view-auth");
  const topHeaderEl = document.getElementById("top-header");
  const sessionsEl = document.getElementById("sessions");
  const archiveToggleBtn = document.getElementById("archive-toggle-btn");
  const archivedListEl = document.getElementById("archived-list");
  // Built-in folders with an archive list of their own (aigwExt folders,
  // ownArchive): folded under the archive.
  const extArchivesEl = document.getElementById("ext-archives");
  // Sessions others shared with me, folded like the archive and grouped by
  // owner (the deployment notes).
  const sharedToggleBtn = document.getElementById("shared-toggle-btn");
  const sharedListEl = document.getElementById("shared-list");
  const composerEl = document.getElementById("composer");
  const linkArmedBannerEl = document.getElementById("link-armed-banner");
  const linkArmedTextEl = document.getElementById("link-armed-text");
  const linkArmedCancelBtn = document.getElementById("link-armed-cancel");
  const tmuxSessionsEl = document.getElementById("tmux-sessions");
  const whoEl = document.getElementById("who");
  const messagesEl = document.getElementById("messages");
  const chatLabelEl = document.getElementById("chat-label");
  const chatOwnerBadgeEl = document.getElementById("chat-owner-badge");
  const chatDotEl = document.getElementById("chat-dot");
  const unlockNoticeEl = document.getElementById("unlock-notice");
  const unlockNoticeBtnEl = document.getElementById("unlock-notice-btn");
  const textEl = document.getElementById("text");
  const sendBtn = document.getElementById("send-btn");
  const runBtn = document.getElementById("run-btn");
  const keyToolbarEl = document.getElementById("key-toolbar");
  const modRowEl = document.getElementById("key-modrow");
  const gridEl = document.getElementById("key-grid");
  const attachFileInputEl = document.getElementById("attach-file-input");
  const screenBtn = document.getElementById("screen-btn");
  const screenWrapEl = document.getElementById("screen-wrap");
  const screenPaneEl = document.getElementById("screen-pane");
  const screenLiveBtnEl = document.getElementById("screen-live-btn");
  const agentsBtn = document.getElementById("agents-btn");
  const agentsPaneEl = document.getElementById("agents-pane");
  const shareBtn = document.getElementById("share-btn");
  const sharePaneEl = document.getElementById("share-pane");
  const presetEl = document.getElementById("preset");
  const claudeOptsEl = document.getElementById("claude-opts");
  const cwdCrumbEl = document.getElementById("cwd-crumb");
  const cwdUpBtn = document.getElementById("cwd-up");
  const cwdChildEl = document.getElementById("cwd-child");
  const resumeEl = document.getElementById("resume");
  const skipPermissionsEl = document.getElementById("skip-permissions");
  const sshCwdOptsEl = document.getElementById("ssh-cwd-opts");
  const sshCwdCrumbEl = document.getElementById("ssh-cwd-crumb");
  const sshCwdUpBtn = document.getElementById("ssh-cwd-up");
  const sshCwdNewBtn = document.getElementById("ssh-cwd-new");
  const sshCwdChildEl = document.getElementById("ssh-cwd-child");
  const sshResumeEl = document.getElementById("ssh-resume");
  // 🐚/🪟 toggle on the #ssh-resume row (the deployment notes): 🐚 runs the new
  // session in the Windows machine's sshd session 0 (no desktop), 🪟 in the
  // logged-on user's desktop session 1, via that machine's desktop variant
  // (GET /capabilities' ssh_desktop, {base: variant}). One row in the
  // machine picker per machine either way. Two copies of the button: one on
  // the Claude preset's #ssh-resume row, one in #ssh-shell-opts for "Shell"
  // (which has no such row) -- both show and flip the same desktopMode.
  const desktopToggleEls = document.querySelectorAll(".desktop-toggle");
  const sshShellOptsEl = document.getElementById("ssh-shell-opts");
  const shellCwdOptsEl = document.getElementById("shell-cwd-opts");
  const shellCwdCrumbEl = document.getElementById("shell-cwd-crumb");
  const shellCwdUpBtn = document.getElementById("shell-cwd-up");
  const shellCwdChildEl = document.getElementById("shell-cwd-child");
  const shellCwdNewBtn = document.getElementById("shell-cwd-new");

  // Working directory for a new claude session, relative to ~/sandhome
  // ("" = ~/sandhome itself). Walked one level at a time, so it can go as
  // deep as the tree does.
  let currentCwd = "";
  // Which tree #claude-opts is walking: "sandhome" (claude-tui) or "mail"
  // (the Email preset's own MAILBOX dir, the deployment notes, 2026-10-06) --
  // same picker, same resume list, each tree keeping its own position.
  let cwdScope = "sandhome";
  const cwdByScope = { sandhome: "", mail: "" };
  let mailboxLabel = "Email";

  let currentSessionId = null;
  let currentPreset = null;
  // The full meta object for the currently-open session, kept alongside the
  // individual current* fields above (which predate this) specifically so
  // updateUnlockNotice() can read tmux_location/alive without plumbing them
  // through as separate globals of their own. null while on the session list.
  let currentSessionMeta = null;
  // Username of the session's owner when it's someone else's session opened
  // via sharing; null for a session that is the current
  // user's own. sessionPath()/sessionApiUrl() key off this to route every
  // per-session call through /shared/<owner>/... instead of the normal
  // /sessions/... path.
  let currentOwner = null;
  // Set just before opening a "claude-login*" session from the auth page's
  // ログイン button, so closeSession() knows to return there instead of the
  // session list (the chat view's own edge-swipe-right-to-go-back gesture,
  // aigw's usual entry point, is unaffected -- it always goes through this
  // same closeSession()).
  let sessionOpenedFromAuth = false;
  // Set once the open login session (claude-login* / codex-login*) has ended:
  // there is nothing left to do in it, so any tap in the chat view goes back
  // (2026-10-17, user request: having to find ← after logging in was unclear).
  let tapToLeave = false;
  const isLoginPreset = (p) => /^(claude|codex)-login/.test(String(p || ""));
  let currentEventSource = null;
  // The bubble currently showing an "attach"-preset session's still-changing
  // tail line (see the live_tail case in renderEvent) -- updated in place on
  // each new live_tail event instead of appending a fresh bubble every poll.
  // Reset to null on any other event type, so the *next* live_tail starts a
  // new bubble rather than resuming a now-stale one.
  let liveBubbleEl = null;

  // Presets driven headlessly through a request/response API (no real
  // terminal underneath) instead of a raw tmux pane -- see aigw-backend's
  // own HEADLESS_PRESETS. These have no notion of "keys" or intermediate
  // TUI redraws.
  const HEADLESS_PRESETS = ["claude"];

  // Presets that take a working directory and an optional conversation to
  // resume -- both run Claude Code (see CWD_PRESETS in aigw-backend). Only
  // "claude-tui" is creatable from the dropdown now; "claude" stays listed
  // so sessions made before it was removed still behave correctly. Never
  // applies to the ssh:<machine> presets (rebuildPresetOptions()) -- those
  // machines share no filesystem with this host, so there is no ~/sandhome
  // for a working directory to mean anything in. A drives-capable machine's
  // own Claude preset (claude-tui-<machine>) gets a *different* cwd picker
  // instead (#ssh-cwd-opts/#ssh-resume, sshCwdMachines below) -- never
  // added to this list, since it's rooted at a drive letter, not
  // ~/sandhome, and (unlike the two members below) has no fixed default
  // directory to resume "the current one" against before a drive/folder is
  // actually chosen (the deployment notes).
  const CWD_PRESETS = ["claude", "claude-tui"];
  // Working-directory-only pickers (2026-09-27,
  // the deployment notes, user request: "続きから"/screen-log-persist restoring the plain
  // shells needs somewhere stable to key on, same as claude-tui already
  // has). No resume row for any of these (aigw-backend's SHELL_CWD_PRESETS
  // has no notion of resuming a specific past conversation) -- see
  // #shell-cwd-opts, shown instead of #claude-opts/#ssh-cwd-opts.
  // "shell" browses the exact same ~/sandhome tree "claude"/"claude-tui" do
  // (GET /workdirs?scope=sandhome, the default, unchanged); "host-shell"
  // this user's real host filesystem (scope=host); "root-shell" the real
  // root filesystem via the root tmux pane (scope=root, can pop the same
  // passkey prompt opening the session itself already can). "codex-tui"
  // joined this list 2026-09-28 (user request), same scope=sandhome as
  // "shell" -- it just has no resume of its own (aigw-backend's own
  // SHELL_CWD_PRESETS comment), unlike claude-tui/CWD_PRESETS above.
  const SHELL_CWD_PRESETS = ["shell", "host-shell", "root-shell", "codex-tui"];
  const SHELL_CWD_SCOPE = { shell: "sandhome", "host-shell": "host", "root-shell": "root", "codex-tui": "sandhome" };
  // Each preset's own current position, independently -- switching the
  // preset dropdown between e.g. "host-shell" and "root-shell" must not
  // carry one's browsed-to path over to the other's picker.
  let shellCwdByPreset = { shell: "", "host-shell": "", "root-shell": "", "codex-tui": "" };
  // Machines whose Claude preset offers #ssh-cwd-opts (winbox-a/winbox-b,
  // not linuxbox) -- from GET /capabilities' ssh_machines_drives, since
  // which machines exist/support it is a live backend answer, same as
  // ssh_machines itself.
  let sshCwdMachines = [];
  // The drive/folder picker's current position: "" means "no drive chosen
  // yet" (shows the machine's drive letters), otherwise a posix MSYS2 path
  // like "/d/Projects" (see resolve_ssh_workdir in aigw-backend). Reset
  // whenever the machine selector changes (applyMachineFilter) so switching
  // machines never carries over a path from a different one.
  let currentSshCwd = "";
  // {base machine: desktop variant} and its inverse, from GET /capabilities'
  // ssh_desktop; desktopMode is the 🐚(false)/🪟(true) toggle's state, reset
  // to 🐚 whenever the machine changes.
  let sshDesktop = {};
  let desktopBase = {};
  let desktopMode = false;

  // "local" means aigw-backend's own container/host/root locations -- the
  // machine selector's other options are aigw-backend's SSH_MACHINES,
  // reachable only over SSH via a shared key, not
  // per-user like root_shell. Populated from GET /capabilities in
  // applyCapabilities() since which machines exist/are reachable is a live
  // backend answer, not a fixed set.
  let currentMachine = "local";
  // Manual drag order of the session list: an array of
  // session ids, persisted server-side (GET/POST /session-order) so it
  // survives reloads and other devices. Sessions not in it (new, or from
  // before this feature existed) fall back to the usual alive/ended sort --
  // see applyCustomOrder(). Kept alongside the last full sessions array
  // (own + shared, unfiltered by machine) so a drag on the filtered view can
  // be merged back into a full order without losing hidden sessions' spots.
  let sessionOrder = [];
  let lastSessions = [];
  // ✓/💤/⏰ set from this page (the deployment notes): a list refresh that started
  // before the change came back must not put the old state back (2026-11-10,
  // the user: 済みにしたら一度消えて、また出て、その後消えた).
  const taskLocal = new Map();
  let taskSeq = 0;
  let dragState = null;
  // Archived sessions are display-only: hidden
  // from the main list, shown instead in #archived-list once the toggle
  // button is pressed. Recomputed on every refreshSessions(); archivedVisible
  // survives across refreshes (a manual toggle) but resets to closed on
  // reload, same as sessionMachine/currentMachine above.
  let archivedVisible = false;
  // A built-in folder's own archive list (ownArchive): folder id -> its
  // archived sessions, and which of those lists are open.
  const extArchived = new Map();
  const extArchivedOpen = new Set();
  let lastArchivedSessions = [];
  let sharedVisible = false;
  let lastSharedSessions = [];
  const openSharedOwners = new Set();
  // A fixed "このホスト" label was ambiguous whenever more than one host
  // shares this same static file -- the actual hostname (2026-08-17, at
  // the user's request) says which one without guessing.
  const MACHINE_LABELS = { local: SHORT_HOSTNAME };
  const machineSelectEl = document.getElementById("machine-select");
  // Snapshot of the local preset <option>s (including "root-shell" if this
  // user has it), taken once in applyCapabilities() after they're all in
  // place -- restored verbatim by rebuildPresetOptions() when switching back
  // to "local" rather than reconstructing them by hand a second time.
  let localPresetOptionsHtml = null;

  // tmux_location is "container"/"host"/"root" for everything on this host,
  // "ssh:<machine>" for a GPU machine -- so this is the one place that needs
  // to know that scheme to answer "which machine is this session's".
  function sessionMachine(meta) {
    const loc = meta.tmux_location || "";
    if (!loc.startsWith("ssh:")) return "local";
    const m = loc.slice(4);
    // A desktop variant's sessions belong to its base machine's list
    // (the deployment notes) -- screenBadge below tells the two kinds apart.
    return desktopBase[m] || m;
  }

  // The list view's own location.hash: "" for this host, "machine=<name>"
  // for any other, so a reload (or a shared link) comes back to the same
  // machine's list instead of always this host's (2026-10-04, at the
  // user's request: "マシンを選んでもurlのハッシュ部分が変わらない").
  function listHash() {
    return currentMachine === "local" ? "" : `machine=${encodeURIComponent(currentMachine)}`;
  }

  // Makes `m` the selected machine (state + <select> + preset list).
  // Usable before applyCapabilities() has built the <select> (init()'s
  // applyHash() runs first): the <select>/presets are then brought in line
  // by syncMachineSelect() once it has.
  function selectMachine(m) {
    if (m !== currentMachine) {
      currentMachine = m;
      currentSshCwd = "";
      desktopMode = false;
      if (localPresetOptionsHtml !== null) rebuildPresetOptions();
    }
    syncMachineSelect();
  }

  let boardMachines = new Set();
  // Exactly the Windows machine being looked at (if any) has an entry in
  // the machine menu, just above 「📋 黒板」.
  function syncBoardMachineOption(m) {
    for (const o of [...machineSelectEl.options]) {
      if (o.dataset.board && o.value !== m) o.remove();
    }
    if (!boardMachines.has(m) || [...machineSelectEl.options].some((o) => o.value === m)) return;
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = "🪟 " + m;
    opt.dataset.board = "1";
    machineSelectEl.insertBefore(opt, [...machineSelectEl.options].find((o) => o.value === "board" || o.value === "auth") || null);
  }
  // From the blackboard: that machine's sessions.
  function openBoardMachine(m) {
    closeBoard();
    if (currentSessionId) closeSession();
    if (m !== "auth") syncBoardMachineOption(m);
    machineSelectEl.value = m;
    applyMachineFilter();
  }
  // The header shows the machine being looked at as a button that opens
  // the machine panel (the <select> stays, hidden, as the state).
  const machineBtnEl = document.getElementById("machine-btn");
  function updateMachineBtn() {
    const v = machineSelectEl.value;
    const o = [...machineSelectEl.options].find((x) => x.value === v);
    machineBtnEl.textContent = (v === "auth" ? "⚙ " : "") + (o ? o.textContent : v || "") + " ▾";
  }
  machineBtnEl.addEventListener("click", () => openBoard());

  // Shows currentMachine in the <select> once it exists; a machine that is
  // not offered (unreachable right now, or gone) falls back to this host.
  function syncMachineSelect() {
    if (localPresetOptionsHtml === null) return; // capabilities not loaded yet
    syncBoardMachineOption(currentMachine);
    if (![...machineSelectEl.options].some((o) => o.value === currentMachine)) {
      currentMachine = "local";
      rebuildPresetOptions();
    }
    machineSelectEl.value = currentMachine;
    updateMachineBtn();
  }

  // "🪟 " / "🐚 " in front of a session's name on a machine that has a
  // desktop variant (the deployment notes), so desktop and no-desktop sessions
  // are distinguishable at a glance; "" everywhere else.
  // "確認待ち" (the deployment notes): the backend saw a Claude Code dialog (a
  // permission prompt or a choice) on this session's screen.
  function waitingBadge(meta) {
    if (meta.waiting) return `<span class="waiting-badge">${t("確認待ち")}</span>`;
    // the deployment notes: the state Claude declared, as a small mark on the row.
    const tk = !meta.owner && !meta.archived && meta.task;
    if (!tk) return "";
    if (tk.state === "you") return `<span class="waiting-badge">${t("要判断")}</span>`;
    if (tk.state === "snooze") {
      const d = new Date((tk.until || 0) * 1000);
      return `<span class="task-badge${d <= new Date() ? " due" : ""}">💤${d.getMonth() + 1}/${d.getDate()}</span>`;
    }
    if (tk.state === "done" && !tk.seen) return `<span class="task-badge">${t("済み")}</span>`;
    return "";
  }

  // The kind of session as an icon before its name (2026-11-05, the user:
  // "セッションのタイプをセッション名の前にアイコンで。メールボックスは新着一覧の
  // メールと同じ物、devbox:🛠️ root:🔒。文字での表示はなくして"): 📫 the Email box
  // (the mail icon of the Email box's own pages), 🛠️ devbox, 🔒 root, 🏠 the host itself,
  // 💻 an ssh machine.
  function typeIcon(meta) {
    const loc = meta.tmux_location || "container";
    let icon;
    if (meta.preset === "mail-tui") icon = "📫";
    else if (loc === "root") icon = "🔒";
    else if (loc === "host") icon = "🏠";
    else if (loc.startsWith("ssh:")) icon = "💻";
    else icon = "🛠️";
    return icon + " ";
  }
  function screenBadge(meta) {
    const loc = meta.tmux_location || "";
    if (!loc.startsWith("ssh:")) return "";
    const m = loc.slice(4);
    if (desktopBase[m]) return "🪟 ";
    if (sshDesktop[m]) return "🐚 ";
    return "";
  }

  // Rebuilds the new-session preset dropdown for whichever machine is
  // currently selected -- a remote machine only ever offers a plain shell and
  // Claude (see aigw-backend's shell-<machine>/claude-tui-<machine> presets),
  // never host-shell/root-shell/CWD pickers, which are meaningless there.
  function rebuildPresetOptions() {
    if (currentMachine === "local") {
      presetEl.innerHTML = localPresetOptionsHtml;
    } else {
      presetEl.innerHTML =
        `<option value="claude-tui-${currentMachine}">Claude</option>` +
        `<option value="shell-${currentMachine}">Shell</option>`;
    }
    applyPresetOptions();
  }

  async function applyMachineFilter() {
    if (machineSelectEl.value === "auth") {
      openAuthView();
      return;
    }
    if (machineSelectEl.value === "board") {
      // Not a machine either: opens the blackboard and puts the menu back.
      machineSelectEl.value = viewAuth.style.display === "flex" ? "auth" : currentMachine;
      openBoard();
      return;
    }
    currentMachine = machineSelectEl.value;
    syncBoardMachineOption(currentMachine);
    updateMachineBtn();
    currentSshCwd = ""; // a path on the previous machine means nothing on this one
    desktopMode = false; // 🐚 is the default on every machine
    if (viewAuth.style.display !== "none") {
      // Was viewing the auth page -- picking any real machine here is now
      // the only way to leave it (no back button there
      // any more, 2026-08-15, at the user's request).
      viewAuth.style.display = "none";
      viewList.style.display = "block";
    }
    setHash(listHash());
    rebuildPresetOptions();
    await refreshSessions();
    await refreshTmuxSessions();
  }

  // "Claude 認証" is its own page (view-auth) rather than part of the session
  // list -- see index.html's comment on #view-auth for why it moved.
  // location.hash mirrors openSession's own convention (so a reload while
  // here returns here instead of silently dropping back to the session
  // list).
  function openAuthView() {
    viewList.style.display = "none";
    viewChat.style.display = "none";
    viewAuth.style.display = "flex";
    setHash("auth");
    machineSelectEl.value = "auth"; // also reached via init()'s hash-restore, where the <select> would otherwise still show its freshly-built default ("local")
    updateMachineBtn();
    refreshAuthStatus();
  }

  // Adds the preset options this particular user is allowed to use, and
  // populates the machine selector. Only "root-shell" is conditional among
  // the local presets: the backend offers it only to users who can already
  // become root, and both aigw-backend's create_session and the
  // aigw-root-tmux sudo wrapper check that independently -- hiding the
  // option here is convenience, not the security boundary. Machines are
  // similarly just hidden when GET /capabilities doesn't list them as
  // reachable -- create_session/start_claude_login re-check reachability
  // themselves regardless.
  async function applyCapabilities() {
    const caps = await api("/capabilities").catch(() => ({}));
    document.getElementById("login-list-row").hidden = !caps.login_list;
    // root_shell alone is "the root tmux socket exists right now", which
    // since the passkey unlock landed means "a window is open right now".
    // Keying the menu off only that made the root-shell option invisible
    // while locked -- i.e. exactly when you need to pick it to be prompted
    // for a passkey -- so it could never be reached (seen for real on
    // 2026-08-30). unlock.enrolled_root (two-tier update --
    // NOT plain "enrolled", which is now true for a
    // host-tier-only credential too) is the standing "this person has a
    // ROOT-tier passkey, so they can open a root window" answer; either one
    // means the option is worth offering, and picking it while locked runs
    // withUnlockRetry's WebAuthn flow (requesting tier "root") and then
    // succeeds. Someone enrolled for host only correctly never sees this --
    // begin-assertion(tier=root) would just refuse them with "no root-tier
    // credential registered for this user" every time.
    const canRoot = !!(caps.root_shell || (caps.unlock && caps.unlock.enrolled_root));
    if (canRoot) {
      const opt = document.createElement("option");
      opt.value = "root-shell";
      opt.textContent = t("Shell (root・sandbox外)");
      presetEl.appendChild(opt);
      // Same gate as the preset option above: the root Claude-auth row is
      // only ever useful to a user who can reach the root tmux server at all.
      document.getElementById("auth-row-root").classList.add("visible");
      document.getElementById("codex-auth-row-root").classList.add("visible");
    }
    // The second-sandbox preset (aigw-backend's MAILBOX): a Claude Code TUI
    // in a sandbox container separate from devbox-<user>, for material that
    // must not sit in ~/sandhome. Added dynamically for the same reason
    // root-shell is -- a host with no such sandbox configured reports
    // caps.mailbox as null and never shows the option. The label comes from
    // that host's own config file, not from here.
    if (caps.mailbox && caps.mailbox.label) {
      mailboxLabel = caps.mailbox.label;
      const opt = document.createElement("option");
      opt.value = "mail-tui";
      opt.textContent = caps.mailbox.label;
      // Before the Shell entries rather than appended: it belongs with the
      // agent presets (Claude/Codex) it sits alongside, not after the
      // shells. Falls back to appending if that anchor ever goes away.
      presetEl.insertBefore(opt, presetEl.querySelector('option[value="shell"]'));
    }
    localPresetOptionsHtml = presetEl.innerHTML;

    sshCwdMachines = caps.ssh_machines_drives || [];
    sshDesktop = caps.ssh_desktop || {};
    desktopBase = {};
    for (const [base, variant] of Object.entries(sshDesktop)) desktopBase[variant] = base;

    machineSelectEl.innerHTML = "";
    const localOpt = document.createElement("option");
    localOpt.value = "local";
    localOpt.textContent = MACHINE_LABELS.local;
    machineSelectEl.appendChild(localOpt);
    // The Windows machines are reached from the blackboard instead of this
    // menu (2026-11-09, the user): only the one being looked at is listed,
    // so the menu shows it and picking this host goes back.
    boardMachines = new Set(caps.board !== false ? (caps.ssh_machines_drives || []) : []);
    for (const machine of caps.ssh_machines || []) {
      MACHINE_LABELS[machine] = machine;
      addSshAuthRow(machine);
      if (boardMachines.has(machine)) continue;
      const opt = document.createElement("option");
      opt.value = machine;
      opt.textContent = machine;
      machineSelectEl.appendChild(opt);
    }
    // Not a machine -- a one-shot navigation to view-auth, always last in
    // the list ("ホスト一覧の一番下", 2026-08-15). Renamed "Claude 認証" ->
    // "設定" (2026-08-18) once that page grew a second, unrelated concern
    // (Kill Chrome) -- see index.html's comment on #auth-header.
    // The blackboard of the Windows machines (the deployment notes): an entry
    // here instead of its own 📋 in the header (2026-11-09, the user: the
    // header was full again).
    const authOpt = document.createElement("option");
    authOpt.value = "auth";
    authOpt.textContent = t("設定");
    machineSelectEl.appendChild(authOpt);
    machineSelectEl.addEventListener("change", applyMachineFilter);
    updateMachineBtn();
    // Same gate as the "root-shell" preset option above.
    // Same reasoning as canRoot above: "kill all" drives a root pane, so it
    // is hidden while locked if it keys off root_shell alone. Tapping it
    // goes through withUnlockRetry like every other sandbox-outside action.
    if (canRoot) chromeKillAllBtn.classList.add("visible");
  }

  // ---- working directory + resume, for the headless "claude" preset ------
  //
  // Everything here is a *choice from what already exists* rather than free
  // text: a phone keyboard is a bad place to type a path, and a typo would
  // only surface as a 400 after tapping 開始. The directory is walked one
  // level at a time (breadcrumb + "open a subfolder" + ↑) instead of being
  // picked out of a flattened list of the whole tree -- that keeps every
  // dropdown short while leaving any depth reachable. The conversation list
  // then comes from whichever directory you stopped at.

  function applyPresetOptions() {
    const isMail = presetEl.value === "mail-tui";
    claudeOptsEl.classList.toggle("visible", CWD_PRESETS.includes(presetEl.value) || isMail);
    // The Email sandbox always runs with --dangerously-skip-permissions
    // (the sandbox CLI builds that command line), so no checkbox for it.
    skipPermissionsEl.closest(".nsb-row").style.display = isMail ? "none" : "";
    const scope = isMail ? "mail" : "sandhome";
    if (scope !== cwdScope && (isMail || CWD_PRESETS.includes(presetEl.value))) {
      cwdByScope[cwdScope] = currentCwd;
      cwdScope = scope;
      currentCwd = cwdByScope[scope];
      refreshWorkdirs();
    }
    // #ssh-cwd-opts: only for a drives-capable machine's
    // own Claude preset ("claude-tui-<machine>") -- "Shell" on the same
    // machine gets no picker either, same as the local "shell" preset.
    const showSshCwd = sshCwdMachines.includes(currentMachine) && presetEl.value === `claude-tui-${currentMachine}`;
    sshCwdOptsEl.classList.toggle("visible", showSshCwd);
    sshShellOptsEl.classList.toggle("visible",
      !!sshDesktop[currentMachine] && presetEl.value === `shell-${currentMachine}`);
    updateDesktopToggle();
    if (showSshCwd) refreshSshWorkdirs();
    const showShellCwd = SHELL_CWD_PRESETS.includes(presetEl.value);
    shellCwdOptsEl.classList.toggle("visible", showShellCwd);
    if (showShellCwd) refreshShellCwdWorkdirs();
  }

  function updateDesktopToggle() {
    const available = !!sshDesktop[currentMachine];
    if (!available) desktopMode = false;
    for (const el of desktopToggleEls) {
      el.style.display = available ? "" : "none";
      el.textContent = desktopMode ? "🪟" : "🐚";
      el.title = desktopMode
        ? t("画面あり(デスクトップのセッション1で動く)。タップで画面なしに")
        : t("画面なし(セッション0で動く)。タップで画面ありに");
    }
  }
  for (const el of desktopToggleEls) {
    el.addEventListener("click", () => {
      desktopMode = !desktopMode;
      updateDesktopToggle();
    });
  }

  // Re-reads the level `currentCwd` points at. A directory that has since
  // been renamed or deleted answers 400, which drops us back to ~/sandhome
  // rather than leaving the UI pointing at something that isn't there.
  // interactive=false: a background re-read (back from a session, page
  // load) -- for "mail" that must not pop a passkey prompt out of nowhere,
  // so a locked window just leaves the picker as it was.
  async function refreshWorkdirs(interactive = true) {
    const asked = currentCwd;
    const scope = cwdScope;
    // "mail" is host-tier gated (it lists mail-derived folders), so it can
    // ask for the passkey right here, like root-shell's own picker does.
    const fetchIt = () => api(`/workdirs?scope=${scope}&dir=${encodeURIComponent(asked)}`);
    let unlockNeeded = false;
    const r = await (scope === "mail" && interactive ? withUnlockRetry(fetchIt) : fetchIt())
      .catch((e) => { unlockNeeded = !!e.unlockRequired; return null; });
    if (!r && unlockNeeded && !interactive) return;
    if (asked !== currentCwd || scope !== cwdScope) return; // a later navigation already won
    const top = scope === "mail" ? mailboxLabel : "sandhome";
    if (!r) {
      if (currentCwd === "") {
        if (scope === "mail") {
          cwdCrumbEl.textContent = top;
          cwdUpBtn.disabled = true;
          cwdChildEl.innerHTML = `<option value="">${t("(一覧を取得できません)")}</option>`;
          cwdChildEl.disabled = true;
          populateConversationSelect(resumeEl, []);
        }
        return;
      }
      currentCwd = "";
      return refreshWorkdirs(interactive);
    }
    currentCwd = r.dir;
    cwdCrumbEl.textContent = currentCwd ? `${top}/${currentCwd}` : top;
    cwdUpBtn.disabled = !currentCwd;

    cwdChildEl.innerHTML = "";
    const head = document.createElement("option");
    head.value = "";
    head.textContent = r.subdirs.length ? t("サブフォルダを開く…") : t("(サブフォルダなし)");
    cwdChildEl.appendChild(head);
    cwdChildEl.disabled = !r.subdirs.length;
    for (const name of r.subdirs) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      cwdChildEl.appendChild(opt);
    }
    await refreshConversations(interactive);
  }

  async function navigateTo(rel) {
    currentCwd = rel;
    await refreshWorkdirs();
  }

  cwdChildEl.addEventListener("change", () => {
    const name = cwdChildEl.value;
    if (!name) return;
    navigateTo(currentCwd ? `${currentCwd}/${name}` : name);
  });

  cwdUpBtn.addEventListener("click", () => {
    if (!currentCwd) return;
    const cut = currentCwd.lastIndexOf("/");
    navigateTo(cut === -1 ? "" : currentCwd.slice(0, cut));
  });

  // ＋: a new, empty folder under the one shown, then straight into it
  // (POST /workdirs, the deployment notes). Both trees -- the user asked for it
  // on Email, and the two pickers are meant to behave the same.
  document.getElementById("cwd-new").addEventListener("click", async () => {
    const name = (prompt("新しいフォルダの名前") || "").trim();
    if (!name) return;
    const scope = cwdScope;
    const parent = currentCwd;
    const post = () => api("/workdirs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, dir: parent, name }),
    });
    const r = await (scope === "mail" ? withUnlockRetry(post) : post()).catch((e) => ({ error: e.message }));
    if (r.error) return alert(t("フォルダを作れませんでした: {err}", { err: r.error }));
    if (scope === cwdScope) navigateTo(r.dir);
  });

  // ---- drive/folder picker, for a drives-capable ssh machine's Claude
  // preset ------------------------------------------------------------------
  //
  // Same one-level-at-a-time idea as the sandhome picker above, just rooted
  // at "pick a drive" (currentSshCwd === "") instead of always starting
  // somewhere under ~/sandhome. GET /ssh-workdirs answers `drives` (only
  // when `dir` is empty) or `subdirs` (once a drive/folder is chosen) --
  // never both at once.

  // "/d/Projects/foo" -> "D:/Projects/foo" -- purely a display nicety, the
  // posix form is still what is stored in currentSshCwd/sent to the backend.
  function mountPathLabel(path) {
    const m = path.match(/^\/([a-z])(\/.*)?$/);
    return m ? `${m[1].toUpperCase()}:${m[2] || "/"}` : path;
  }

  async function refreshSshWorkdirs() {
    const machine = currentMachine;
    const asked = currentSshCwd;
    const r = await api(`/ssh-workdirs?machine=${encodeURIComponent(machine)}&dir=${encodeURIComponent(asked)}`)
      .catch(() => null);
    // A later navigation, or a machine switch while this was in flight,
    // already won -- same guard as refreshWorkdirs() above.
    if (machine !== currentMachine || asked !== currentSshCwd) return;
    if (!r) {
      if (currentSshCwd === "") return;
      currentSshCwd = "";
      return refreshSshWorkdirs();
    }
    currentSshCwd = r.dir;
    const atRoot = currentSshCwd === "";
    sshCwdCrumbEl.textContent = atRoot ? t("ドライブを選択…") : mountPathLabel(currentSshCwd);
    sshCwdUpBtn.disabled = atRoot;
    sshCwdNewBtn.disabled = atRoot; // a folder needs a drive to go in

    sshCwdChildEl.innerHTML = "";
    const items = atRoot ? r.drives : r.subdirs;
    const head = document.createElement("option");
    head.value = "";
    head.textContent = items.length
      ? (atRoot ? t("ドライブを選ぶ…") : t("サブフォルダを開く…"))
      : (atRoot ? t("(ドライブが見つかりません)") : t("(サブフォルダなし)"));
    sshCwdChildEl.appendChild(head);
    sshCwdChildEl.disabled = !items.length;
    for (const name of items) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = atRoot ? `${name.toUpperCase()}:` : name;
      sshCwdChildEl.appendChild(opt);
    }
    await refreshSshConversations();
  }

  async function navigateSshTo(path) {
    currentSshCwd = path;
    await refreshSshWorkdirs();
  }

  sshCwdChildEl.addEventListener("change", () => {
    const name = sshCwdChildEl.value;
    if (!name) return;
    // At the root, `name` is a bare drive letter ("d"), not a child of the
    // current path -- everywhere else this is exactly navigateTo()'s own
    // "append below the current directory" move.
    navigateSshTo(currentSshCwd ? `${currentSshCwd}/${name}` : `/${name}`);
  });

  sshCwdUpBtn.addEventListener("click", () => {
    if (!currentSshCwd) return;
    const cut = currentSshCwd.lastIndexOf("/");
    navigateSshTo(cut === -1 ? "" : currentSshCwd.slice(0, cut));
  });

  // ＋ on a Windows machine (2026-10-08, user request): the same new-folder
  // move as #claude-opts' own, created on that machine over ssh.
  sshCwdNewBtn.addEventListener("click", async () => {
    if (!currentSshCwd) return;
    const name = (prompt("新しいフォルダの名前") || "").trim();
    if (!name) return;
    const machine = currentMachine;
    const parent = currentSshCwd;
    const r = await api("/workdirs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "ssh", machine, dir: parent, name }),
    }).catch((e) => ({ error: e.message }));
    if (r.error) return alert(t("フォルダを作れませんでした: {err}", { err: r.error }));
    if (machine === currentMachine && parent === currentSshCwd) navigateSshTo(r.dir);
  });

  // ---- working-directory-only picker, for "shell"/"host-shell"/
  // "root-shell" (2026-09-27, the deployment notes) -----------------
  //
  // One picker, three backend scopes (SHELL_CWD_SCOPE) -- "sandhome" walks
  // one level at a time exactly like #claude-opts' own (`dir` relative to
  // ~/sandhome, "" at the root); "host"/"root" walk the real filesystem
  // instead, so `dir` there is an absolute path throughout, no relative
  // math needed -- see aigw-backend's GET /workdirs.

  async function refreshShellCwdWorkdirs() {
    const preset = presetEl.value;
    const scope = SHELL_CWD_SCOPE[preset];
    if (!scope) return;
    const asked = shellCwdByPreset[preset];
    const fetchIt = () => api(`/workdirs?scope=${scope}&dir=${encodeURIComponent(asked)}`);
    // "root": GET /workdirs?scope=root can 403 unlock_required (root-shell's
    // own picker routes through the root tmux pane, gated the same passkey-
    // unlock way opening the session itself already is) -- withUnlockRetry
    // runs that ceremony right here instead of leaving the picker empty
    // until 開始 is pressed and the *session* creation call hits the same
    // gate. "sandhome"/"host" never raise this, so wrapping them too would
    // just be a needless no-op layer.
    const r = await (scope === "root" ? withUnlockRetry(fetchIt) : fetchIt()).catch(() => null);
    // A later navigation, or a preset switch while this was in flight,
    // already won -- same guard as refreshWorkdirs()/refreshSshWorkdirs().
    if (presetEl.value !== preset || shellCwdByPreset[preset] !== asked) return;
    if (!r) {
      if (shellCwdByPreset[preset] === "") {
        // Even the default dir failed (e.g. passkey cancelled): clear the
        // previous preset's options rather than leave them looking current.
        shellCwdCrumbEl.textContent = "";
        shellCwdUpBtn.disabled = true;
        shellCwdChildEl.innerHTML = "";
        const fail = document.createElement("option");
        fail.value = "";
        fail.textContent = t("(一覧を取得できません)");
        shellCwdChildEl.appendChild(fail);
        shellCwdChildEl.disabled = true;
        return;
      }
      shellCwdByPreset[preset] = "";
      return refreshShellCwdWorkdirs();
    }
    shellCwdByPreset[preset] = r.dir;
    shellCwdCrumbEl.textContent = scope === "sandhome" ? (r.dir ? `sandhome/${r.dir}` : "sandhome") : r.dir;
    shellCwdUpBtn.disabled = scope === "sandhome" ? !r.dir : r.dir === "/";

    shellCwdChildEl.innerHTML = "";
    const head = document.createElement("option");
    head.value = "";
    head.textContent = r.subdirs.length ? t("サブフォルダを開く…") : t("(サブフォルダなし)");
    shellCwdChildEl.appendChild(head);
    shellCwdChildEl.disabled = !r.subdirs.length;
    for (const name of r.subdirs) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      shellCwdChildEl.appendChild(opt);
    }
  }

  async function navigateShellCwdTo(rel) {
    shellCwdByPreset[presetEl.value] = rel;
    await refreshShellCwdWorkdirs();
  }

  shellCwdChildEl.addEventListener("change", () => {
    const name = shellCwdChildEl.value;
    if (!name) return;
    const scope = SHELL_CWD_SCOPE[presetEl.value];
    const cur = shellCwdByPreset[presetEl.value];
    navigateShellCwdTo(
      scope === "sandhome"
        ? (cur ? `${cur}/${name}` : name)
        : (cur === "/" ? `/${name}` : `${cur}/${name}`)
    );
  });

  shellCwdUpBtn.addEventListener("click", () => {
    const scope = SHELL_CWD_SCOPE[presetEl.value];
    const cur = shellCwdByPreset[presetEl.value];
    if (scope === "sandhome") {
      if (!cur) return;
      const cut = cur.lastIndexOf("/");
      navigateShellCwdTo(cut === -1 ? "" : cur.slice(0, cut));
    } else {
      if (!cur || cur === "/") return;
      const cut = cur.lastIndexOf("/");
      navigateShellCwdTo(cut <= 0 ? "/" : cur.slice(0, cut));
    }
  });

  // ＋ on the shell pickers too (2026-10-13, user request): the same
  // new-folder move as #claude-opts' own. "host"/"root" create on the real
  // filesystem, behind the same unlock window the pane itself needs.
  shellCwdNewBtn.addEventListener("click", async () => {
    const preset = presetEl.value;
    const scope = SHELL_CWD_SCOPE[preset];
    if (!scope) return;
    const name = (prompt("新しいフォルダの名前") || "").trim();
    if (!name) return;
    const parent = shellCwdByPreset[preset];
    const post = () => api("/workdirs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, dir: parent, name }),
    });
    const r = await (scope === "sandhome" ? post() : withUnlockRetry(post)).catch((e) => ({ error: e.message }));
    if (r.error) return alert(t("フォルダを作れませんでした: {err}", { err: r.error }));
    if (presetEl.value === preset && shellCwdByPreset[preset] === parent) navigateShellCwdTo(r.dir);
  });

  // Shared option-building behind refreshConversations (local) and
  // refreshSshConversations (a drives-capable ssh machine,
  // the deployment notes) -- both fetch the same {id, mtime, aigw_label, summary} shape
  // from GET /claude-conversations, just against a different cwd/machine.
  function populateConversationSelect(selectEl, conversations) {
    selectEl.innerHTML = "";
    const fresh = document.createElement("option");
    fresh.value = "";
    fresh.textContent = t("新規");
    selectEl.appendChild(fresh);
    for (const c of conversations) {
      const opt = document.createElement("option");
      opt.value = c.id;
      const when = fmtDateTime(c.mtime);
      const rest = c.summary ? c.summary : `(${c.id.slice(0, 8)})`;
      // c.aigw_label is the name *this app* gave the
      // session that last used this conversation, if any -- shown ahead of
      // Claude Code's own auto-generated summary since it's what the user
      // actually chose to call it (2026-08-29, at the user's request).
      opt.textContent = c.aigw_label ? `${when} [${c.aigw_label}] ${rest}` : `${when} ${rest}`;
      // Read back by wireResumeLabelPrefill below -- aigw-backend's own
      // create_session() already falls back to this same label server-side
      // when the field is left blank, so this prefill is purely so the name
      // is visible/editable *before* tapping 開始, not what actually makes
      // it carry over (the deployment notes, 2026-09-24).
      if (c.aigw_label) opt.dataset.aigwLabel = c.aigw_label;
      // ssh list only (the deployment notes): how an aigw session last ran this
      // conversation, read back by the 🐚/🪟 restore below.
      if (typeof c.aigw_desktop === "boolean") opt.dataset.desktop = c.aigw_desktop ? "1" : "0";
      selectEl.appendChild(opt);
    }
  }

  // Conversations are per-directory (Claude Code files them under the cwd
  // they ran in), so this reruns on every navigation.
  async function refreshConversations(interactive = true) {
    const cwd = currentCwd;
    const scope = cwdScope;
    const fetchIt = () => api(`/claude-conversations?scope=${scope}&cwd=${encodeURIComponent(cwd)}`);
    const { conversations } = await (scope === "mail" && interactive ? withUnlockRetry(fetchIt) : fetchIt())
      .catch(() => ({ conversations: [] }));
    // A slow directory read could land after the user has already picked
    // another directory; that answer belongs to the old one, so drop it.
    if (currentCwd !== cwd || cwdScope !== scope) return;
    populateConversationSelect(resumeEl, conversations);
  }

  // ssh: counterpart of refreshConversations, for a drives-capable ssh
  // machine's own Claude preset (the deployment notes). currentSshCwd ===
  // "" means no drive/folder has been chosen yet -- list_ssh_claude_
  // conversations has no fixed directory to fall back to there (unlike
  // ~/sandhome locally), so this just shows "新規" with nothing else,
  // same as passing an empty `dir` to GET /claude-conversations does
  // server-side.
  async function refreshSshConversations() {
    const machine = currentMachine;
    const cwd = currentSshCwd;
    if (!cwd) {
      populateConversationSelect(sshResumeEl, []);
      return;
    }
    const { conversations } = await api(
      `/claude-conversations?machine=${encodeURIComponent(machine)}&dir=${encodeURIComponent(cwd)}`
    ).catch(() => ({ conversations: [] }));
    // Same "a later navigation already won" guard as refreshConversations.
    if (machine !== currentMachine || currentSshCwd !== cwd) return;
    populateConversationSelect(sshResumeEl, conversations);
  }

  // Picking a conversation to resume prefills its own past name into the
  // label field, same "carry the name over" request the backend default
  // above already covers -- this just makes the carried-over name visible
  // and still editable before creating, instead of a silent default the
  // user only discovers afterward.
  //
  // lastAutoLabel tracks what this listener itself last wrote, so it can
  // tell "the user typed their own text" (never touched again, even across
  // switching candidates) apart from "still showing whatever we filled in
  // last time" (safe to replace when a *different* candidate is picked --
  // without this, picking conversation A then B would leave A's name
  // behind because the field was no longer literally empty). One closure
  // per select (local/ssh are independent pickers, never shown at once, but
  // switching machine/preset between them should not leak one's state into
  // the other's).
  function wireResumeLabelPrefill(selectEl) {
    let lastAutoLabel = null;
    selectEl.addEventListener("change", () => {
      const labelEl = document.getElementById("label");
      if (labelEl.value !== "" && labelEl.value !== lastAutoLabel) return;
      const wanted = selectEl.selectedOptions[0]?.dataset.aigwLabel || "";
      labelEl.value = wanted;
      lastAutoLabel = wanted || null;
    });
  }
  wireResumeLabelPrefill(resumeEl);
  wireResumeLabelPrefill(sshResumeEl);
  // Picking a conversation to resume also puts the 🐚/🪟 toggle back to how
  // it last ran (2026-10-05, at the user's request) -- only when aigw knows
  // (it ran there before) and this machine has a desktop variant at all.
  // Still just a default: the toggle can be flipped again before 開始.
  sshResumeEl.addEventListener("change", () => {
    const d = sshResumeEl.selectedOptions[0]?.dataset.desktop;
    if (d === undefined || !sshDesktop[currentMachine]) return;
    desktopMode = d === "1";
    updateDesktopToggle();
  });

  presetEl.addEventListener("change", applyPresetOptions);

  // ---- Claude Code auth inside the container -----------------------------
  //
  // `claude auth status`/`logout` are one-shot commands and answer inline.
  // Login is not: it prints a URL and waits for the code, so it opens as an
  // ordinary chat session (POST /claude-auth/login -> the "claude-login"
  // tmux preset) where the soft keyboard and composer already work.

  // scope -> status <span>. The three static rows are here from the start;
  // one more is added per reachable GPU machine by addSshAuthRow() (called
  // from applyCapabilities(), since which machines exist/are reachable is a
  // live backend answer, not a fixed set -- see MACHINE_LABELS).
  const authStatusEls = {
    container: document.getElementById("auth-status"),
    host: document.getElementById("auth-status-host"),
    root: document.getElementById("auth-status-root"),
  };
  const authRefreshBtn = document.getElementById("auth-refresh");
  let authLoginBtns = [...document.querySelectorAll("button.auth-login")];
  let authLogoutBtns = [...document.querySelectorAll("button.auth-logout")];
  // Where each row's buttons act, and what to call it when asking the user
  // to confirm a logout -- "ログアウトしますか" is not a safe question to ask
  // without saying whose session is about to end. ssh:<machine> entries are
  // added by addSshAuthRow().
  const AUTH_SCOPE_LABELS = {
    container: t("sandboxコンテナ内"),
    host: t("このホスト(sandbox外・あなた自身)"),
    root: t("このホストの root"),
  };

  function setChecking(el) {
    el.textContent = t("確認中…");
    el.className = "auth-status-text";
  }

  // Shared by all three rows (container/host/root) -- st is one of
  // GET /claude-auth's per-scope values: null (root only, no root-shell
  // access -- the row is hidden anyway, see applyCapabilities()),
  // {"error": "..."} (the check itself failed), or the loggedIn/email/etc
  // shape `claude auth status --json` returns.
  function renderAuthStatus(el, st) {
    if (st == null) {
      el.textContent = t("権限なし");
      el.className = "auth-status-text";
    } else if (st.error) {
      el.textContent = st.error;
      el.className = "auth-status-text err";
    } else if (st.loggedIn) {
      const detail = [st.authMethod, st.orgName, st.subscriptionType].filter(Boolean).join(" / ");
      el.textContent = `${st.email || t("ログイン済み")}${detail ? ` (${detail})` : ""}`;
      el.className = "auth-status-text in";
    } else {
      el.textContent = t("未ログイン");
      el.className = "auth-status-text out";
    }
  }

  async function refreshAuthStatus() {
    Object.values(authStatusEls).forEach(setChecking);
    const st = await api("/claude-auth").catch((e) => ({ error: e.message }));
    if (st.error) {
      // The request itself failed (network/backend down) -- one shared
      // failure for every row, as opposed to a per-scope st.container/
      // st.host/st.root/st["ssh:..."] error, which only affects that one row.
      Object.values(authStatusEls).forEach((el) => renderAuthStatus(el, st));
      return;
    }
    for (const [scope, el] of Object.entries(authStatusEls)) {
      renderAuthStatus(el, st[scope]);
    }
    // Piggybacked here rather than adding a second call at every one of this
    // function's own call sites (view-auth open, the refresh button, login/
    // logout completing, ...): every one of those moments is exactly when
    // the Codex rows also want a refresh, and codexAuthStatusEls is defined
    // by the time any of them can fire (both blocks run at load, this one
    // first).
    refreshCodexAuthStatus();
  }

  // These commands can take a few seconds; without disabling the whole set, a
  // second tap queues another `sandbox exec` (or another root pane) behind
  // the first. All rows are disabled together because they share one backend.
  async function withAuthButtonsDisabled(fn) {
    const btns = [authRefreshBtn, ...authLoginBtns, ...authLogoutBtns];
    btns.forEach((b) => (b.disabled = true));
    try {
      await fn();
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

  authRefreshBtn.addEventListener("click", () => withAuthButtonsDisabled(refreshAuthStatus));

  // Shared by the three static buttons wired here at load and any dynamic
  // ones addSshAuthRow() creates later -- a button's own class + data-scope
  // is all either needs to know which of /claude-auth/{login,logout} to call
  // and how.
  function wireAuthLogoutButton(btn) {
    const scope = btn.dataset.scope;
    btn.addEventListener("click", () => withAuthButtonsDisabled(async () => {
      if (!confirm(t("{where}のClaude Codeをログアウトします。よろしいですか?", { where: AUTH_SCOPE_LABELS[scope] }))) return;
      const r = await withUnlockRetry(() => api("/claude-auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      })).catch((e) => ({ error: e.message }));
      if (r.error) alert(t("ログアウトに失敗しました: {err}", { err: r.error }));
      await refreshAuthStatus();
    }));
  }

  function wireAuthLoginButton(btn) {
    const scope = btn.dataset.scope;
    btn.addEventListener("click", () => withAuthButtonsDisabled(async () => {
      const meta = await withUnlockRetry(() => api("/claude-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      })).catch((e) => {
        alert(t("ログインを開始できませんでした: {err}", { err: e.message }));
        return null;
      });
      if (!meta) return;
      await refreshSessions();
      sessionOpenedFromAuth = true;
      openSession(meta);
    }));
  }

  for (const btn of authLogoutBtns) wireAuthLogoutButton(btn);
  for (const btn of authLoginBtns) wireAuthLoginButton(btn);

  // One more auth row per reachable GPU machine,
  // built the same shape as the three static rows in index.html rather than
  // hardcoded there, since which machines exist/are reachable is this user's
  // live GET /capabilities answer, not a fixed set. Called from
  // applyCapabilities().
  function addSshAuthRow(machine) {
    const scope = `ssh:${machine}`;
    AUTH_SCOPE_LABELS[scope] = machine;
    const row = document.createElement("div");
    row.className = "auth-row";
    row.innerHTML = `
      <div class="auth-line">
        <span class="auth-label">${escapeHtml(machine)}</span>
        <span class="auth-status-text">${t("確認中…")}</span>
      </div>
      <div class="auth-actions">
        <button class="auth-login" data-scope="${scope}">${t("ログイン")}</button>
        <button class="auth-logout" data-scope="${scope}">${t("ログアウト")}</button>
      </div>`;
    // Under their own "Other hosts" heading, after the Codex group
    // (2026-10-06, at the user's request) -- the heading stays hidden on a
    // host with no reachable ssh machine at all.
    document.getElementById("ssh-auth-rows").appendChild(row);
    document.getElementById("ssh-auth-heading").hidden = false;
    authStatusEls[scope] = row.querySelector(".auth-status-text");
    const loginBtn = row.querySelector("button.auth-login");
    const logoutBtn = row.querySelector("button.auth-logout");
    wireAuthLoginButton(loginBtn);
    wireAuthLogoutButton(logoutBtn);
    authLoginBtns = [...authLoginBtns, loginBtn];
    authLogoutBtns = [...authLogoutBtns, logoutBtn];
  }

  // ---- Codex CLI auth (the deployment notes) ------------------------------------
  //
  // Same shape as the Claude Code auth block just above, deliberately kept
  // as its own separate set of elements/functions rather than generalizing
  // both tools through one parameterized implementation: this whole file's
  // existing pattern is one named thing per concept (CLAUDE_TUI_PRESETS vs
  // SSH_SHELL_PRESETS, etc.), not silent parameter-driven reuse, and Codex
  // has no ssh:<machine> rows or richer status fields to abstract over
  // anyway. `codex login status`/`codex logout` have no --json form, so the
  // status shape is just {loggedIn, text} (or {error}) -- see
  // codex_auth_status_all's own comment.
  const codexAuthStatusEls = {
    container: document.getElementById("codex-auth-status"),
    host: document.getElementById("codex-auth-status-host"),
    root: document.getElementById("codex-auth-status-root"),
  };
  let codexAuthLoginBtns = [...document.querySelectorAll("button.codex-auth-login")];
  let codexAuthLogoutBtns = [...document.querySelectorAll("button.codex-auth-logout")];
  const CODEX_AUTH_SCOPE_LABELS = {
    container: t("sandboxコンテナ内"),
    host: t("このホスト(sandbox外・あなた自身)"),
    root: t("このホストの root"),
  };

  function renderCodexAuthStatus(el, st) {
    if (st == null) {
      el.textContent = t("権限なし");
      el.className = "auth-status-text";
    } else if (st.error) {
      el.textContent = st.error;
      el.className = "auth-status-text err";
    } else if (st.loggedIn) {
      el.textContent = st.text || t("ログイン済み");
      el.className = "auth-status-text in";
    } else {
      el.textContent = st.text || t("未ログイン");
      el.className = "auth-status-text out";
    }
  }

  async function refreshCodexAuthStatus() {
    Object.values(codexAuthStatusEls).forEach(setChecking);
    const st = await api("/codex-auth").catch((e) => ({ error: e.message }));
    if (st.error) {
      Object.values(codexAuthStatusEls).forEach((el) => renderCodexAuthStatus(el, st));
      return;
    }
    for (const [scope, el] of Object.entries(codexAuthStatusEls)) {
      renderCodexAuthStatus(el, st[scope]);
    }
  }

  async function withCodexAuthButtonsDisabled(fn) {
    const btns = [...codexAuthLoginBtns, ...codexAuthLogoutBtns];
    btns.forEach((b) => (b.disabled = true));
    try {
      await fn();
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

  function wireCodexAuthLogoutButton(btn) {
    const scope = btn.dataset.scope;
    btn.addEventListener("click", () => withCodexAuthButtonsDisabled(async () => {
      if (!confirm(t("{where}のCodexをログアウトします。よろしいですか?", { where: CODEX_AUTH_SCOPE_LABELS[scope] }))) return;
      const r = await withUnlockRetry(() => api("/codex-auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      })).catch((e) => ({ error: e.message }));
      if (r.error) alert(t("ログアウトに失敗しました: {err}", { err: r.error }));
      await refreshCodexAuthStatus();
    }));
  }

  function wireCodexAuthLoginButton(btn) {
    const scope = btn.dataset.scope;
    btn.addEventListener("click", () => withCodexAuthButtonsDisabled(async () => {
      const meta = await withUnlockRetry(() => api("/codex-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      })).catch((e) => {
        alert(t("ログインを開始できませんでした: {err}", { err: e.message }));
        return null;
      });
      if (!meta) return;
      await refreshSessions();
      sessionOpenedFromAuth = true;
      openSession(meta);
    }));
  }

  for (const btn of codexAuthLogoutBtns) wireCodexAuthLogoutButton(btn);
  for (const btn of codexAuthLoginBtns) wireCodexAuthLoginButton(btn);

  // ---- Kill Chrome (the deployment notes cleanup) ------------------------
  //
  // Left running, each user's chrome-debug@<user>.service is only reaped
  // automatically after 30 minutes idle -- this is the manual, immediate
  // alternative for when the host is visibly heavier for it in the meantime.
  // "全員" (POST /chrome/kill {scope:"all"}) is only ever shown to root-shell
  // users (applyCapabilities()); the backend enforces the same gate
  // independently (kill_all_chrome), so hiding it here is convenience, not
  // the security boundary, same spirit as the "root-shell" preset option.
  const chromeKillStatusEl = document.getElementById("chrome-kill-status");
  const chromeKillOwnBtn = document.getElementById("chrome-kill-own-btn");
  const chromeKillAllBtn = document.getElementById("chrome-kill-all-btn");

  async function killChrome(scope, confirmMsg) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const btns = [chromeKillOwnBtn, chromeKillAllBtn];
    btns.forEach((b) => (b.disabled = true));
    chromeKillStatusEl.textContent = t("実行中…");
    chromeKillStatusEl.className = "auth-status-text";
    try {
      // Only ever relevant for scope "all" (root pane) -- "self" never hits
      // aigw-backend's gate at all, so withUnlockRetry is simply a no-op
      // pass-through for it.
      await withUnlockRetry(() => api("/chrome/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      }));
      chromeKillStatusEl.textContent = t("停止しました");
      chromeKillStatusEl.className = "auth-status-text in";
    } catch (e) {
      chromeKillStatusEl.textContent = e.message;
      chromeKillStatusEl.className = "auth-status-text err";
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

  chromeKillOwnBtn.addEventListener("click", () => killChrome("self"));
  chromeKillAllBtn.addEventListener("click", () =>
    killChrome("all", t("全ユーザーのheadful ChromeをKillします。よろしいですか?")));

  // The phone's own keyboard already sends any literal character via the
  // text box -- what it can't produce at all is terminal control input:
  // Ctrl/Alt+<anything>, and named keys with no on-screen equivalent (Esc,
  // arrows, Shift-Tab, ...). Ctrl/Alt are *sticky* toggles (tap Ctrl, then
  // tap a key, like Termux/Blink's extra-keys row) rather than requiring a
  // simultaneous multi-touch chord, which doesn't work reliably on a phone.
  // Only relevant for tmux-based presets (a real terminal) -- headless
  // presets' request/response turns have no notion of "keys".
  // Labels shortened 2026-09-08 at the user's request (⇧ PgU PgD 🏡 ⏎ Spc) --
  // this row already competes with GRID_KEYS/the attach button for width on
  // a phone screen, and abbreviations/glyphs read just as well at a glance.
  const NAMED_KEYS = [
    ["↑", "Up"], ["↓", "Down"], ["←", "Left"], ["→", "Right"],
    ["🏡", "Home"], ["End", "End"], ["PgU", "PageUp"], ["PgD", "PageDown"],
    ["Tab", "Tab"], ["⇧Tab", "BTab"], ["Esc", "Escape"], ["⏎", "Enter"],
    ["⌫", "BSpace"], ["Del", "DC"], ["Ins", "IC"], ["Spc", "Space"],
  ];
  const GRID_KEYS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");

  let armCtrl = false;
  let armAlt = false;
  let armShift = false;

  const MODIFIERS = [
    ["Ctrl", () => armCtrl, (v) => (armCtrl = v)],
    ["⇧", () => armShift, (v) => (armShift = v)],
    ["Alt", () => armAlt, (v) => (armAlt = v)],
  ];

  function buildKeyToolbar() {
    modRowEl.innerHTML = "";
    gridEl.innerHTML = "";

    for (const [label, get, set] of MODIFIERS) {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.className = "mod";
      btn.dataset.mod = label;
      btn.addEventListener("click", () => {
        set(!get());
        updateModButtons();
      });
      modRowEl.appendChild(btn);
    }
    for (const [label, key] of NAMED_KEYS) {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.addEventListener("click", () => sendKey(key));
      modRowEl.appendChild(btn);
    }

    // Image attach (2026-09-08, at the user's request: pinned at the far
    // right of this row). Deliberately only here, not in #composer -- this
    // whole toolbar is already hidden for the headless "claude" preset
    // (buildKeyToolbar is never even reached for it, see hasPane below), so
    // this button is tmux-preset-only by the same rule everything else in
    // this row already follows; a headless chat can still attach an image
    // by pasting one directly into the composer (see the "paste" listener
    // on textEl further down).
    const attachBtn = document.createElement("button");
    attachBtn.textContent = "📎";
    attachBtn.title = t("ファイルを添付");
    attachBtn.addEventListener("click", () => attachFileInputEl.click());
    modRowEl.appendChild(attachBtn);

    for (const k of GRID_KEYS) {
      const btn = document.createElement("button");
      btn.textContent = k; // deliberately lowercase as displayed -- shift is
      // a separate explicit modifier now (Ctrl+Shift+a vs Ctrl+a must be
      // distinguishable), not implied by how the key label looks.
      btn.addEventListener("click", () => sendKey(k));
      gridEl.appendChild(btn);
    }
    updateModButtons();
  }

  function updateModButtons() {
    for (const [label, get] of MODIFIERS) {
      modRowEl.querySelector(`button[data-mod="${label}"]`).classList.toggle("active", get());
    }
    gridEl.classList.toggle("visible", armCtrl || armAlt || armShift);
  }

  async function sendKey(key) {
    if (!currentSessionId) return;
    const ctrl = armCtrl;
    const alt = armAlt;
    const shift = armShift;
    armCtrl = false;
    armAlt = false;
    armShift = false;
    updateModButtons();
    await withUnlockRetry(() => api(sessionPath(currentSessionId, "/keys", currentOwner), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, ctrl, alt, shift }),
    })).catch((e) => console.warn("key send failed:", e));
  }

  // On failure, surfaces the backend's own {"error": "..."} message (e.g.
  // create_session's "failed to start tmux session: ...") rather than just
  // the bare HTTP status -- callers that alert(e.message) would otherwise
  // show a bare "400" with no indication of what actually went wrong.
  //
  // aigw-backend's require_unlock_if_outside_
  // sandbox() gate answers every denial as 403 {"error": "...",
  // "unlock_required": true, "tier": "host"|"root"} (see aigw-backend's
  // UnlockRequired / Handler._unlock_required). unlock_required is copied
  // onto the thrown Error as e.unlockRequired so withUnlockRetry() below
  // can tell "this needs a passkey" apart from any other 403 (e.g.
  // sharing's "sharing does not include this", which must NOT pop a
  // WebAuthn prompt) using something more specific than the bare HTTP
  // status. "tier" is copied alongside it as
  // e.unlockTier, so ensureUnlocked() knows which tier to ask
  // aigw-unlockd's begin-assertion for instead of guessing.
  function api(path, opts) {
    return fetch(`/agents/api${path}`, opts).then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        const err = new Error(body && body.error ? body.error : `${r.status}`);
        if (body && body.unlock_required) {
          err.unlockRequired = true;
          err.unlockTier = body.tier;
        }
        if (body && body.running_session) err.runningSession = body.running_session;
        throw err;
      }
      return r.json();
    });
  }

  // ---- Passkey unlock (the design notes, the design notes, the design notes) ------------
  //
  // host/root actions (a host-shell/root-shell session, sending into one,
  // Claude-auth login/logout at scope host/root, "全員" Kill Chrome) are
  // gated behind a 15-minute passkey-authenticated window that aigw-unlockd
  // (root) owns. aigw-backend only relays the WebAuthn ceremony over
  // /unlock/* and never itself decides whether an assertion is valid (see
  // aigw-backend's _unlockd_call/require_unlock_if_outside_sandbox) -- so
  // neither does this file: every response from those routes is examined
  // only for its own "ok" field, never trusted beyond that.

  // WebAuthn's binary fields (challenge, credential ids, signatures, ...)
  // travel over JSON as base64url text (fido2's own `dict(options)`
  // encoding), but navigator.
  // credentials.{create,get}() need real ArrayBuffers, and their result
  // needs to go back the other way. Both conversions are notoriously easy
  // to get subtly wrong (padding, +/ vs -_, sign confusion between which
  // direction is "url" and which is "standard") -- silent WebAuthn failures
  // trace back to exactly this more often than to anything cryptographic.
  function b64urlToBuf(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const base64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf.buffer;
  }

  function bufToB64url(buf) {
    const bytes = new Uint8Array(buf);
    let str = "";
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // begin-assertion's wire "options" -> PublicKeyCredentialRequestOptions.
  // Only `challenge` and each allowCredentials[].id are binary; everything
  // else (rpId, userVerification, timeout, ...) is already the right JS
  // shape (fido2's dict() uses the same camelCase field names the Web
  // Authentication API does) and is spread through unchanged.
  //
  // NOTE the unwrap below: fido2 2.2.1's authenticate_begin() returns a
  // *CredentialRequestOptions*, so dict() of it is the outer
  // {"publicKey": {...}} wrapper, NOT the inner
  // PublicKeyCredentialRequestOptions. Unwrapping here (rather than at the
  // call site) keeps `credentials.get({publicKey: requestOptionsFromWire(
  // ...)})` from double-wrapping it. Getting this wrong stays silent until
  // b64urlToBuf(undefined) reaches atob and throws "Cannot read properties
  // of undefined (reading 'length')" -- which is what the registration side
  // of this same pair actually hit on the first real attempt (2026-08-30).
  // The `|| wire` fallback keeps this working if some future fido2 hands
  // back the inner object instead.
  function requestOptionsFromWire(wire) {
    const o = wire.publicKey || wire;
    return {
      ...o,
      challenge: b64urlToBuf(o.challenge),
      allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: b64urlToBuf(c.id) })),
    };
  }

  // The reverse direction: a PublicKeyCredential (assertion) -> the JSON
  // shape aigw-unlockd's fido2 2.2.1 AuthenticationResponse.from_dict()
  // expects, which is WebAuthn L3's own PublicKeyCredential.toJSON() shape
  // (aigw-unlockd's finish-assertion parsing was built
  // against exactly that shape). Preferring the browser's own .toJSON() when it
  // exists means this never has to guess at a field this browser adds later
  // (extension outputs, authenticatorAttachment); the manual fallback below
  // is only for a browser old enough not to have it yet (Safari added it
  // late).
  function credentialToJSON(cred) {
    if (typeof cred.toJSON === "function") return cred.toJSON();
    const r = cred.response;
    return {
      id: cred.id,
      rawId: bufToB64url(cred.rawId),
      type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment || undefined,
      response: {
        clientDataJSON: bufToB64url(r.clientDataJSON),
        authenticatorData: bufToB64url(r.authenticatorData),
        signature: bufToB64url(r.signature),
        userHandle: r.userHandle ? bufToB64url(r.userHandle) : undefined,
      },
      clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
    };
  }

  // Runs the WebAuthn assertion ceremony end to end: ask aigw-backend (which
  // asks aigw-unlockd) for a challenge, ask the platform authenticator for a
  // signature, hand that back for verification. Throws a user-showable
  // Error on any failure -- an unsupported browser, no registered
  // credential, a cancelled/failed biometric prompt, or a rejected
  // assertion (bad origin/RP ID/UV/signCount, all checked server-side only
  // -- see aigw-unlockd's verb_finish_assertion).
  //
  // `tier` ("for root, root-tier credentials
  // only; for host, all of them") is passed straight through to
  // begin-assertion, unexamined -- this file does not decide which
  // credentials are eligible for which tier, aigw-unlockd does, both when
  // building allowCredentials (so the right key gets prompted for) and
  // again, authoritatively, when verifying the assertion (see that
  // program's own module docstring for why the second check is the one
  // that actually matters). Defaults to "root" when no caller supplies one
  // (e.g. a future direct call to this function): asking for the stronger
  // tier when unsure is the fail-closed choice, matching aigw-backend's own
  // _tier_for_location() default for an unrecognized location.
  // navigator.credentials.get()/create() only ever allow ONE outstanding
  // call per browsing context -- a second call while the first is still
  // pending throws "OperationError: A request is already pending" instead
  // of anything user-showable. Reported live 2026-09-17: the unlock
  // banner's own click handler already disables its button while in
  // flight, but nothing stopped a *different* concurrent caller (e.g.
  // withUnlockRetry() reacting to some other action's 403 at the same
  // moment) from starting a second ceremony. _unlockInFlight tracks the
  // one actually running so a second caller piggybacks on it instead of
  // racing it -- unless that one is host-tier and this caller needs root
  // (host-tier succeeding would not actually satisfy a root request), in
  // which case this waits for it to settle first, then runs its own.
  let _unlockInFlight = null; // {tier, promise} | null

  async function ensureUnlocked(tier) {
    tier = tier === "host" ? "host" : "root";
    if (_unlockInFlight) {
      if (_unlockInFlight.tier === "root" || _unlockInFlight.tier === tier) {
        return _unlockInFlight.promise;
      }
      try {
        await _unlockInFlight.promise;
      } catch (e) {
        // Its own caller already surfaces this failure; this caller still
        // needs root, so fall through and try its own ceremony below.
      }
    }
    const promise = (async () => {
      if (!window.PublicKeyCredential) {
        throw new Error(t("このブラウザはパスキー(WebAuthn)に対応していません"));
      }
      const begin = await api("/unlock/begin-assertion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!begin.ok) throw new Error(begin.error || t("認証を開始できませんでした"));
      let cred;
      try {
        cred = await navigator.credentials.get({ publicKey: requestOptionsFromWire(begin.options) });
      } catch (e) {
        throw new Error(t("生体認証がキャンセルまたは失敗しました: {err}", { err: e.message }));
      }
      const finish = await api("/unlock/finish-assertion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialToJSON(cred) }),
      });
      if (!finish.ok) throw new Error(finish.error || t("認証に失敗しました"));
      updateUnlockBadge({ unlocked: true, expires_at: finish.expires_at, tier: finish.tier });
      return finish.expires_at;
    })();
    _unlockInFlight = { tier, promise };
    try {
      return await promise;
    } finally {
      if (_unlockInFlight && _unlockInFlight.promise === promise) _unlockInFlight = null;
    }
  }

  // Wraps any api() call that might hit aigw-backend's require_unlock_if_
  // outside_sandbox() gate: on a 403 carrying unlock_required, runs the
  // passkey ceremony -- for the tier the 403 itself named (e.unlockTier,
  // see api()'s own comment) -- and retries the
  // *same* action exactly once. Any other failure (including a second
  // unlock_required -- shouldn't happen right after a fresh unlock, but not
  // specially looped on if it does) is rethrown to the caller exactly as if
  // this wrapper weren't there.
  async function withUnlockRetry(fn) {
    try {
      return await fn();
    } catch (e) {
      if (!e.unlockRequired) throw e;
      await ensureUnlocked(e.unlockTier);
      return await fn();
    }
  }

  // ---- persistent "unlocked" indicator ------------------------------------
  //
  // Built entirely here rather than in index.html: this task's working copy
  // is app.js alone, so the badge/lock control is a plain DOM node created
  // and appended at load time instead of a pre-existing element looked up
  // by id, the same way e.g. addSshAuthRow()'s rows are built. Appended
  // into #top-header specifically because that element is already shown on
  // the session list and hidden in the full-screen chat view as a matched
  // pair (see the topHeaderEl.style.display toggles in openSession/
  // closeSession) -- this rides along with that existing visibility
  // instead of needing its own.
  const unlockBadgeEl = document.createElement("button");
  unlockBadgeEl.type = "button";
  unlockBadgeEl.hidden = true;
  // font-size is up from the 0.75rem this used while it rendered a text
  // countdown: the label is now a single glyph, and it is also the tap
  // target for locking, so it needs to stay comfortably tappable on a
  // phone rather than shrinking to the size of the text it replaced.
  unlockBadgeEl.style.cssText =
    "margin-left: 8px; padding: 1px 8px; border-radius: 999px; border: 1px solid #b45309; " +
    "background: #fffbeb; color: #92400e; font-size: 0.95rem; line-height: 1.4; " +
    "white-space: nowrap; cursor: pointer;";
  topHeaderEl.appendChild(unlockBadgeEl);

  let unlockExpiresAt = null; // epoch seconds while unlocked, else null
  let unlockTier = null; // "host"/"root" while unlocked, else null
  let pendingUnlockTier = null; // tier #unlock-notice-btn should ask for, set by updateUnlockNotice()

  // 2026-09-11, at the user's request (see #unlock-notice's own comment in
  // index.html for the full story): reading a session's history/live events
  // was never gated on the unlock window (aigw-backend's
  // require_unlock_if_outside_sandbox is only in the write-side action
  // list), so a host/root session whose window closed just went quiet with
  // no explanation -- the small header badge disappearing was the only
  // sign, easy to miss, and nothing ever prompted a re-unlock. This runs
  // from the same places updateUnlockBadge() already runs (the 5s poll, and
  // immediately after a fresh unlock) so the banner and the badge are
  // always in sync with each other and appear/disappear together.
  function updateUnlockNotice() {
    const location = currentSessionMeta && currentSessionMeta.tmux_location;
    const tier = location === "root" ? "root" : location === "host" ? "host" : null;
    // No tier needed (container/ssh:/no session open), or the session has
    // already ended -- nothing further can arrive for it either way, so a
    // closed window has nothing to catch up on.
    // A read-only share needs no window (the deployment notes).
    if (!tier || !currentSessionMeta.alive || currentShareMode === "read") {
      unlockNoticeEl.hidden = true;
      return;
    }
    const satisfied = tier === "root" ? unlockTier === "root" : !!unlockTier;
    pendingUnlockTier = tier;
    unlockNoticeEl.hidden = satisfied;
  }

  unlockNoticeBtnEl.addEventListener("click", async () => {
    unlockNoticeBtnEl.disabled = true;
    try {
      await ensureUnlocked(pendingUnlockTier || "root");
      // ensureUnlocked() already calls updateUnlockBadge() -> updateUnlockNotice()
      // on success, so the banner hides itself; nothing further to do here.
    } catch (e) {
      alert(e.message);
    } finally {
      unlockNoticeBtnEl.disabled = false;
    }
  });

  function renderUnlockBadge() {
    if (unlockExpiresAt == null) {
      unlockBadgeEl.hidden = true;
      return;
    }
    unlockBadgeEl.hidden = false;
    // Icon only (2026-08-31, at the user's request). The remaining-time
    // countdown this used to render stopped carrying information once
    // _sweeper() began auto-extending every open window:
    // a window that is open at all is simply pushed
    // back to the full UNLOCK_TTL on every 5s sweep, so the number sat at
    // ~15:00 and only ever moved in the last moments before the 2-hour
    // absolute cap. What still matters -- and all this badge now says --
    // is the binary "a window is open, tap to close it".
    //
    // The tier is now the icon itself (2026-08-31, follow-up to the
    // icon-only change above), not just the tooltip: a host-tier window
    // does NOT authorise root, and that distinction is
    // exactly the kind of thing a glance at the header should convey
    // without requiring a tap or a hover a touchscreen doesn't have.
    // 🔓 (open padlock) for root -- the strongest tier, authorises host
    // too. 🔑 (key) for host-only -- open, but not the same as 🔓.
    const label = unlockTier === "root" ? "root/host" : "host";
    unlockBadgeEl.title = t("{label} がアンロック中。タップでロック(今すぐ解除)", { label });
    unlockBadgeEl.textContent = unlockTier === "root" ? "🔓" : "🔑";
  }

  // status is either GET /unlock/status's own reply ({"ok", "unlocked",
  // "expires_at", "tier"}) or null/anything falsy -- both "ok:false"
  // (locked, or aigw-unlockd unreachable) and "no answer at all" render the
  // same way: no badge. Called both by the poll below and by
  // ensureUnlocked() right after a fresh unlock, so the badge appears
  // immediately rather than waiting for the next 5s tick.
  function updateUnlockBadge(status) {
    unlockExpiresAt = status && status.unlocked ? status.expires_at : null;
    unlockTier = status && status.unlocked ? status.tier : null;
    renderUnlockBadge();
    updateUnlockNotice();
  }

  // GET, and always the read-only `status` verb all the way down to
  // aigw-unlockd -- never `touch` -- so that this badge's own polling can
  // never be the thing keeping a window open (a persistent *display* of the
  // remaining time is wanted, not an extension every time someone looks at it).
  async function pollUnlockStatus() {
    const r = await api("/unlock/status").catch(() => null);
    updateUnlockBadge(r && r.ok ? r : null);
  }

  unlockBadgeEl.addEventListener("click", async () => {
    if (!confirm(t("root/hostのアンロックを今すぐ解除しますか?"))) return;
    await api("/unlock/lock", { method: "POST" }).catch(() => {});
    await pollUnlockStatus();
  });

  function initUnlockUI() {
    pollUnlockStatus();
    // 5s: frequent enough that the badge disappears promptly when the
    // window closes from elsewhere (another tab, `aigw-passkey lock`, the
    // absolute cap), cheap enough to run forever while locked -- `status` is one local
    // Unix-socket round trip inside aigw-backend, no WebAuthn or network of
    // its own involved.
    setInterval(pollUnlockStatus, 5000);
    // No second, faster timer any more: with the countdown gone (see
    // renderUnlockBadge) there is nothing to tick between polls -- the
    // badge only ever changes when the window itself opens or closes, and
    // this poll is what learns that.
  }

  // /sessions/<id><suffix> for one's own session, or
  // /shared/<owner>/sessions/<id><suffix> when viewing someone else's --
  // every per-session call goes through one of these two so opening a
  // shared session doesn't need its own copy of each action.
  function sessionPath(sessionId, suffix, owner) {
    return owner
      ? `/shared/${encodeURIComponent(owner)}/sessions/${sessionId}${suffix}`
      : `/sessions/${sessionId}${suffix}`;
  }

  function sessionApiUrl(sessionId, suffix, owner) {
    return `/agents/api${sessionPath(sessionId, suffix, owner)}`;
  }

  function fmtTime(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Resumable conversations can be weeks old, so unlike fmtTime the date
  // matters -- it's often the only thing distinguishing two of them.
  function fmtDateTime(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  // Auto-scroll only while the reader is already at (or near) the bottom
  // (2026-10-05, at the user's request: "新着があると自動で一番下にスクロール
  // してしまうのが不便"). Scrolled up to read something, new output no longer
  // yanks the view down -- the "↓ 新着" button appears instead and takes
  // them there on tap. Must be read BEFORE appending, since the append
  // itself changes scrollHeight.
  const NEAR_BOTTOM_PX = 80;
  const newMsgBtnEl = document.getElementById("new-msg-btn");
  function chatNearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < NEAR_BOTTOM_PX;
  }
  function scrollChatToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
    newMsgBtnEl.classList.remove("visible");
  }
  // follow: chatNearBottom() as measured before the append.
  function afterChatAppend(follow) {
    if (follow) scrollChatToBottom();
    else newMsgBtnEl.classList.add("visible");
  }
  newMsgBtnEl.addEventListener("click", scrollChatToBottom);
  messagesEl.addEventListener("scroll", () => {
    if (chatNearBottom()) newMsgBtnEl.classList.remove("visible");
  });

  // Read-aloud of new AI replies (2026-10-25, at the user's request:
  // "Chatの新しいメッセージだけを読み上げる"). Uses the browser's own
  // speechSynthesis, i.e. the phone's/PC's TTS voice -- nothing server-side.
  // Only agent_output events that arrive over the live SSE stream are read
  // (see connectSessionEvents), never the history page or older history. In
  // AI presets every agent_output is a reply; in a shell session most are the
  // pane's raw output, so only those marked "ai" (from the transcript of a
  // `claude` run in it, _assistant_block_events in aigw-backend) are read.
  // On/off is per browser (localStorage), not per session. Chrome refuses
  // speak() until the page has had a user gesture, so after a reload the
  // first tap anywhere primes it with a silent utterance.
  const SPEAK_KEY = "aigw-speak";
  const speakBtn = document.getElementById("audio-btn");
  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
  let speakOn = false;
  try { speakOn = canSpeak && localStorage.getItem(SPEAK_KEY) === "1"; } catch (e) {}
  const isSpeakPreset = (p) => p === "claude" || p === "mail-tui" || /^(claude|codex)-tui(-|$)/.test(String(p || ""));
  const isShellPreset = (p) => /^(shell|host-shell|root-shell|attach)$|^shell-/.test(String(p || ""));
  const speakable = (p, ev) => ev.type === "agent_output" && (isSpeakPreset(p) || (isShellPreset(p) && ev.ai === true));
  const SPEECH_LANG = { ja: "ja-JP", en: "en-US", "zh-CN": "zh-CN" };
  function speechText(md) {
    return String(md || "")
      .replace(/```[\s\S]*?(```|$)/g, "\n" + t("(コード省略)") + "\n")
      .replace(/`([^`\n]*)`/g, "$1")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, t("リンク"))
      .replace(/^[ \t]*\|?[ \t:|-]*-{3,}[ \t:|-]*$/gm, "")
      .replace(/^[ \t]*\|(.*?)\|?[ \t]*$/gm, "$1")
      .replace(/[ \t]*\|[ \t]*/g, "、")
      .replace(/^[ \t]*(#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, "")
      // Arrows and > between words (a menu path, "A → B") are a pause, not
      // 「大なり」 (2026-11-11, the user: the reading went odd, maybe at >).
      .replace(/[ \t]*(?:-+>|=+>|→|⇒|>+(?!=))[ \t]*/g, "、")
      .replace(/[ \t]*(?:<-+|←|⇐)[ \t]*/g, "、")
      .replace(/[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, "$1")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }
  // Long single utterances stall in Chrome (desktop ~15s, Android ~4000
  // chars), so speak sentence-sized pieces; speechSynthesis queues them.
  function speechChunks(text) {
    const out = [];
    for (const part of text.split(/(?<=[。！？!?\n])|(?<=[.] )/)) {
      let p = part.trim();
      while (p.length > 200) { out.push(p.slice(0, 200)); p = p.slice(200); }
      if (p) out.push(p);
    }
    return out;
  }
  // Speed and voice (2026-10-25, at the user's request): the OS's own speech
  // rate setting does not reach Chrome, which passes every utterance's rate
  // itself. Set from a long-press popup on 🔊 (no room for more buttons in
  // the header). The keys are shared with the read-aloud of the Email box's
  // own pages, which are on this same origin.
  const SPEAK_RATE_KEY = "aigw-speak-rate";
  const SPEAK_VOICE_KEY = "aigw-speak-voice";
  const SPEAK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
  function speakPref(key) {
    try { return localStorage.getItem(key) || ""; } catch (e) { return ""; }
  }
  function speechLang() {
    return SPEECH_LANG[window.aigwI18n ? window.aigwI18n.lang() : "ja"] || "ja-JP";
  }
  // Per-language speed and voice (2026-11-02, the user: "Japanese is slow
  // and English fast -- can each language have its own speed?"). The plain
  // keys are the display language's; the other language read aloud (English,
  // or Japanese when the display is English) has "-<xx>" keys, falling back
  // to the plain speed when unset.
  function otherSpeechLang() {
    return speechLang().startsWith("en") ? "ja-JP" : "en-US";
  }
  function speakKeys(lang) {
    if (lang.slice(0, 2) === speechLang().slice(0, 2)) return [SPEAK_RATE_KEY, SPEAK_VOICE_KEY];
    const x = lang.slice(0, 2);
    return [`${SPEAK_RATE_KEY}-${x}`, `${SPEAK_VOICE_KEY}-${x}`];
  }
  function speechVoices(lang) {
    const prefix = (lang || speechLang()).slice(0, 2).toLowerCase();
    return speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(prefix));
  }
  // English in English (2026-11-02, at the user's request): a piece with
  // no Japanese in it but with Latin letters is read by an English voice;
  // one with any kana/kanji by a Japanese voice. A Japanese sentence with a
  // few English words stays Japanese. The chosen voice (long-press 🔊) is
  // used for pieces in its own language.
  const JA_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
  function pieceLang(text) {
    if (JA_RE.test(text)) return "ja-JP";
    if (/[A-Za-z]{2,}/.test(text)) return "en-US";
    return speechLang();
  }
  function bestVoice(lang) {
    const p = lang.slice(0, 2).toLowerCase();
    const vs = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(p));
    const exact = vs.filter((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
    // Google first (2026-11-03, the user: Windows' Microsoft voices were
    // worse than Google's), then the device default.
    return exact.find((v) => /Google/.test(v.name)) || vs.find((v) => /Google/.test(v.name)) || vs.find((v) => v.default) || exact[0] || vs[0] || null;
  }
  function utterance(text) {
    const u = new SpeechSynthesisUtterance(text);
    const lang = pieceLang(text);
    u.lang = lang;
    const [rateKey, voiceKey] = speakKeys(lang);
    u.rate = Number(speakPref(rateKey)) || Number(speakPref(SPEAK_RATE_KEY)) || 1;
    const name = speakPref(voiceKey) || speakPref(SPEAK_VOICE_KEY);
    const chosen = name && speechSynthesis.getVoices().find((x) => x.voiceURI === name);
    const v = chosen && chosen.lang.slice(0, 2).toLowerCase() === lang.slice(0, 2) ? chosen : bestVoice(lang);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    return u;
  }
  // Tap to pause / tap to resume from there (2026-10-26, at the user's
  // request): while reading, a tap in the chat pauses; the next tap on a
  // bubble (or any tap on one while idle) reads from the tapped sentence on,
  // through the replies below it.
  // So speech runs from its own queue, one chunk per utterance, to know
  // where it is. Pausing is cancel(), not speechSynthesis.pause() (which
  // Android Chrome treats as a cancel anyway); replies arriving while
  // paused are not queued -- resuming above them reads them in order.
  // Google's voices (the deployment notes, 2026-11-11, the user: 読み上げの
  // スピーカーを切り替えたい → WaveNet で): each piece is fetched as MP3 from
  // the gateway (/agents/tts, which holds the key) and played in an <audio>,
  // whose output a PC's Chrome can send to a chosen speaker (setSinkId).
  // Any failure reads that piece with the device's voice instead and keeps
  // off Google for a minute. The next piece is fetched while one plays.
  const SPEAK_ENGINE_KEY = "aigw-speak-engine";   // "" (device) | "cloud"
  const SPEAK_CVOICE_KEY = "aigw-speak-cvoice";   // + "-<xx>" per language
  const SPEAK_SINK_KEY = "aigw-speak-sink";       // audiooutput deviceId
  const canSink = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  const CLOUD_LANG = { ja: "ja-JP", en: "en-US", zh: "cmn-CN" };
  let cloudVoices = null;       // [{name, lang, kind, gender}] once fetched
  let cloudVoicesAsked = null;  // the fetch in flight
  let cloudOffUntil = 0;
  let cloudFails = 0;           // in a row; three keep off Google for a minute
  const ttsAudio = new Audio();
  ttsAudio.preservesPitch = true;
  const ttsFetched = new Map(); // "voice\ntext" -> Promise<objectURL>
  const useCloud = () => speakPref(SPEAK_ENGINE_KEY) === "cloud" && Date.now() >= cloudOffUntil;
  function loadCloudVoices() {
    if (cloudVoices) return Promise.resolve(cloudVoices);
    if (!cloudVoicesAsked) {
      cloudVoicesAsked = fetch("/agents/tts/voices", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => (cloudVoices = j.voices || []))
        .catch((e) => { cloudVoicesAsked = null; throw e; });
    }
    return cloudVoicesAsked;
  }
  function cloudVoiceFor(lang) {
    const x = lang.slice(0, 2);
    const want = CLOUD_LANG[x];
    const vs = (cloudVoices || []).filter((v) => v.lang === want);
    const key = x === speechLang().slice(0, 2) ? SPEAK_CVOICE_KEY : `${SPEAK_CVOICE_KEY}-${x}`;
    const name = speakPref(key);
    return (vs.find((v) => v.name === name) || vs.find((v) => v.kind === "Wavenet") || vs[0] || {}).name || "";
  }
  function pieceRate(lang) {
    const [rateKey] = speakKeys(lang);
    return Number(speakPref(rateKey)) || Number(speakPref(SPEAK_RATE_KEY)) || 1;
  }
  function ttsUrl(voice, text) {
    const k = voice + "\n" + text;
    if (!ttsFetched.has(k)) {
      const p = fetch("/agents/tts", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voice, text }),
      }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))).then((b) => URL.createObjectURL(b));
      p.catch(() => ttsFetched.delete(k));
      ttsFetched.set(k, p);
      if (ttsFetched.size > 40) {
        const [old, op] = ttsFetched.entries().next().value;
        ttsFetched.delete(old);
        op.then((u) => URL.revokeObjectURL(u), () => {});
      }
    }
    return ttsFetched.get(k);
  }
  function applySink() {
    const id = speakPref(SPEAK_SINK_KEY);
    if (canSink && ttsAudio.sinkId !== id) ttsAudio.setSinkId(id).catch(() => {});
  }
  const speechSource = new WeakMap(); // speakable bubble -> its raw text
  let speakQueue = []; // [{el, chunks}]; [0] is the one being read
  let speakPos = 0; // chunk index within speakQueue[0]
  let speakGen = 0; // bumped on every cancel, so stale onend callbacks drop
  let speakPaused = false;
  let speakCurrent = null; // Chrome drops onend of a garbage-collected utterance
  function markSpeaking(el) {
    for (const b of messagesEl.querySelectorAll(".bubble.speaking")) if (b !== el) b.classList.remove("speaking");
    if (el) el.classList.add("speaking");
  }
  function speakPump() {
    const g = speakGen;
    while (speakQueue.length && speakPos >= speakQueue[0].chunks.length) {
      speakQueue.shift();
      speakPos = 0;
    }
    markSpeaking(speakQueue.length ? speakQueue[0].el : null);
    if (!speakQueue.length) return;
    const text = speakQueue[0].chunks[speakPos];
    const next = () => {
      if (g !== speakGen) return;
      speakPos++;
      speakPump();
    };
    const device = () => {
      if (g !== speakGen) return;
      const u = utterance(text);
      u.onend = u.onerror = next;
      speakCurrent = u;
      speechSynthesis.speak(u);
    };
    if (!useCloud()) return device();
    loadCloudVoices().then(() => {
      const lang = pieceLang(text);
      const voice = cloudVoiceFor(lang);
      if (!voice) return device();
      // Fetch the piece after this one meanwhile, so the gap stays short.
      const after = speakQueue[0] && speakQueue[0].chunks[speakPos + 1];
      if (after) { const v2 = cloudVoiceFor(pieceLang(after)); if (v2) ttsUrl(v2, after); }
      // A failed piece is asked for once more before the device's voice
      // reads it (2026-11-11: one passing failure switched voices mid-reply).
      const get = () => ttsUrl(voice, text).catch(() => new Promise((ok) => setTimeout(ok, 700)).then(() => ttsUrl(voice, text)));
      return get().then((url) => {
        if (g !== speakGen) return;
        cloudFails = 0;
        applySink();
        ttsAudio.onended = next;
        ttsAudio.onerror = () => { cloudFailed(); device(); };
        ttsAudio.src = url;
        ttsAudio.playbackRate = pieceRate(lang);
        return ttsAudio.play();
      });
    }).catch(() => { cloudFailed(); device(); });
  }
  function cloudFailed() {
    if (++cloudFails >= 3) { cloudFails = 0; cloudOffUntil = Date.now() + 60000; }
  }
  function speak(md, el) {
    if (!speakOn || speakPaused) return;
    const chunks = speechChunks(speechText(md));
    if (!chunks.length) return;
    speakQueue.push({ el: el || null, chunks });
    if (speakQueue.length === 1) {
      speakPos = 0;
      speakPump();
    }
  }
  function cancelSpeech() {
    speakGen++;
    speakQueue = [];
    speakPos = 0;
    speakCurrent = null;
    if (canSpeak) speechSynthesis.cancel();
    ttsAudio.onended = ttsAudio.onerror = null;
    ttsAudio.pause();
    markSpeaking(null);
  }
  function stopSpeaking() {
    cancelSpeech();
    speakPaused = false;
    updateSpeakBtn();
  }
  function pauseSpeaking() {
    cancelSpeech();
    speakPaused = true;
    updateSpeakBtn();
  }
  // Where in a bubble the tap landed, as a chunk index: the caret offset in
  // the shown text, matched against where each chunk's opening letters sit in
  // it (letters and digits only -- the shown text keeps the markdown, URLs
  // and tables that speechText rewrites).
  const speechKey = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  function tappedChunk(el, chunks, x, y) {
    let node = null;
    let off = 0;
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; off = p.offset; }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; off = r.startOffset; }
    }
    if (!node || !el.contains(node)) return 0;
    const before = document.createRange();
    before.setStart(el, 0);
    before.setEnd(node, off);
    const tapAt = speechKey(before.toString()).length;
    const shown = speechKey(el.textContent);
    let from = 0;
    let best = 0;
    chunks.forEach((c, i) => {
      const k = speechKey(c).slice(0, 8);
      const at = k ? shown.indexOf(k, from) : -1;
      if (at < 0) return;
      from = at + 1;
      if (at <= tapAt) best = i;
    });
    return best;
  }
  // A tapped thought (2026-10-26, the user's follow-up) is read too, opened
  // in full; the replies below follow, but not the other thoughts.
  const readsOn = (b) => speechSource.has(b) && !b.classList.contains("thought");
  function resumeSpeaking(bubble, x, y) {
    const all = [...messagesEl.querySelectorAll(".bubble")].filter((b) => b === bubble || readsOn(b));
    const rest = all.slice(all.indexOf(bubble)).filter((b) => b === bubble ? speechSource.has(b) : readsOn(b));
    if (!rest.length) return;
    if (rest[0].classList.contains("thought")) rest[0].classList.add("open");
    cancelSpeech();
    speakPaused = false;
    speakQueue = rest.map((b) => ({ el: b, chunks: speechChunks(speechText(speechSource.get(b))) }));
    speakPos = rest[0] === bubble ? tappedChunk(bubble, speakQueue[0].chunks, x, y) : 0;
    updateSpeakBtn();
    speakPump();
  }
  // With 🔊 on and nothing being read (2026-10-26, the user's follow-up), a
  // tap on a bubble reads from there just as it does while paused.
  messagesEl.addEventListener("click", (e) => {
    if (!speakOn) return;
    if (e.target.closest("a, button, img, video, audio, input, textarea, select, summary")) return;
    if (String(window.getSelection() || "").trim()) return; // selecting text, not a tap
    if (speakQueue.length && !speakPaused) {
      pauseSpeaking();
      return;
    }
    const bubble = e.target.closest(".bubble");
    if (bubble) resumeSpeaking(bubble, e.clientX, e.clientY);
  });
  // One header button for read-aloud and voice mode (2026-11-12, the user:
  // "読み上げと音声モードのメニューのアイコンを一緒にしたい。タップで1行メニューが
  // でるようにして、その中に ON,OFF と設定を開くためのボタンを"). Its look
  // only shows the state (blue: reading aloud, ⏸ badge: paused, red: voice
  // mode, set by voiceStart/voiceStop); a tap opens openAudioMenu().
  function speakAvailable() {
    return canSpeak && (isSpeakPreset(currentPreset) || isShellPreset(currentPreset));
  }
  let audioMenuEl = null;
  function updateSpeakBtn() {
    speakBtn.classList.toggle("active", speakOn);
    speakBtn.classList.toggle("paused", speakOn && speakPaused);
    speakBtn.title = speakOn && speakPaused ? t("読み上げを一時停止中: 吹き出しをタップでそこから再開")
      : t("読み上げ・音声モード");
    if (audioMenuEl) audioMenuEl.refresh();
  }
  function closeAudioMenu() {
    if (!audioMenuEl) return;
    audioMenuEl.remove();
    audioMenuEl = null;
  }
  function openAudioMenu() {
    if (audioMenuEl) return closeAudioMenu();
    const menu = document.createElement("div");
    menu.className = "audio-menu";
    const mk = (cls, onclick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.addEventListener("click", onclick);
      menu.appendChild(b);
      return b;
    };
    const speakB = mk("speak", () => setSpeakOn(!speakOn));
    const voiceB = mk("voice", () => { voiceOn ? voiceStop() : voiceStart(); menu.refresh(); });
    const setB = mk("settings", () => { closeAudioMenu(); openSpeakPopup(); });
    setB.textContent = t("⚙ 設定");
    menu.refresh = () => {
      const avail = speakAvailable();
      speakB.hidden = !avail;
      setB.hidden = !canSpeak;
      speakB.textContent = !speakOn ? t("🔇 読み上げ オフ") : speakPaused ? t("⏸ 読み上げ 一時停止中") : t("🔊 読み上げ オン");
      speakB.classList.toggle("on", speakOn);
      speakB.title = t("タップで読み上げをオン/オフ");
      voiceB.textContent = voiceOn ? t("🎙 音声モード オン") : t("🎙 音声モード オフ");
      voiceB.classList.toggle("on", voiceOn);
      voiceB.title = t("タップで音声モードをオン/オフ");
    };
    menu.refresh();
    document.body.appendChild(menu);
    const r = speakBtn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    audioMenuEl = menu;
    setTimeout(() => {
      const close = (e) => {
        if (menu.contains(e.target) || speakBtn.contains(e.target)) return;
        if (audioMenuEl === menu) closeAudioMenu();
        document.removeEventListener("pointerdown", close, true);
      };
      document.addEventListener("pointerdown", close, true);
    }, 0);
  }
  speakBtn.addEventListener("click", openAudioMenu);
  let speakPopEl = null;
  function openSpeakPopup() {
    if (speakPopEl) speakPopEl.remove();
    const pop = document.createElement("div");
    pop.className = "speak-pop";
    // One speed/voice pair per language: the display language's, then the
    // other one read aloud (English, or Japanese on an English display).
    const langs = [speechLang(), otherSpeechLang()];
    const sels = langs.map((lang) => {
      const [rateKey, voiceKey] = speakKeys(lang);
      const rateSel = document.createElement("select");
      const rate = Number(speakPref(rateKey)) || Number(speakPref(SPEAK_RATE_KEY)) || 1;
      for (const r of SPEAK_RATES) rateSel.add(new Option(`×${r}`, String(r), false, r === rate));
      const voiceSel = document.createElement("select");
      const x = lang.slice(0, 2);
      const cvoiceKey = x === speechLang().slice(0, 2) ? SPEAK_CVOICE_KEY : `${SPEAK_CVOICE_KEY}-${x}`;
      const cvoiceSel = document.createElement("select");
      const fillCloud = () => {
        cvoiceSel.innerHTML = "";
        const cur = cloudVoiceFor(lang);
        for (const v of (cloudVoices || []).filter((v) => v.lang === CLOUD_LANG[x])) {
          cvoiceSel.add(new Option(`${v.name.replace(/^[a-z]+-[A-Z]+-/, "")} (${v.gender === "FEMALE" ? "♀" : v.gender === "MALE" ? "♂" : "-"})`, v.name, false, v.name === cur));
        }
      };
      cvoiceSel.addEventListener("change", () => { try { localStorage.setItem(cvoiceKey, cvoiceSel.value); } catch (e) {} });
      const fillVoices = () => {
        const cur = speakPref(voiceKey);
        voiceSel.innerHTML = "";
        voiceSel.add(new Option(t("既定"), ""));
        for (const v of speechVoices(lang)) {
          voiceSel.add(new Option(v.name + (v.localService ? "" : t(" (オンライン)")), v.voiceURI, false, v.voiceURI === cur));
        }
      };
      fillVoices();
      // Chrome fills getVoices() asynchronously; the first call can be empty.
      speechSynthesis.addEventListener("voiceschanged", fillVoices, { once: true });
      const save = () => {
        try {
          localStorage.setItem(rateKey, rateSel.value);
          localStorage.setItem(voiceKey, voiceSel.value);
        } catch (e) {}
      };
      rateSel.addEventListener("change", save);
      voiceSel.addEventListener("change", save);
      return { lang, rateSel, voiceSel, cvoiceSel, fillCloud };
    });
    const SAMPLE = { ja: "この速さと声で読み上げます。", en: "This is how English replies will be read." };
    const tryBtn = document.createElement("button");
    tryBtn.textContent = t("試す");
    tryBtn.addEventListener("click", () => {
      cancelSpeech();
      cloudOffUntil = 0;
      const o = otherSpeechLang().slice(0, 2);
      speakQueue = [{ el: null, chunks: [t("この速さと声で読み上げます。"), ...(SAMPLE[o] ? [SAMPLE[o]] : [])] }];
      speakPos = 0;
      speakPump();
    });
    const row = (label, el) => {
      const l = document.createElement("label");
      l.append(label, el);
      return l;
    };
    const LANG_NAME = { ja: "日本語", en: "英語", zh: "中国語" };
    const engineSel = document.createElement("select");
    engineSel.add(new Option(t("端末の声"), ""));
    engineSel.add(new Option(t("Google の声(サーバー経由)"), "cloud"));
    engineSel.value = speakPref(SPEAK_ENGINE_KEY) === "cloud" ? "cloud" : "";
    const note = document.createElement("div");
    note.className = "speak-pop-note";
    pop.append(row(t("読み上げ"), engineSel), note);
    const voiceRows = [];
    for (const { lang, rateSel, voiceSel, cvoiceSel } of sels) {
      const head = document.createElement("div");
      head.className = "speak-pop-lang";
      head.textContent = t(LANG_NAME[lang.slice(0, 2)] || lang);
      const dv = row(t("声"), voiceSel);
      const cv = row(t("声"), cvoiceSel);
      voiceRows.push([dv, cv]);
      pop.append(head, row(t("速さ"), rateSel), dv, cv);
    }
    // Output speaker: only Google's voices can be sent to one (an <audio>);
    // names need the microphone permission in Chrome, asked on demand.
    const sinkSel = document.createElement("select");
    const sinkRow = row(t("出力先"), sinkSel);
    const fillSinks = async (ask) => {
      try {
        if (ask) (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((tr) => tr.stop());
        const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput");
        const cur = speakPref(SPEAK_SINK_KEY);
        sinkSel.innerHTML = "";
        sinkSel.add(new Option(t("既定"), ""));
        outs.forEach((d, i) => { if (d.deviceId && d.deviceId !== "default") sinkSel.add(new Option(d.label || `${t("スピーカー")} ${i + 1}`, d.deviceId, false, d.deviceId === cur)); });
        if (!ask && outs.some((d) => !d.label)) sinkSel.add(new Option(t("(名前を出す…)"), "?ask"));
      } catch (e) {}
    };
    sinkSel.addEventListener("change", () => {
      if (sinkSel.value === "?ask") return fillSinks(true);
      try { localStorage.setItem(SPEAK_SINK_KEY, sinkSel.value); } catch (e) {}
      applySink();
    });
    if (canSink && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) { pop.append(sinkRow); fillSinks(false); }
    const showEngine = () => {
      const cloud = engineSel.value === "cloud";
      for (const [dv, cv] of voiceRows) { dv.hidden = cloud; cv.hidden = !cloud; }
      sinkRow.hidden = !cloud;
      note.textContent = !cloud ? "" : cloudVoices ? (canSink ? "" : t("この端末では出力先は端末の設定で選びます"))
        : t("Google の声を読み込み中…");
    };
    engineSel.addEventListener("change", () => {
      try { localStorage.setItem(SPEAK_ENGINE_KEY, engineSel.value); } catch (e) {}
      cloudOffUntil = 0;
      showEngine();
    });
    showEngine();
    loadCloudVoices().then(() => { for (const x of sels) x.fillCloud(); showEngine(); })
      .catch(() => { if (engineSel.value === "cloud") note.textContent = t("Google の声を使えません(端末の声で読みます)"); });
    pop.append(tryBtn);
    document.body.appendChild(pop);
    const r = speakBtn.getBoundingClientRect();
    pop.style.top = `${r.bottom + 6}px`;
    pop.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    speakPopEl = pop;
    // Closes on a tap anywhere outside it -- after this long press has ended.
    setTimeout(() => {
      const close = (e) => {
        if (pop.contains(e.target)) return;
        pop.remove();
        if (speakPopEl === pop) speakPopEl = null;
        document.removeEventListener("pointerdown", close, true);
      };
      document.addEventListener("pointerdown", close, true);
    }, 0);
  }
  function setSpeakOn(on) {
    speakOn = on;
    try { localStorage.setItem(SPEAK_KEY, speakOn ? "1" : "0"); } catch (e) {}
    stopSpeaking();
    keepAlive(speakOn);
    if (speakOn) speak(t("読み上げをオンにしました"));
    updateSpeakBtn();
  }
  if (canSpeak) {
    document.addEventListener("pointerdown", () => {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
      keepAlive(speakOn); // play() also needs a user gesture
    }, { once: true, capture: true });
  }
  // Keep reading on a locked/backgrounded Android screen (2026-10-26, at the
  // user's suggestion): Chrome there freezes a page that is not playing
  // media, which also stops speechSynthesis. So while 🔊 is on, loop a clip
  // made in the page (no network): 10 s, since a shorter one does not count
  // as media playback, of a 25 Hz tone at about -60 dBFS -- not heard, but
  // above the level Chrome treats as silence. Whether this holds is up to
  // Chrome. On a PC too (2026-11-02, the user: a tab moved to the back
  // stopped reading): Chrome there also freezes a hidden, silent tab (e.g.
  // under Energy Saver), and a tab playing audio is left alone. iPhone/iPad
  // stay as they were (the user: leave the phone as it is).
  const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const keepAliveWanted = /Android/i.test(navigator.userAgent) || !isPhone;
  // PC: when a hidden tab comes back, restart a reading that stalled while
  // it was in the back (its onend never came), from the piece it was on.
  if (!isPhone && canSpeak) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !speakOn || speakPaused || !speakQueue.length) return;
      if (speechSynthesis.speaking || speechSynthesis.pending || !ttsAudio.paused) return;
      speakGen++;
      speakPump();
    });
  }
  let keepAliveEl = null;
  function keepAliveClipUrl() {
    const rate = 8000;
    const n = rate * 10;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, x) => { for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(32 * Math.sin(2 * Math.PI * 25 * i / rate)), true);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }
  function keepAlive(on) {
    if (!keepAliveWanted || !canSpeak) return;
    if (!on) {
      if (keepAliveEl) keepAliveEl.pause();
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
      return;
    }
    if (!keepAliveEl) {
      keepAliveEl = new Audio(keepAliveClipUrl());
      keepAliveEl.loop = true;
      // Speech can take the audio focus and pause the loop; start it again.
      keepAliveEl.addEventListener("pause", () => {
        if (speakOn) setTimeout(() => { if (speakOn) keepAliveEl.play().catch(() => {}); }, 1000);
      });
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: t("aigw 読み上げ") });
        // The lock screen's ⏸ turns read-aloud off, the same as 🔊.
        navigator.mediaSession.setActionHandler("pause", () => setSpeakOn(false));
        navigator.mediaSession.setActionHandler("play", () => setSpeakOn(true));
      }
    }
    keepAliveEl.play().catch(() => {});
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
  }

  function addThinkingIndicator() {
    removeThinkingIndicator();
    const div = document.createElement("div");
    div.className = "bubble agent thinking";
    div.id = "thinking-indicator";
    div.textContent = t("考え中…");
    const follow = chatNearBottom();
    messagesEl.appendChild(div);
    if (follow) scrollChatToBottom();
  }

  function removeThinkingIndicator() {
    const el = document.getElementById("thinking-indicator");
    if (el) el.remove();
  }

  // Fills an element with text, turning bare http(s) URLs into real links.
  // Built from text nodes, anchors and <strong> rather than innerHTML, so
  // pane output still can't inject markup. URL-linking was added for the
  // `claude auth login` flow, whose whole point is a URL the user has to
  // open from the phone, but it applies to any output -- an agent printing
  // a dev-server or PR link included. **bold** is Claude Code's own most
  // common markdown emphasis in its replies (headings, code fences, lists
  // etc. are left as plain text -- this is deliberately just the one marker
  // that shows up constantly and reads badly as literal asterisks, not a
  // markdown renderer).
  const INLINE_RE = /(https?:\/\/[^\s<>"'`、。，．（）［］｛｝「」『』【】〔〕〈〉《》“”‘’！？：；]+)|\*\*([^\n*]+?)\*\*/g;

  // The URL pattern above is greedy, so prose like "(see https://x/y)" or
  // 「https://x/y」 used to link "https://x/y)" and the page failed to open
  // (2026-10-07, at the user's request). If the URL is preceded by an opening
  // bracket or quote, it ends at the first matching closer. Otherwise trailing
  // sentence punctuation and closers with no opener inside the URL are dropped
  // (so a Wikipedia-style ".../Foo_(bar)" keeps its ")"). Japanese
  // punctuation never belongs to a URL typed in prose, so INLINE_RE already
  // stops there ("https://x/y、次は").
  const URL_PAIRS = {
    "(": ")", "[": "]", "{": "}", "<": ">", "\"": "\"", "'": "'", "`": "`",
    "（": "）", "［": "］", "｛": "｝", "「": "」", "『": "』", "【": "】",
    "〔": "〕", "〈": "〉", "《": "》", "“": "”", "‘": "’",
  };
  const URL_CLOSERS = { ")": "(", "]": "[", "}": "{" };
  const URL_TRAILING_RE = /[.,;:!?*]+$/;

  function trimUrl(url, before) {
    const closer = URL_PAIRS[before];
    if (closer) {
      // Skip closers balanced by an opener inside the URL itself.
      let depth = 0;
      for (let i = 0; i < url.length; i++) {
        if (url[i] === closer && depth === 0) { url = url.slice(0, i); break; }
        if (closer !== before && url[i] === before) depth++;
        else if (url[i] === closer) depth--;
      }
    }
    for (;;) {
      const t = url.replace(URL_TRAILING_RE, "");
      const last = t.slice(-1);
      const opener = URL_CLOSERS[last];
      if (opener && t.split(opener).length < t.split(last).length) {
        url = t.slice(0, -1);
      } else if (t === url) {
        return url;
      } else {
        url = t;
      }
    }
  }

  // Markdown tables (2026-10-05, at the user's request: Claude Code writes
  // them often and they read badly as raw pipes on a phone) are the one
  // block-level construct rendered for real: a "| a | b |" header line
  // immediately followed by a "|---|:--:|" separator line, then every
  // following line that still contains a "|". Built with DOM calls like the
  // rest of this function -- never innerHTML -- and each cell goes through
  // the same inline link/bold handling.
  const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  function splitTableRow(line) {
    let t = line.trim();
    if (t.startsWith("|")) t = t.slice(1);
    if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
    return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  }

  function buildTable(headerLine, sepLine, bodyLines) {
    const header = splitTableRow(headerLine);
    const aligns = splitTableRow(sepLine).map((c) =>
      c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "");
    const wrap = document.createElement("div");
    wrap.className = "md-table-wrap";
    const table = document.createElement("table");
    table.className = "md-table";
    const addRow = (parent, cells, tag) => {
      const tr = document.createElement("tr");
      for (let i = 0; i < header.length; i++) {
        const cell = document.createElement(tag);
        if (aligns[i]) cell.style.textAlign = aligns[i];
        appendInline(cell, cells[i] ?? "");
        tr.appendChild(cell);
      }
      parent.appendChild(tr);
    };
    const thead = document.createElement("thead");
    addRow(thead, header, "th");
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const line of bodyLines) addRow(tbody, splitTableRow(line), "td");
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // Fenced code blocks (2026-10-31, at the user's request: box-drawing
  // diagrams in Claude's replies came out ragged). They are laid out as a
  // terminal would: no wrapping (the block scrolls sideways instead of the
  // bubble's pre-wrap folding long lines), and every non-ASCII character in
  // a fixed cell -- 2ch for East Asian wide/fullwidth characters and emoji,
  // 1ch for the rest (box drawing, arrows). The CJK fallback font's own
  // glyph widths are not exactly 2ch, so without the cells a line with
  // Japanese in it drifts against one without.
  const FENCE_RE = /^\s*(```|~~~)/;
  const WIDE_RE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]/u;

  function buildCodeBlock(lines) {
    const pre = document.createElement("pre");
    pre.className = "md-code";
    let ascii = "";
    const flushAscii = () => {
      if (ascii) pre.appendChild(document.createTextNode(ascii));
      ascii = "";
    };
    lines.forEach((line, n) => {
      if (n) ascii += "\n";
      for (const ch of line) {
        if (ch <= "\x7e") { ascii += ch; continue; }
        flushAscii();
        const cell = document.createElement("span");
        cell.className = WIDE_RE.test(ch) ? "cw2" : "cw1";
        cell.textContent = ch;
        pre.appendChild(cell);
      }
    });
    flushAscii();
    return pre;
  }

  function setTextWithLinks(el, text) {
    el.textContent = "";
    const lines = text.split("\n");
    let plain = [];
    const flushPlain = () => {
      if (plain.length) appendInline(el, plain.join("\n"));
      plain = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = line.match(FENCE_RE);
      if (fence) {
        // An unclosed fence (a reply still streaming in) runs to the end.
        flushPlain();
        const body = [];
        let j = i + 1;
        while (j < lines.length && !lines[j].trimStart().startsWith(fence[1])) body.push(lines[j++]);
        el.appendChild(buildCodeBlock(body));
        i = j;
        // Like a table, the block is its own break.
        if (i + 1 < lines.length && lines[i + 1].trim() === "") i++;
        continue;
      }
      // GFM's own rule: the separator must have exactly as many cells as
      // the header (which also keeps a lone "--" line from counting).
      if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])
          && splitTableRow(line).length >= 2
          && splitTableRow(lines[i + 1]).length === splitTableRow(line).length) {
        // The newline that ended the text before the table is the table's
        // own block break now -- keeping it would add an empty line.
        flushPlain();
        const body = [];
        let j = i + 2;
        while (j < lines.length && lines[j].includes("|") && lines[j].trim() !== "") body.push(lines[j++]);
        el.appendChild(buildTable(line, lines[i + 1], body));
        i = j - 1;
        // Same for the line break right after it.
        if (i + 1 < lines.length && lines[i + 1].trim() === "") i++;
        continue;
      }
      plain.push(line);
    }
    flushPlain();
  }

  function appendInline(el, text) {
    let last = 0;
    for (const m of text.matchAll(INLINE_RE)) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        const url = trimUrl(m[1], text[m.index - 1]);
        const a = document.createElement("a");
        a.href = url;
        a.textContent = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        el.appendChild(a);
        last = m.index + url.length;
        continue;
      }
      const strong = document.createElement("strong");
      strong.textContent = m[2];
      el.appendChild(strong);
      last = m.index + m[0].length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }

  // ---- the live screen panel --------------------------------------------
  //
  // The chat log is append-only: it can show a menu appearing, but not the
  // cursor moving *within* it, because that is an in-place redraw of rows
  // that were already committed as a bubble. That made Claude Code's
  // selection menus unusable from a phone — arrow keys were delivered and
  // the cursor did move, but nothing on screen said so. This panel shows the
  // pane exactly as tmux renders it, refreshed on every change, so a menu is
  // always readable and answerable. The chat log is left alone: it stays the
  // transcript, this is the current state.

  let screenVisible = false;
  let latestScreen = "";
  // Whether the pane is showing the live tail (kept in sync with every SSE
  // "screen" push) or a one-shot full-scrollback fetch the user scrolled up
  // into (2026-08-31) -- while the latter,
  // applyScreen must not overwrite what's on screen out from under the user
  // just because the live pane changed somewhere below what they're reading.
  let screenAtLive = true;
  let screenHistoryLoading = false;
  // How many _screen_backlog lines have been pulled into view so far, and
  // whether the backend says there are more further back -- same shape as
  // the chat log's oldestLoadedSeq/hasMoreHistory
  // (2026-09-01). Reset whenever screenAtLive goes
  // true, since the next pull starts a fresh walk from the live end again.
  let screenHistoryLoaded = 0;
  let screenHistoryHasMore = true;

  // The single place screenAtLive ever changes, so the button that is the
  // *guaranteed* way back to live (see its own CSS/HTML comments) can never
  // drift out of sync with it -- 2026-09-01: the bug this fixes was exactly
  // that drift, not the flag itself. Before this, three call sites each set
  // `screenAtLive = true` directly and none of them touched the button
  // (which did not exist yet), so there was no way back to live once
  // loadScreenHistory set it false other than fully closing and reopening
  // the panel (setScreenVisible's own reset) -- reported by the user as
  // menu-navigation and post-send screen updates silently stopping until
  // they closed and reopened the panel every time.
  function setScreenAtLive(on) {
    screenAtLive = on;
    screenLiveBtnEl.classList.toggle("visible", !on);
    if (on) {
      screenHistoryLoaded = 0;
      screenHistoryHasMore = true;
      screenPaneEl.textContent = latestScreen;
      screenPaneEl.scrollTop = screenPaneEl.scrollHeight;
    }
  }
  screenLiveBtnEl.addEventListener("click", () => setScreenAtLive(true));

  function applyScreen(text) {
    latestScreen = text;
    if (!screenVisible || !screenAtLive) return;
    // Keep the bottom pinned unless the user has scrolled up to read.
    const atBottom =
      screenPaneEl.scrollHeight - screenPaneEl.scrollTop - screenPaneEl.clientHeight < 24;
    screenPaneEl.textContent = text;
    if (atBottom) screenPaneEl.scrollTop = screenPaneEl.scrollHeight;
  }

  // Scrolling to the very top of the live tail pages backward through
  // _screen_backlog -- the lines aigw-backend itself has recorded
  // scrolling off this pane over time (GET .../screen?before=N,
  // screen_history_page) -- and prepends each page above what is already
  // shown, same "don't jump" shape as the chat log's own loadOlderHistory.
  // 2026-09-01: replaces the
  // previous day's one-shot `?full=1` (raw `capture-pane -S -`), which
  // only ever worked for a plain, non-fullscreen pane -- tmux keeps no
  // scrollback at all for the alternate screen a fullscreen program
  // (claude-tui, or `claude` run by hand) draws in, so that approach came
  // back identical to the live tail there, however far the user pulled.
  // This backlog is built by aigw-backend's own poll loop instead, so it
  // works the same way for both kinds of pane.
  async function loadScreenHistory() {
    if (screenHistoryLoading || (!screenAtLive && !screenHistoryHasMore) || !currentSessionId) return;
    screenHistoryLoading = true;
    try {
      const r = await api(sessionPath(
        currentSessionId, `/screen?before=${screenHistoryLoaded}`, currentOwner));
      if (!screenVisible) return;
      screenHistoryHasMore = r.has_more;
      if (!r.text) return;  // nothing (further) to show -- has_more above still applies
      const prevScrollHeight = screenPaneEl.scrollHeight;
      const prevScrollTop = screenPaneEl.scrollTop;
      // #screen-pane's current text is already exactly what belongs below
      // this new page -- the live tail if this is the first pull (setScreenAtLive(false)
      // below only flips the flag/button, it never touches the DOM), or a
      // previously-loaded older page if this is a further pull while
      // already browsing history.
      screenPaneEl.textContent = `${r.text}\n${screenPaneEl.textContent}`;
      screenHistoryLoaded += r.text.split("\n").length;
      setScreenAtLive(false);
      // Same "don't jump" anchor as the chat log's loadOlderHistory.
      screenPaneEl.scrollTop = prevScrollTop + (screenPaneEl.scrollHeight - prevScrollHeight);
    } catch (e) {
      // Scrolling up again retries; nothing to surface for a background fetch.
    } finally {
      screenHistoryLoading = false;
    }
  }

  // The primary trigger for reaching/leaving history mode. computeScreenRows
  // deliberately keeps #screen-pane's content SCREEN_OVERFLOW_BUFFER_ROWS
  // taller than the panel can show at once
  // (2026-09-01), so real, always-present overflow -- and
  // therefore a working "scroll" event -- normally exists to drag into.
  // Before that buffer existed (2026-08-31 through early 2026-09-01), a
  // pane sized to fill the panel *exactly* never overflowed it at all, so
  // this listener alone was not enough -- see the touch/wheel fallback
  // below, kept for the one case the buffer does not cover (a session
  // with barely any content yet, e.g. a freshly opened plain shell, where
  // even the padded height does not reach the panel's own max-height).
  screenPaneEl.addEventListener("scroll", () => {
    if (screenPaneEl.scrollTop < 24) {
      loadScreenHistory();
      return;
    }
    if (!screenAtLive &&
        screenPaneEl.scrollHeight - screenPaneEl.scrollTop - screenPaneEl.clientHeight < 24) {
      setScreenAtLive(true);
    }
  });

  // Fallback for when there is truly nothing to scroll into yet (see the
  // "scroll" listener's own comment) -- a hand-rolled drag gesture, same
  // shape as the header's own pull-to-refresh, which needs the identical trick for the identical reason
  // (nothing there ever overflows either). Armed only when already at
  // scrollTop 0, so a panel that *is* legitimately scrollable still drags
  // normally on the way there (the "scroll" listener above takes over
  // once it arrives). Not preventDefault'd, same reasoning as the
  // header's version.
  (function () {
    const PULL_THRESHOLD = 50;
    let startY = null;
    let pulling = false;
    screenPaneEl.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1 || screenPaneEl.scrollTop > 0) { startY = null; return; }
      startY = e.touches[0].clientY;
      pulling = false;
    }, { passive: true });
    screenPaneEl.addEventListener("touchmove", (e) => {
      if (startY === null || e.touches.length !== 1) return;
      pulling = e.touches[0].clientY - startY > PULL_THRESHOLD;
    }, { passive: true });
    screenPaneEl.addEventListener("touchend", () => {
      if (pulling && screenAtLive) loadScreenHistory();
      startY = null;
      pulling = false;
    });
  })();
  // A mouse wheel is a real device event independent of whether the
  // element has anything to scroll (unlike touch, which produces no
  // "scroll" event at all over non-overflowing content) -- so this alone
  // already covers a desktop browser without needing a drag gesture.
  screenPaneEl.addEventListener("wheel", (e) => {
    if (screenAtLive && e.deltaY < 0 && screenPaneEl.scrollTop <= 0) loadScreenHistory();
  }, { passive: true });

  function setScreenVisible(on) {
    screenVisible = on;
    screenWrapEl.classList.toggle("visible", on);
    screenBtn.classList.toggle("active", on);
    // agentsBtn now floats inside #screen-wrap (2026-08-28), so it's
    // unreachable once this closes -- force the agents pane closed with it
    // rather than leaving it open with no way to close it.
    if (!on) { setAgentsVisible(false); return; }
    setScreenAtLive(true);
    // A session may have been idle since before this client connected, in
    // which case no "screen" event has arrived yet — fetch the current one.
    if (!currentSessionId) return;
    // The pane's size was only ever set once, at creation -- a session
    // opened again later on a differently-sized device (or adopted from one
    // that was never sized for this screen at all) can be too wide, or too
    // short/tall, for a fullscreen TUI to lay itself out readably. Re-
    // applying the current screen's own size every time this panel opens
    // (not just at creation) is what the user actually asked for
    // (2026-08-15 -- extended to height
    // 2026-08-31) -- cheap and idempotent,
    // so no harm in doing it unconditionally rather than only for sessions
    // known to need it.
    api(sessionPath(currentSessionId, "/resize", currentOwner), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cols: computeScreenCols(), rows: computeScreenRows() }),
    }).catch(() => {});
    api(sessionPath(currentSessionId, "/screen", currentOwner))
      .then((r) => { if (screenVisible && r.text) applyScreen(r.text); })
      .catch(() => {});
  }

  screenBtn.addEventListener("click", () => setScreenVisible(!screenVisible));

  // ---- Claude Code's own subagent (Task-tool) logs ------------------------
  //
  // A session's chat log only ever shows the *parent* conversation's own
  // text -- a subagent Claude Code spawned via the Agent/Task tool does its
  // own work out of view (see list_subagents/get_subagent_log in
  // aigw-backend). This panel lists whatever subagents the current
  // conversation has spawned and, tapped, shows that one's own transcript.
  // Same on-demand "ask fresh, no persistent stream" shape as the screen
  // panel, just polled on an interval instead of pushed via SSE, since a
  // subagent list/log changes far less often than a pane's screen.

  let agentsVisible = false;
  let agentsPollTimer = null;
  let currentAgentId = null;         // null while showing the list, not a detail
  let currentAgentDescription = "";

  function stopAgentsPoll() {
    if (agentsPollTimer) {
      clearInterval(agentsPollTimer);
      agentsPollTimer = null;
    }
  }

  function renderAgentsList(subagents) {
    if (!subagents.length) {
      agentsPaneEl.innerHTML = `<div class="agents-empty">${t("サブエージェントはまだありません")}</div>`;
      return;
    }
    agentsPaneEl.innerHTML = "";
    for (const a of subagents) {
      const row = document.createElement("button");
      row.className = "agent-row";
      const type = document.createElement("span");
      type.className = "agent-type";
      type.textContent = `[${a.agent_type || "?"}]`;
      row.appendChild(type);
      row.appendChild(document.createTextNode(a.description || a.agent_id));
      row.addEventListener("click", () => showAgentDetail(a.agent_id, a.description || a.agent_id));
      agentsPaneEl.appendChild(row);
    }
  }

  function renderAgentDetail(description, text) {
    agentsPaneEl.innerHTML = "";
    const header = document.createElement("div");
    header.className = "agent-detail-header";
    const back = document.createElement("button");
    back.textContent = t("← 一覧");
    back.addEventListener("click", () => {
      currentAgentId = null;
      agentsPaneEl.innerHTML = `<div class="agents-empty">${t("読み込み中…")}</div>`;
      refreshAgentsList();
    });
    header.appendChild(back);
    header.appendChild(document.createTextNode(description));
    agentsPaneEl.appendChild(header);
    const body = document.createElement("div");
    body.className = "agent-detail-body";
    setTextWithLinks(body, text || t("(まだ内容がありません)"));
    agentsPaneEl.appendChild(body);
  }

  function refreshAgentsList() {
    if (!currentSessionId) return;
    api(sessionPath(currentSessionId, "/subagents", currentOwner))
      .then((r) => { if (agentsVisible && currentAgentId === null) renderAgentsList(r.subagents); })
      .catch(() => {});
  }

  function refreshAgentDetail() {
    if (!currentSessionId || currentAgentId === null) return;
    const agentId = currentAgentId;
    api(sessionPath(currentSessionId, `/subagents/${agentId}`, currentOwner))
      .then((r) => {
        if (agentsVisible && currentAgentId === agentId) renderAgentDetail(currentAgentDescription, r.text);
      })
      .catch(() => {});
  }

  function showAgentDetail(agentId, description) {
    currentAgentId = agentId;
    currentAgentDescription = description;
    agentsPaneEl.innerHTML = `<div class="agents-empty">${t("読み込み中…")}</div>`;
    refreshAgentDetail();
  }

  function setAgentsVisible(on) {
    agentsVisible = on;
    agentsPaneEl.classList.toggle("visible", on);
    agentsBtn.classList.toggle("active", on);
    stopAgentsPoll();
    if (!on) return;
    currentAgentId = null;
    agentsPaneEl.innerHTML = `<div class="agents-empty">${t("読み込み中…")}</div>`;
    refreshAgentsList();
    agentsPollTimer = setInterval(() => {
      if (currentAgentId === null) refreshAgentsList();
      else refreshAgentDetail();
    }, 4000);
  }

  agentsBtn.addEventListener("click", () => setAgentsVisible(!agentsVisible));

  // ---- sharing --------------------------------------------------------
  //
  // Owner-only panel (shareBtn itself is hidden in openSession() whenever
  // currentOwner is set): add/remove usernames from this session's
  // shared_with, kept in currentSharedWith and re-rendered after every
  // change rather than polled, since only this tab's own actions can change
  // it while the panel is open.

  let shareVisible = false;
  let currentSharedWith = [];
  let currentSharedRead = [];
  // "read" when the open session is someone else's shared with me read-only
  // (the deployment notes): the log only -- no composer, keys, screen or stop.
  let currentShareMode = null;

  // aigw-backend sends Content-Disposition: attachment, but a same-tab
  // navigation to it is not reliable in a standalone PWA on every mobile
  // browser (some just navigate the app itself away from the chat). Fetch
  // + blob + a synthetic <a download> forces a real download regardless of
  // how the platform would otherwise have handled the response.
  async function downloadTranscript() {
    if (!currentSessionId) return;
    // Not api(): that always calls .json() on the response, which would
    // throw on this endpoint's plain-text body.
    const res = await fetch(sessionApiUrl(currentSessionId, "/download", currentOwner)).catch(() => null);
    if (!res || !res.ok) {
      alert(t("ダウンロードに失敗しました") + (res ? `: ${res.status}` : ""));
      return;
    }
    const disposition = res.headers.get("Content-Disposition") || "";
    const m = /filename="([^"]+)"/.exec(disposition);
    const filename = m ? m[1] : `aigw-${currentSessionId}.txt`;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Distinct from .active (which just means "panel open right now") --
  // .shared means "this session is currently shared with someone", so the
  // button still tells you that at a glance even with the panel closed.
  // Meaningless for a shared viewer's own copy of this button (they don't
  // control shared_with), so only ever set for one's own session.
  function updateShareBtnColor() {
    shareBtn.classList.toggle("shared", !currentOwner && currentSharedWith.length + currentSharedRead.length > 0);
  }

  function renderSharePane() {
    updateShareBtnColor();
    const save = `
      <div class="share-save">
        <button id="share-download-btn">${t("💾 会話ログを保存")}</button>
      </div>`;
    // Sharing *management* stays owner-only -- currentOwner set means this
    // session was shared to me, not mine to re-share.
    if (currentOwner) {
      sharePaneEl.innerHTML = save;
      sharePaneEl.querySelector("#share-download-btn").addEventListener("click", downloadTranscript);
      return;
    }
    // the deployment notes: everyone, read-only is the default. A root shell is
    // only ever shared read-only; Email only read-only with a named person
    // (2026-10-27, the user's request), so it gets just the name box.
    const isRoot = currentPreset === "root-shell";
    const isMail = currentPreset === "mail-tui";
    const modeLabel = (m) => (m === "read" ? t("閲覧のみ") : t("共同作業"));
    const entries = [
      ...currentSharedRead.map((u) => ({ u, m: "read" })),
      ...currentSharedWith.map((u) => ({ u, m: isRoot ? "read" : "write" })),
    ];
    const rows = entries.length
      ? entries.map(({ u, m }) => `
          <div class="share-row" data-user="${escapeHtml(u)}">
            <span>${u === "*" ? t("全員") : escapeHtml(u)} &middot; ${modeLabel(m)}</span>
            <button class="unshare-btn">${t("解除")}</button>
          </div>`).join("")
      : `<div class="share-empty">${t("まだ誰とも共有していません")}</div>`;
    const note = isMail
      ? `<div class="share-note">${t("Email は、名前を指定した相手に閲覧のみでだけ共有できます(チャットのログだけが見えます。画面・送信・停止はできません)。")}</div>`
      : `<div class="share-note">${t("閲覧のみ: チャットのログだけが見えます(画面・送信・停止はできません)。全員 = このサーバーの aigw の全ユーザー。")}</div>`;
    const warn = currentPreset === "host-shell"
      ? `<div class="share-warn">${t("⚠️ 共同作業で共有すると、相手はあなたと同じ権限でコマンドを実行できます。")}</div>`
      : "";
    sharePaneEl.innerHTML = `
      ${save}
      ${note}
      ${warn}
      ${rows}
      <div class="share-add">
        <select id="share-target" ${isMail ? "hidden" : ""}>
          <option value="*">${t("全員")}</option>
          <option value="user" ${isMail ? "selected" : ""}>${t("ユーザーを指定")}</option>
        </select>
        <input type="text" id="share-username" placeholder="${t("ユーザー名")}" autocapitalize="off" autocorrect="off" ${isMail ? "" : "hidden"}>
        <select id="share-mode" ${isRoot || isMail ? "hidden" : ""}>
          <option value="read">${t("閲覧のみ")}</option>
          <option value="write" disabled>${t("共同作業")}</option>
        </select>
        <button id="share-add-btn">${t("共有する")}</button>
      </div>`;
    sharePaneEl.querySelector("#share-download-btn").addEventListener("click", downloadTranscript);
    const targetEl = sharePaneEl.querySelector("#share-target");
    const userEl = sharePaneEl.querySelector("#share-username");
    const modeEl = sharePaneEl.querySelector("#share-mode");
    targetEl.addEventListener("change", () => {
      const everyone = targetEl.value === "*";
      userEl.hidden = everyone;
      // Co-working is with a named person only.
      modeEl.querySelector('option[value="write"]').disabled = everyone;
      if (everyone) modeEl.value = "read";
    });
    const applyShareMeta = (meta) => {
      currentSharedWith = meta.shared_with || [];
      currentSharedRead = meta.shared_read || [];
      renderSharePane();
    };
    sharePaneEl.querySelectorAll(".unshare-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const username = btn.closest(".share-row").dataset.user;
        try {
          applyShareMeta(await api(`/sessions/${currentSessionId}/unshare`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
          }));
        } catch (e) {
          alert(t("共有解除に失敗しました: {err}", { err: e.message }));
        }
      });
    });
    sharePaneEl.querySelector("#share-add-btn").addEventListener("click", async () => {
      const username = targetEl.value === "user" ? userEl.value.trim() : "*";
      if (!username) return;
      const mode = isRoot || isMail ? "read" : modeEl.value;
      try {
        applyShareMeta(await api(`/sessions/${currentSessionId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, mode }),
        }));
      } catch (e) {
        alert(t("共有に失敗しました: {err}", { err: e.message }));
      }
    });
  }

  function setShareVisible(on) {
    shareVisible = on;
    sharePaneEl.classList.toggle("visible", on);
    shareBtn.classList.toggle("active", on);
    if (on) renderSharePane();
  }

  shareBtn.addEventListener("click", () => setShareVisible(!shareVisible));

  // ---- outbox attachments (images, 3D models, anything else) --------------
  //
  // Every file a session drops in $AIGW_OUTBOX arrives as one "attachment"
  // event with a "kind" the backend detected from the extension
  // (outbox_attachment_kind in aigw-backend) -- this is the one place that
  // decides how each kind actually renders. A GLB a session generates
  // (media-cli's generators) has nothing a plain <img> can show it with,
  // which was the whole reason "kind" exists at all (2026-08-15, at the
  // user's request).
  // `filename` is what actually gets fetched -- this is a backend-made
  // immutable copy (`_frozen_...`), not the name the session's tool used.
  // `displayName` (falls back to `filename` for old events with no
  // source_filename) is what a human should see: the clean original name.
  // `mtl` (the deployment notes, 2026-09-22) is only ever set alongside a
  // kind="model3d" .obj: the same-stem .mtl aigw-backend paired it with,
  // itself unfrozen (see _scan_outbox_for_attachments's own comment on
  // why an OBJ+MTL pair is served by its real names instead).
  function renderAttachment(div, sessionId, filename, kind, displayName, mtl) {
    const url = sessionApiUrl(sessionId, `/files/${encodeURIComponent(filename)}`, currentOwner);
    const label = displayName || filename;
    if (kind === "image") {
      const img = document.createElement("img");
      // Native lazy loading, and set *before* src: history replay on session
      // open appends every past attachment top-to-bottom while the view is
      // pinned to the bottom, so without this every image -- oldest first --
      // competed for the browser's limited concurrent connections and the
      // newest (the one actually on screen) could end up starved out
      // entirely on sessions with many images. `loading` has to be set
      // before `src` -- the browser decides eager-vs-lazy at the moment the
      // src is assigned, not retroactively (2026-08-19, user report).
      img.loading = "lazy";
      img.decoding = "async";
      img.src = url;
      // Tap to view full-size: same "open a new tab" shape as the model3d
      // card below, rather than a same-page lightbox -- a plain image URL
      // as the whole document already gets the browser's own native
      // pinch-zoom/pan/scroll for free, no custom viewer code needed
      // (2026-08-19, at the user's request).
      img.addEventListener("click", () => window.open(url, "_blank"));
      div.appendChild(img);
      return;
    }
    if (kind === "folder") {
      // A directory a session dropped in outbox/ (the deployment notes) --
      // unlike every other kind here, `filename` is a directory name, not
      // something GET .../files/<filename> can serve. Opens a dedicated
      // page (own tab, same "give it the whole screen" reasoning as
      // model3d below) that walks it one level at a time via
      // GET .../outbox-dirs, rather than a same-page modal.
      const btn = document.createElement("button");
      btn.className = "attachment-card";
      btn.innerHTML = `<span class="attachment-icon">📁</span><span class="attachment-name"></span>`;
      btn.querySelector(".attachment-name").textContent = label;
      btn.addEventListener("click", () => {
        const params = new URLSearchParams({ session: sessionId, dir: filename, name: label });
        if (currentOwner) params.set("owner", currentOwner);
        window.open(`/agents/outbox-browse.html?${params}`, "_blank");
      });
      div.appendChild(btn);
      return;
    }
    if (kind === "model3d") {
      const btn = document.createElement("button");
      btn.className = "attachment-card";
      btn.innerHTML = `<span class="attachment-icon">🧊</span><span class="attachment-name"></span>`;
      btn.querySelector(".attachment-name").textContent = label;
      // A new tab, not a same-page modal: opening a 3D model this way gives
      // an orbit/zoom-capable viewer the whole screen instead of fighting
      // the chat view's own scroll/swipe. The actual viewer page is an
      // extension's concern (aigwExt model3d) -- the published core has no
      // dedicated 3D viewer of its own, so absent that, the plain file just
      // opens as the browser's own default handling for whatever this
      // attachment's mime type is.
      btn.addEventListener("click", () => {
        // An .obj needs the viewer's separate three.js path, and its mtl
        // (if aigw-backend found and paired one) alongside it -- everything
        // else (glb/gltf) keeps the plain two-arg call it always had.
        let taken;
        if (filename.toLowerCase().endsWith(".obj")) {
          const mtlUrl = mtl ? sessionApiUrl(sessionId, `/files/${encodeURIComponent(mtl)}`, currentOwner) : null;
          taken = window.aigwExt.model3d(url, label, { type: "obj", mtl: mtlUrl });
        } else {
          taken = window.aigwExt.model3d(url, label);
        }
        if (!taken) window.open(url, "_blank");
      });
      div.appendChild(btn);
      return;
    }
    // Fallback for anything else outbox_attachment_kind doesn't recognize
    // (e.g. a batch media job's zip) -- a plain download link, better than
    // silently showing nothing.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "attachment-card";
    a.innerHTML = `<span class="attachment-icon">📄</span><span class="attachment-name"></span>`;
    a.querySelector(".attachment-name").textContent = label;
    div.appendChild(a);
  }

  // Claude's thinking (agent_thinking, 2026-10-13): dimmed and folded to a
  // few lines so it doesn't crowd out the replies; a tap unfolds it.
  function renderThought(div, text) {
    div.className = "bubble agent thought";
    div.title = t("思考(タップで全文)");
    setTextWithLinks(div, text);
    speechSource.set(div, text); // read only when tapped (resumeSpeaking)
    div.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      div.classList.toggle("open");
    });
  }

  function renderEvent(sessionId, ev) {
    // Ephemeral, and not a conversation event: it carries no seq, is never
    // written to events.jsonl, and must not disturb the chat log — including
    // the thinking indicator, which every other event clears.
    if (ev.type === "screen") {
      applyScreen(ev.text);
      return;
    }
    // A message that waited in Claude's queue, written again where Claude
    // really took it (aigw-backend _take_pending_user, 2026-11-11): the
    // first copy goes, so a reply never reads as the answer to it.
    if (ev.type === "user_taken") {
      // Claude took a queued message where it stands (nothing in between);
      // also sent when the stream (re)opens, for any taken while away.
      takeQueued(ev.taken);
      return;
    }
    if (typeof ev.moved_from === "number") {
      movedSeqs.add(ev.moved_from);
      takeQueued(ev.moved_from);
      const old = messagesEl.querySelector(`[data-seq="${ev.moved_from}"]`);
      if (old) old.remove();
    }
    if (typeof ev.seq === "number" && movedSeqs.has(ev.seq)) return;

    // Headless preset turns only ever produce a single final agent_output
    // (no incremental streaming), so the wait between
    // a user_message and the reply can be several seconds with nothing else
    // happening; any new event means "no longer just waiting".
    removeThinkingIndicator();

    if (ev.type === "live_tail") {
      // Update the still-in-progress tail line in place -- see
      // _watch_attached_session in aigw-backend. Any *other* event type
      // (including a settled agent_output for the same session) means this
      // particular live bubble is done changing, so the next live_tail
      // should start a fresh one instead of resuming this one.
      const follow = chatNearBottom();
      if (!liveBubbleEl) {
        liveBubbleEl = document.createElement("div");
        liveBubbleEl.className = "bubble agent live";
        chatInsert(liveBubbleEl);
      }
      setTextWithLinks(liveBubbleEl, ev.text);
      afterChatAppend(follow);
      return;
    }
    // The live bubble was only ever a preview of not-yet-settled content --
    // whatever real event just arrived (agent_output, typically) supersedes
    // it, sometimes with byte-identical text (a no-output command like `cd`
    // settles to exactly what the live bubble already showed). Dropping
    // just the reference and leaving the element in #messages produced two
    // visibly duplicate bubbles; removing it here is what "supersedes"
    // needs to actually mean.
    if (liveBubbleEl) {
      liveBubbleEl.remove();
      liveBubbleEl = null;
    }

    const div = document.createElement("div");
    if (typeof ev.seq === "number") div.dataset.seq = ev.seq; // jump target for search (jumpToSeq)
    if (ev.type === "user_message") {
      div.className = "bubble user";
      // ev.from is set only when a shared collaborator, not
      // the owner, sent this -- shown as a name prefix so a co-worked
      // session's log stays legible about who typed what.
      if (ev.from) {
        const who = document.createElement("span");
        who.className = "from";
        who.textContent = `${ev.from}: `;
        div.appendChild(who);
      }
      div.appendChild(document.createTextNode(ev.text));
      // Two different acts land in the same log, so they have to look
      // different: without this marker, a 送信 still sitting unentered in the
      // pane is indistinguishable from one that was already run.
      if (ev.submit === false) {
        const tag = document.createElement("span");
        tag.className = "nosubmit";
        tag.textContent = t("⏎なし");
        div.appendChild(tag);
      }
    } else if (ev.type === "agent_output") {
      div.className = "bubble agent";
      setTextWithLinks(div, ev.text);
      if (speakable(currentPreset, ev)) speechSource.set(div, ev.text);
    } else if (ev.type === "agent_thinking") {
      renderThought(div, ev.text);
    } else if (ev.type === "image") {
      // Legacy event type: every outbox file was called "image" before
      // "attachment"+"kind" existed (2026-08-15) -- old sessions'
      // events.jsonl still has these, and they really were always images,
      // so this rendering is untouched (other than the same tap-to-view-
      // full-size behavior "attachment"/kind="image" got, 2026-08-19).
      // New events use "attachment" below.
      div.className = "bubble agent";
      const img = document.createElement("img");
      const imgUrl = sessionApiUrl(sessionId, `/files/${encodeURIComponent(ev.filename)}`, currentOwner);
      // Same starvation fix as the "attachment"/kind="image" case above --
      // see the comment there.
      img.loading = "lazy";
      img.decoding = "async";
      img.src = imgUrl;
      img.addEventListener("click", () => window.open(imgUrl, "_blank"));
      div.appendChild(img);
    } else if (ev.type === "attachment") {
      div.className = "bubble agent";
      renderAttachment(div, sessionId, ev.filename, ev.kind, ev.source_filename, ev.mtl);
    } else if (ev.type === "session_ended") {
      if (sessionId === currentSessionId) {
        chatDotEl.className = "dot stopped";
        // A dead session's pane has nothing further to arrive -- see
        // updateUnlockNotice()'s own alive check.
        if (currentSessionMeta) currentSessionMeta.alive = false;
        updateUnlockNotice();
        updateChatResumeBtn();
      }
      div.className = "bubble system";
      // exit_status is only present when the pane was kept around long
      // enough to be read (aigw-backend's remain-on-exit path); a nonzero
      // one is worth showing, since the message that explains it is the
      // bubble immediately above this one.
      div.textContent = ev.exit_status
        ? t("セッションは終了しました (終了コード {code})", { code: ev.exit_status })
        : t("セッションは終了しました");
      // A claude-login pane ends exactly when `claude auth login` is done,
      // success or failure -- i.e. this is the moment the auth panel's
      // answer changed, and the user should not have to press ⟳ to find out.
      if (sessionId === currentSessionId && isLoginPreset(currentPreset)) {
        refreshAuthStatus();
        div.textContent += "\n" + t("画面のどこかをタップすると戻ります");
        tapToLeave = true;
        composerEl.style.display = "none";
        keyToolbarEl.classList.remove("visible");
      }
    } else if (ev.type === "system") {
      div.className = "bubble system";
      div.textContent = ev.text;
    } else {
      return;
    }
    // One's own message always scrolls down (it was just sent from the
    // composer below); a relayed/shared one (ev.from) follows the rule.
    const follow = chatNearBottom() || (ev.type === "user_message" && !ev.from);
    if (ev.type === "user_message" && ev.queued && !renderingHistory) {
      // Shown at once, then Claude's output still going on its previous turn
      // goes above it until Claude takes it (2026-11-11, the user: 届いたことは
      // 早く分かるように表示し、あとでクロードの返事が割り込む形に).
      div.classList.add("queued");
      div.title = t("Claude が受け取るのを待っています");
      div.dataset.queuedAt = String(Date.now());
      messagesEl.appendChild(div);
      queuedUserEls.push(div);
    } else if (ev.type === "user_message" && !ev.moved_from) {
      messagesEl.appendChild(div);
    } else {
      chatInsert(div);
    }
    afterChatAppend(follow);
    return div;
  }

  // Messages sent while Claude was busy that Claude has not taken yet
  // (renderEvent, live only): the oldest is where new output goes in.
  const queuedUserEls = [];
  let renderingHistory = false;
  const QUEUED_GIVE_UP_MS = 10 * 60 * 1000;  // never told it was taken: stop holding the bottom
  function chatInsert(el) {
    while (queuedUserEls.length && (!queuedUserEls[0].isConnected
           || Date.now() - Number(queuedUserEls[0].dataset.queuedAt) > QUEUED_GIVE_UP_MS)) {
      queuedUserEls.shift().classList.remove("queued");
    }
    if (queuedUserEls.length) messagesEl.insertBefore(el, queuedUserEls[0]);
    else messagesEl.appendChild(el);
  }
  function takeQueued(seq) {
    // Claude reads the queue in order: this one and any sent before it.
    while (queuedUserEls.length && !(Number(queuedUserEls[0].dataset.seq) > seq)) {
      queuedUserEls.shift().classList.remove("queued");
    }
  }

  // Where a claude session was started, shown in the list because two
  // conversations with the same preset and label are otherwise
  // indistinguishable. meta.cwd is an absolute path; the part under
  // ~/sandhome is the part that carries information -- or, for a
  // drives-capable ssh machine's Claude preset, a posix
  // MSYS2 path ("/d/Projects"), shown Windows-style via mountPathLabel().
  function cwdSuffix(s) {
    if (!s.cwd) return "";
    if (/^\/[a-z](\/.*)?$/.test(s.cwd)) return ` &middot; ${escapeHtml(mountPathLabel(s.cwd))}`;
    const rel = s.cwd.replace(/^.*\/sandhome(\/|$)/, "");
    return rel ? ` &middot; ${escapeHtml(rel)}` : "";
  }
  // The same, leading the meta line now that the preset's name is gone.
  function cwdPrefix(s) {
    const x = cwdSuffix(s);
    return x ? x.replace(/^ &middot; /, "") + " &middot; " : "";
  }

  // ---- session links (the deployment notes) --------------------------------
  //
  // Lets the user pick two of their own sessions (typically one in the
  // sandbox container, one on the host or as root -- but any pair) and have
  // each side's replies relayed to the other automatically, until either
  // side disconnects or the backend's own turn cap kicks in
  // (create_link/_relay_agent_output in aigw-backend). Two taps, no new
  // screen: tap 🔗 on the first session (arms it, shows the banner below),
  // tap 🔗 on a second session to complete the link, or tap the same 🔗
  // again (or the banner's キャンセル) to back out.
  let linkArmedSessionId = null;

  // Remaining time of a link, as "残り1時間23分" -- links are time-limited
  // (2026-10-04; they used to count turns). Refreshed with every session-list
  // poll, which is also when the backend disconnects an expired one.
  function linkRemaining(expiresTs) {
    const min = Math.max(0, Math.ceil((expiresTs - Date.now() / 1000) / 60));
    const h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? t("残り{h}時間{m}分", { h, m }) : t("残り{h}時間", { h })) : t("残り{m}分", { m });
  }

  // The GitHub issue a session works on (the deployment notes), and 🤖 when
  // the dispatcher started it rather than a person.
  // After it, the issue's Status in its project (issue_status, refreshed by
  // the backend in the background) -- Blocked and In review are the ones
  // waiting for a person. A closed issue with no Status shows "Closed".
  function issueSuffix(s) {
    if (!s.issue) return "";
    return ` &middot; ${s.auto ? "🤖" : ""}${escapeHtml(s.issue)}${issueStatusBadge(s.issue_status)}`;
  }

  function issueStatusBadge(st) {
    if (!st) return "";
    const name = st.status || (st.state === "CLOSED" ? "Closed" : "");
    if (!name) return "";
    const cls = name.toLowerCase().replace(/[^a-z]+/g, "-");
    return ` <span class="issue-status issue-status-${escapeHtml(cls)}">${escapeHtml(name)}</span>`;
  }

  function linkSuffix(s) {
    if (!s.link) return "";
    const left = s.link.expires_ts == null ? t("切らない") : linkRemaining(s.link.expires_ts);
    return ` &middot; 🔗${escapeHtml(s.link.partner_label)}(${left})`;
  }

  function renderLinkArmedBanner() {
    const armed = lastSessions.find((s) => s.id === linkArmedSessionId);
    linkArmedBannerEl.classList.toggle("visible", !!armed);
    if (armed) linkArmedTextEl.textContent = t("🔗「{label}」とつなぐ相手をタップしてください", { label: armed.label });
  }

  linkArmedCancelBtn.addEventListener("click", () => {
    linkArmedSessionId = null;
    renderLinkArmedBanner();
    refreshSessions();
  });

  // "root-shell" is the only preset a root Claude conversation can run in
  // (there is no dedicated "claude-tui-root" -- the deployment notes): whoever is
  // driving it typed `claude` into that shell by hand. Used only to suggest
  // a shorter default time limit below; the backend applies its own default
  // (and the real backstop, the passkey window) regardless of what the
  // client suggests.
  function isRootSession(s) { return s.preset === "root-shell"; }

  // A link is a group (2026-11-08): with one session armed, tapping 🔗 on a
  // session that is already linked adds the armed one to that link.
  async function onLinkButtonTapped(s) {
    if (s.link && (linkArmedSessionId === null || linkArmedSessionId === s.id)) {
      const many = (s.link.members || []).length > 1;
      const q = many
        ? t("「{a}」を連携から外します(残り: {b})。よろしいですか?", { a: s.label, b: s.link.partner_label })
        : t("「{a}」と「{b}」の連携を切断します。よろしいですか?", { a: s.label, b: s.link.partner_label });
      if (!confirm(q)) return;
      await api("/sessions/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: s.id }),
      }).catch((e) => alert(t("切断できませんでした: {err}", { err: e.message })));
      await refreshSessions();
      return;
    }
    if (linkArmedSessionId === s.id) {
      linkArmedSessionId = null;
      renderLinkArmedBanner();
      await refreshSessions();
      return;
    }
    if (linkArmedSessionId === null) {
      linkArmedSessionId = s.id;
      renderLinkArmedBanner();
      await refreshSessions();
      return;
    }
    const other = lastSessions.find((x) => x.id === linkArmedSessionId);
    linkArmedSessionId = null;
    renderLinkArmedBanner();
    if (!other) { await refreshSessions(); return; }
    if (s.link || other.link) {
      // Joining a link: it keeps its own time limit.
      if (s.link && other.link) {
        alert(t("どちらもすでに連携中です。片方を外してからつないでください。"));
        await refreshSessions();
        return;
      }
      const joiner = s.link ? other : s;
      const group = s.link ? s : other;
      if (!confirm(t("「{a}」を「{b}」の連携に加えます。", { a: joiner.label, b: [group.label, group.link.partner_label].join("・") }))) {
        await refreshSessions();
        return;
      }
      await api("/sessions/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: other.id, b: s.id }),
      }).catch((e) => alert(t("連携できませんでした: {err}", { err: e.message })));
      await refreshSessions();
      return;
    }
    // Same defaults as the backend's DEFAULT_LINK_DURATION(_ROOT): 30 min
    // when root is involved, 4 hours otherwise. Blank also means "default".
    const suggested = (isRootSession(s) || isRootSession(other)) ? 30 : 240;
    const raw = prompt(
      t("「{a}」と「{b}」をつなぎます。", { a: other.label, b: s.label }) + "\n" +
      t("何分で自動的に切断するかを入力してください(最大1440分=24時間)。0 にすると切りません(どちらかのセッションが終わるまで)。"),
      String(suggested),
    );
    if (raw === null) { await refreshSessions(); return; } // cancelled
    const minutes = raw.trim() === "" ? null : Number(raw);
    const forever = minutes === 0;  // the deployment notes: 0 = never expires
    if (raw.trim() !== "" && !forever && (!Number.isFinite(minutes) || minutes <= 0)) {
      alert("分数は正の数で入力してください");
      await refreshSessions();
      return;
    }
    const body = { a: other.id, b: s.id };
    if (forever) body.forever = true;
    else if (minutes !== null) body.duration_minutes = minutes;
    await api("/sessions/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((e) => alert(t("連携できませんでした: {err}", { err: e.message })));
    await refreshSessions();
  }

  // Sessions previously placed by a drag keep their
  // saved relative sequence; anything not in `order` (a session created
  // since the last drag) is placed *before* all of them, in the usual
  // alive/ended sort's relative order -- so a brand-new session always
  // shows up at the very top of the list, never buried under whatever was
  // last dragged (2026-09-15: putting it after
  // the saved ones instead defeated "newest first" as soon as anyone had
  // ever dragged the list once).
  function applyCustomOrder(defaultSorted, order) {
    if (!order || order.length === 0) return defaultSorted;
    const byId = new Map(defaultSorted.map((s) => [s.id, s]));
    const orderedIds = order.filter((id) => byId.has(id));
    const orderedSet = new Set(orderedIds);
    const rest = defaultSorted.filter((s) => !orderedSet.has(s.id));
    return [...rest, ...orderedIds.map((id) => byId.get(id))];
  }

  // Rows a browser without the needed passkey window gets back from
  // GET /sessions with label "🔒" and locked: true (aigw-backend's
  // redact_locked_sessions). WebAuthn can only start from a tap, so the list
  // cannot ask for the passkey by itself on load: this bar above it (not
  // inside #sessions, whose children the drag-reorder code counts) offers
  // the tap, and a tap on a locked row asks first and then opens the row
  // with its real name (2026-10-09, at the user's request).
  const lockedListBarEl = document.createElement("div");
  lockedListBarEl.hidden = true;
  lockedListBarEl.style.cssText =
    "display: flex; align-items: center; gap: 0.6rem; margin: 0 0 0.6rem; padding: 0.6rem 0.8rem; " +
    "border-radius: 10px; border: 1px solid #b45309; background: rgba(180,83,9,0.15); color: #fcd34d; font-size: 0.9rem;";
  const lockedListTextEl = document.createElement("span");
  lockedListTextEl.style.flex = "1";
  const lockedListBtnEl = document.createElement("button");
  lockedListBtnEl.type = "button";
  lockedListBtnEl.textContent = t("🔓 解錠して表示");
  lockedListBtnEl.style.cssText =
    "flex-shrink: 0; padding: 0.4rem 0.8rem; border-radius: 8px; border: none; background: #4285F4; color: white; font-weight: 600;";
  lockedListBarEl.append(lockedListTextEl, lockedListBtnEl);
  // Above the list and its folders, not under them (2026-11-03, the user:
  // with many sessions in a folder the bar was pushed out of sight).
  const newFolderBtnEl = document.getElementById("new-folder-btn");
  newFolderBtnEl.parentNode.insertBefore(lockedListBarEl, newFolderBtnEl);
  let lockedListTier = "host";

  function lockedTierFor(list) {
    return list.some((s) => s.tmux_location === "root") ? "root" : "host";
  }

  async function unlockAndRefresh(tier) {
    await ensureUnlocked(tier);
    return refreshSessions();
  }

  lockedListBtnEl.addEventListener("click", async () => {
    lockedListBtnEl.disabled = true;
    try {
      await unlockAndRefresh(lockedListTier);
    } catch (e) {
      alert(e.message);
    } finally {
      lockedListBtnEl.disabled = false;
    }
  });

  async function openLockedSession(s) {
    try {
      const all = await unlockAndRefresh(s.tmux_location === "root" ? "root" : "host");
      openSession((all || []).find((x) => x.id === s.id && x.owner === s.owner) || s);
    } catch (e) {
      alert(e.message);
    }
  }

  // ---- Session folders (the deployment notes, 2026-11-04, user request) ----
  //
  // The list is a tree: folders (unlimited depth, "入れ子の段数は制限したく
  // ない") hold sessions and other folders. An extension may add built-in
  // ones (aigwExt folders; the server's own list has them first), and a
  // default folder for a session no folder was chosen for (aigwExt
  // folderOf). Stored per user as GET/POST /folders ({folders, assign}); a
  // session's place is assign[id] ("" = top), else that default, else the top.
  // A folder's 🗄 and stop cover everything under it; its grey dot resumes
  // what its last stop stopped (last_stopped). Rows and folders move by
  // dragging ⠿: onto the middle of a folder row puts the item in it,
  // between rows puts it where it was dropped.
  let folderDoc = { folders: [], assign: {} };
  let folderSaving = 0;
  let orderSaving = 0;
  // Bumped by every local change to the order or the folders, so a list
  // refresh that started before it does not put the old state back.
  let listEditSeq = 0;
  let lastVisibleSessions = [];
  const FOLDERS_OPEN_KEY = "aigw-folders-open";
  const openFolders = new Set();
  try { for (const id of JSON.parse(localStorage.getItem(FOLDERS_OPEN_KEY) || "[]")) openFolders.add(id); } catch (e) {}
  // A built-in folder may keep its open state under a key of its own too
  // (aigwExt folders, openKey): read when it registers.
  function readExtOpenKeys() {
    for (const f of window.aigwExt.folders()) {
      if (!f.openKey) continue;
      try { if (localStorage.getItem(f.openKey) === "1") openFolders.add(f.id); } catch (e) {}
    }
  }
  const openArchivedFolders = new Set();
  function saveOpenFolders() {
    try { localStorage.setItem(FOLDERS_OPEN_KEY, JSON.stringify([...openFolders])); } catch (e) {}
    for (const f of window.aigwExt.folders()) {
      if (!f.openKey) continue;
      try { localStorage.setItem(f.openKey, openFolders.has(f.id) ? "1" : "0"); } catch (e) {}
    }
  }
  function folderById(id) {
    return folderDoc.folders.find((f) => f.id === id) || null;
  }
  function folderOfSession(s) {
    const a = folderDoc.assign[s.id];
    if (a !== undefined) return a && folderById(a) ? a : null;
    const d = window.aigwExt.folderOf(s);
    return d && folderById(d) ? d : null;
  }
  function childFolders(parentId) {
    return folderDoc.folders.filter((f) => (f.parent || null) === parentId);
  }
  // The folder itself or any folder above it is archived.
  function folderHidden(id) {
    for (let f = id && folderById(id); f; f = f.parent && folderById(f.parent)) {
      if (f.archived) return true;
    }
    return false;
  }
  function folderAncestors(id) {
    const out = [];
    for (let f = id && folderById(id); f; f = f.parent && folderById(f.parent)) out.push(f.id);
    return out;
  }
  function folderSubtree(id) {
    const out = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folderDoc.folders) {
        if (f.parent && out.has(f.parent) && !out.has(f.id)) { out.add(f.id); grew = true; }
      }
    }
    return out;
  }
  function sessionsInSubtree(id, list) {
    const ids = folderSubtree(id);
    return list.filter((s) => ids.has(folderOfSession(s)));
  }
  function openFolderPath(id) {
    const path = folderAncestors(id);
    if (path.every((x) => openFolders.has(x))) return;
    for (const x of path) openFolders.add(x);
    saveOpenFolders();
    renderSessionList();
  }
  // Sessions in the order the tree shows them, every folder open.
  function treeOrder(list) {
    const out = [];
    const walk = (pid) => {
      for (const f of childFolders(pid)) if (!f.archived) walk(f.id);
      for (const s of list) if (folderOfSession(s) === pid) out.push(s);
    };
    walk(null);
    return out;
  }
  // Sends only the change (POST /folders/ops), applied by the backend to
  // the tree as it is then: another tab's moves are not overwritten. The
  // change is already made here too, so the list shows it at once.
  async function saveFolders(ops) {
    listEditSeq++;
    folderSaving++;
    try {
      folderDoc = await api("/folders/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops }),
      });
    } catch (e) {
      alert(t("フォルダを保存できませんでした: {err}", { err: e.message }));
      folderDoc = await api("/folders").catch(() => folderDoc);
    } finally {
      folderSaving--;
    }
    renderSessionList();
  }
  function newFolderId() {
    return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  async function createFolder(parentId) {
    const name = (prompt(t("フォルダの名前:"), "") || "").trim();
    if (!name) return;
    const f = { id: newFolderId(), name, parent: parentId, archived: false, last_stopped: [] };
    folderDoc.folders.push(f);
    if (parentId) { for (const x of folderAncestors(parentId)) openFolders.add(x); saveOpenFolders(); }
    await saveFolders([{ op: "put", folder: f }]);
  }
  async function renameFolder(f) {
    const name = (prompt(t("新しい名前:"), f.name) || "").trim();
    if (!name || name === f.name) return;
    f.name = name;
    await saveFolders([{ op: "put", folder: { id: f.id, name } }]);
  }
  // A folder's 作業フォルダ (the deployment notes): relative to ~/sandhome
  // for the sandbox, to $HOME for host-shell and to /root for root-shell;
  // a folder without one uses the nearest folder above's.
  async function setFolderWorkdir(f) {
    const raw = prompt(t("作業フォルダ(sandbox は ~/sandhome、ホストは HOME、root は /root から見た場所。空にすると無し):"), f.workdir || "");
    if (raw === null) return;
    const workdir = raw.trim().replace(/^~\//, "").replace(/^\/+|\/+$/g, "");
    if (workdir.split("/").includes("..")) { alert(t("「..」は使えません")); return; }
    f.workdir = workdir;
    await saveFolders([{ op: "put", folder: { id: f.id, workdir } }]);
  }
  function folderEffectiveWorkdir(id) {
    for (let f = id && folderById(id); f; f = f.parent && folderById(f.parent)) {
      if (f.workdir) return f.workdir;
    }
    return "";
  }
  function showFolderMenu(anchor, items) {
    document.querySelectorAll(".folder-menu").forEach((m) => m.remove());
    const menu = document.createElement("div");
    menu.className = "folder-menu";
    for (const [label, fn] of items) {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", (e) => { e.stopPropagation(); menu.remove(); fn(); });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    menu.style.left = Math.max(8, Math.min(r.right - w, document.documentElement.clientWidth - w - 8)) + "px";
    menu.style.top = (r.bottom + window.scrollY + 4) + "px";
    setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
  }
  // The Windows machines' blackboard (the deployment notes, 2026-11-06): who
  // (which session) is using which Windows machine, on this host. Sessions
  // on a Windows machine appear by themselves; a session working on one
  // from elsewhere over ssh/scp/sftp/rsync appear by themselves too (the
  // check finds the process); `aigw-board use` / "＋ 使う" are optional notes.
  // The server checks every 3 minutes: ended sessions become 「終了」, a
  // closed ssh 「終了(SSH終了)」, 30 minutes without activity 「30分以上動きなし」.
  const boardModalEl = document.getElementById("board-modal");
  let boardTimer = null;
  boardModalEl.addEventListener("click", (e) => { if (e.target === boardModalEl) closeBoard(); });
  function closeBoard() { boardModalEl.hidden = true; clearInterval(boardTimer); boardTimer = null; }
  const BOARD_WHY = { stopped: "停止", fell: "落ちた", deleted: "削除", released: "解除", disconnected: "SSH終了" };
  async function boardPost(body) {
    try {
      return await api("/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) { alert(t("黒板を書き換えられませんでした: {err}", { err: e.message })); return null; }
  }
  async function renderBoard(data) {
    const box = boardModalEl.querySelector(".box");
    if (!data) data = await api("/board").catch((e) => ({ error: e.message }));
    const caps = await api("/capabilities").catch(() => ({}));
    const reachable = new Set([...(caps.ssh_machines || []), ...Object.keys(caps.ssh_desktop || {})]);
    // Asleep (not answering, but wakeable): nobody is using it. Opening its
    // session list or starting a session there wakes it.
    const asleep = new Set(caps.ssh_asleep || []);
    const now = Date.now() / 1000;
    const hm = (ts) => fmtStamp(ts).slice(5);
    // The machines (this host, the other ssh machines) and 設定 come first:
    // this panel took the place of the machine menu (2026-11-09, the user:
    // "コンボボックスをやめて黒板に統一"). The Windows machines are the
    // blackboard's cards below; their names open their session lists.
    box.innerHTML = `
      <div class="head"><h3>🖥 ${t("マシン")}</h3><button class="reload">⟳</button><button class="close">✕</button></div>
      <div class="mlist"></div>`;
    const mlist = box.querySelector(".mlist");
    const cur = viewAuth.style.display === "flex" ? "auth" : currentMachine;
    for (const o of [...machineSelectEl.options]) {
      if (o.dataset.board || o.value === "board") continue;
      const btn = document.createElement("button");
      btn.className = "mpick" + (o.value === cur ? " cur" : "");
      btn.textContent = o.value === "auth" ? "⚙ " + o.textContent : o.textContent;
      btn.addEventListener("click", () => openBoardMachine(o.value));
      mlist.appendChild(btn);
    }
    box.querySelector(".close").addEventListener("click", closeBoard);
    box.querySelector(".reload").addEventListener("click", () => renderBoard());
    if (data.error) { box.insertAdjacentHTML("beforeend", `<div class="note">${escapeHtml(data.error)}</div>`); return; }
    if (!data.available && !(data.machines || []).length) return;
    box.insertAdjacentHTML("beforeend", `
      <div class="head"><h3>📋 ${t("Windows 機の黒板")}</h3></div>
      <div class="note">${t("どの Windows 機を、誰のどのセッションが使っているか。Windows 機で動いているセッションと、セッションから SSH でつないでいるものは自動で載るので、書き込みは要りません(「＋ 使う」はメモを残したいときだけ)。3分ごとに確かめ、止まった・落ちたセッションや切れた SSH は「終了」、30分以上動きが無ければ「30分以上動きなし」になります。")}</div>
      ${data.available ? "" : `<div class="note">${t("このホストには黒板の置き場所がありません")}</div>`}
      ${Object.entries(data.feeds || {}).filter(([, f]) => f.stale).map(([h, f]) => `<div class="note">${t("{host} の分が {time} から届いていません", { host: escapeHtml(h), time: hm(f.at) })}</div>`).join("")}`);
    for (const m of data.machines) {
      const rows = data.entries.filter((e) => e.machine === m)
        .sort((a, b) => (a.state === "ended") - (b.state === "ended") || (a.since || 0) - (b.since || 0));
      const live = rows.filter((e) => e.state !== "ended");
      const card = document.createElement("div");
      card.className = "machine";
      const status = !reachable.has(m) ? `<span class="off">${t("届かない")}</span>`
        : asleep.has(m) ? `<span class="sleep" title="${escapeHtml(t("開く・セッションを始めると起こします(約10秒)"))}">💤 ${t("寝ている(空き)")}</span>`
        : live.length ? `<span class="busy">${t("使用中 {n}", { n: live.length })}</span>` : `<span class="free">${t("空き")}</span>`;
      card.innerHTML = `<div class="m-head">${reachable.has(m) && boardMachines.has(m)
        ? `<a class="name${m === currentMachine && viewAuth.style.display !== "flex" ? " cur" : ""}" href="#" title="${escapeHtml(t("この機械のセッション一覧へ"))}">🪟 ${escapeHtml(m)}</a>`
        : `<span class="name">🪟 ${escapeHtml(m)}</span>`}${status}<button class="use">＋ ${t("使う")}</button></div>`;
      const nameLink = card.querySelector("a.name");
      if (nameLink) nameLink.addEventListener("click", (ev) => { ev.preventDefault(); openBoardMachine(m); });
      card.querySelector(".use").addEventListener("click", async () => {
        const what = prompt(t("{m} ですることを書いてください(セッションに結び付かない手書きの書き込みになります):", { m }), "");
        if (what === null) return;
        const r = await boardPost({ op: "claim", machine: m, what });
        if (r) renderBoard(r);
      });
      for (const e of rows) {
        const row = document.createElement("div");
        row.className = "entry" + (e.state === "ended" ? " ended" : "");
        let st;
        if (e.state === "ended") st = `<span class="st ended">${t("終了")}(${t(BOARD_WHY[e.ended_why] || e.ended_why || "")} ${hm(e.ended_at)})</span>`;
        else if (e.state === "asleep") st = `<span class="st asleep">💤 ${t("寝ている")}</span>`;
        else if (e.state === "idle") st = `<span class="st idle">${t("30分以上動きなし")}(${Math.floor((now - (e.last_activity || now)) / 60)}${t("分")})</span>`;
        else st = `<span class="st using">${t("使用中")}</span>`;
        const mine = e.user === data.me && !e.host;
        const own = mine && e.session_id ? lastSessions.find((x) => x.id === e.session_id && !x.owner) : null;
        const label = e.label || (e.session_id ? e.session_id : t("(手書き)"));
        const src = { auto: t("自動"), ssh: t("SSH・自動"), claim: e.session_id ? t("セッションが記入") : t("手書き") }[e.source] || e.source;
        row.innerHTML = `
          <div class="body">
            <div>${st} <span class="who">${escapeHtml(e.user)}${e.host ? ` (${escapeHtml(e.host)})` : ""} · ${own ? `<a href="#${escapeHtml(e.session_id)}" class="open">${escapeHtml(label)}</a>` : escapeHtml(label)}</span></div>
            ${e.what ? `<div class="what">${escapeHtml(e.what)}</div>` : ""}
            <div class="sub">${src} · ${hm(e.since)}〜</div>
            ${e.command ? `<div class="sub cmd">${escapeHtml(e.command)}</div>` : ""}
          </div>`;
        const open = row.querySelector(".open");
        if (open) open.addEventListener("click", (ev) => { ev.preventDefault(); closeBoard(); own.locked ? openLockedSession(own) : openSession(own); });
        if (mine && e.state !== "ended") {
          const ed = document.createElement("button");
          ed.textContent = "✏️";
          ed.title = t("することを書き換える");
          ed.addEventListener("click", async () => {
            const what = prompt(t("することを書き換える"), e.what || "");
            if (what === null) return;
            const r = await boardPost({ op: "note", key: e.key, what });
            if (r) renderBoard(r);
          });
          row.appendChild(ed);
          if (e.source === "claim") {
            const rel = document.createElement("button");
            rel.textContent = t("解除");
            rel.title = t("この書き込みを外す");
            rel.addEventListener("click", async () => {
              const r = await boardPost({ op: "release", key: e.key });
              if (r) renderBoard(r);
            });
            row.appendChild(rel);
          }
        }
        card.appendChild(row);
      }
      box.appendChild(card);
    }
  }
  async function openBoard() {
    boardModalEl.querySelector(".box").innerHTML = `<div class="note">${t("確認中…")}</div>`;
    boardModalEl.hidden = false;
    await renderBoard();
    clearInterval(boardTimer);
    boardTimer = setInterval(() => { if (!boardModalEl.hidden) renderBoard(); }, 30000);
  }

  function fmtStamp(ts) {
    const d = new Date(ts * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // The to-do list (the deployment notes, 2026-11-07): whose turn each session is, from
  // the 「状態:」 line Claude ends its reply with (the server reads it from the
  // Stop hook). Your turn first, then 寝かせ whose date came, Claude working,
  // 寝かせ, and 済み not looked at yet. Extensions may add entries on top and
  // to a session's entry (aigwExt todo).
  const todoBtn = document.getElementById("todo-btn");
  const todoBadge = document.getElementById("todo-badge");
  const todoModalEl = document.getElementById("todo-modal");
  // Its own URL (2026-11-08, the user: "やることを Email のように URL を分けたい。
  // そこからクリックするとセッションのページへ。ボタンではなくてただリンクを"):
  // /todo shows only this list, every entry a plain link to its
  // session (/agents/#<id>); ✅ in the header is a link to it.
  const TODO_PAGE = /\/todo\/?$/.test(location.pathname);
  function taskDue(s) {
    return s.task && s.task.state === "snooze" && (s.task.until || 0) * 1000 <= Date.now();
  }
  function taskGroup(s) {
    const tk = s.task;
    if (s.archived || s.owner || s.locked) return null;
    // A confirmation on the screen puts the session in "you" -- unless ✓/💤
    // was pressed on it by hand since (2026-11-10, the user: チェックしても手番の
    // リストから消えない; Ex5 sat on the weekly-limit question). The next
    // message or reply replaces the by-hand state, so a later question shows again.
    const byHand = tk && tk.by_hand && (tk.state === "done" || tk.state === "snooze");
    if (s.waiting && s.alive && !byHand) return "you";
    if (!tk) return null;
    if (tk.state === "you") return "you";
    if (tk.state === "snooze") return taskDue(s) ? "due" : "snooze";
    if (tk.state === "working") return s.alive ? "working" : null;
    if (tk.state === "done") return tk.seen ? null : "done";
    return null;
  }
  function updateTodoBadge() {
    const n = lastSessions.filter((s) => ["you", "due"].includes(taskGroup(s))).length;
    todoBadge.hidden = !n;
    todoBadge.textContent = n > 99 ? "99+" : String(n || "");
  }
  async function taskSet(s, body) {
    try {
      const r = await api(`/sessions/${encodeURIComponent(s.id)}/task`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      s.task = r.task || undefined;
      taskLocal.set(s.id, { seq: ++taskSeq, task: s.task });
      for (const x of lastSessions) if (x.id === s.id) x.task = s.task;
    } catch (e) { alert(e.message); }
    updateTodoBadge();
  }
  function markTaskSeen(s) {
    if (s && !s.owner && s.task && !s.task.seen) {
      s.task.seen = true;
      taskSet(s, { seen: true });
    }
  }
  function snoozeChoices() {
    const at9 = (d) => { d.setHours(9, 0, 0, 0); return d; };
    const now = new Date();
    const tomorrow = at9(new Date(now.getTime() + 86400000));
    const in3 = at9(new Date(now.getTime() + 3 * 86400000));
    const mon = at9(new Date(now.getTime() + ((8 - now.getDay()) % 7 || 7) * 86400000));
    return [[t("明日"), tomorrow], [t("3日後"), in3], [t("来週の月曜"), mon]];
  }
  function fmtUntil(ts) {
    const d = new Date(ts * 1000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function renderTodo() {
    const box = todoModalEl.querySelector(".box");
    const groups = { you: [], due: [], working: [], snooze: [], done: [] };
    for (const s of lastSessions) {
      const g = taskGroup(s);
      if (g) groups[g].push(s);
    }
    const tsOf = (s) => (s.task && s.task.ts) || 0;
    for (const g of Object.values(groups)) g.sort((a, b) => tsOf(b) - tsOf(a));
    groups.snooze.sort((a, b) => (a.task.until || 0) - (b.task.until || 0));
    // Each group with its own mark and colour (2026-11-09, the user: 済みと待ちが
    // 一緒に表示される -- the small grey headings ran together).
    const TITLES = { you: "🙋 " + t("あなたの番"), due: "⏰ " + t("期限が来た寝かせ"), working: "⚙️ " + t("Claude 作業中"),
      snooze: "💤 " + t("待ち(寝かせ)"), done: "✓ " + t("済み(未確認)") };
    box.innerHTML = `
      <div class="head"><h3>✅ ${t("やること")}</h3><a href="/agents/">${t("セッション一覧へ")}</a></div>
      <div class="note">${t("Claude が返事の最後に書く「状態:」で分けています。通知は「あなたの番」と期限が来た寝かせだけです。")}</div>`;
    // Extensions' entries on top (aigwExt todo.extraRows): a link each.
    for (const x of window.aigwExt.extraTodoRows()) {
      const row = document.createElement("a");
      row.className = "item" + (x.className ? " " + x.className : "");
      row.href = x.href || "#";
      row.innerHTML = `<div class="body"><div class="who">${escapeHtml(x.icon ? x.icon + " " : "")}${escapeHtml(x.who || "")}</div><div class="msg">${escapeHtml(x.msg || "")}</div></div>`;
      box.appendChild(row);
    }
    let any = false;
    for (const g of ["you", "due", "working", "snooze", "done"]) {
      if (!groups[g].length) continue;
      any = true;
      const h = document.createElement("div");
      h.className = "group " + g;
      h.textContent = `${TITLES[g]} (${groups[g].length})`;
      box.appendChild(h);
      for (const s of groups[g]) box.appendChild(todoRow(s, g));
    }
    if (!any) box.insertAdjacentHTML("beforeend", `<div class="empty">${t("今やることはありません")}</div>`);
  }
  function todoRow(s, g) {
    const tk = s.task || {};
    const row = document.createElement("div");
    row.className = "item" + (tk.seen === false ? " unseen" : "");
    let what = tk.text || "";
    if (g === "you" && s.waiting && !(tk.state === "you" && tk.prompt)) what = t("確認待ち") + (what ? ` — ${what}` : "");
    else if (g === "you" && !what) what = tk.declared === false ? t("止まりました(状態の申告なし)") : t("要判断");
    const sub = [];
    if (g === "snooze" || g === "due") sub.push("💤 " + fmtUntil(tk.until));
    if (g === "snooze" && !s.alive) sub.push(t("止めてあります(開くと続きから)"));
    if (tk.ts && g !== "snooze") sub.push(fmtStamp(tk.ts));
    // What extensions add to this entry (aigwExt todo.rows): a title in
    // place of the label, link buttons.
    const extra = window.aigwExt.todoRows(s);
    const extraTitle = (extra.find((x) => x && x.title) || {}).title;
    row.innerHTML = `
      <a class="body" href="/agents/#${encodeURIComponent(s.id)}">
        <div class="who">${typeIcon(s)}${escapeHtml(extraTitle || s.label)}</div>
        ${what ? `<div class="msg">${escapeHtml(what)}</div>` : ""}
        ${sub.length ? `<div class="when">${escapeHtml(sub.join(" · "))}</div>` : ""}
      </a>`;
    const btns = document.createElement("span");
    btns.className = "btns";
    const add = (label, title, fn) => {
      const b = document.createElement("button");
      b.textContent = label; b.title = title;
      b.addEventListener("click", async (e) => { e.preventDefault(); await fn(); renderTodo(); });
      btns.appendChild(b);
    };
    for (const x of extra) {
      if (!x || !x.href) continue;
      const a = document.createElement("a");
      a.href = x.href; a.textContent = x.icon || "↗"; if (x.tip) a.title = x.tip;
      btns.appendChild(a);
    }
    // ✓ (2026-11-10, the user): the row turns green and folds away, and an
    // 8-second "元に戻す" (as after 🗄) puts the task back exactly as it was.
    const check = (label, body, said) => {
      const b = document.createElement("button");
      b.textContent = "✓"; b.title = label; b.className = "check";
      b.addEventListener("click", async (e) => {
        e.preventDefault();
        const before = s.task ? JSON.parse(JSON.stringify(s.task)) : null;
        row.style.maxHeight = row.offsetHeight + "px";
        void row.offsetHeight;
        row.classList.add("checked");
        await taskSet(s, body);
        showUndoToast(t(said, { label: s.label }), async () => {
          try {
            const r = await api(`/sessions/${encodeURIComponent(s.id)}/task`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: before }),
            });
            s.task = r.task || undefined;
            taskLocal.set(s.id, { seq: ++taskSeq, task: s.task });
            for (const x of lastSessions) if (x.id === s.id) x.task = s.task;
          } catch (err) { alert(err.message); }
          updateTodoBadge();
          renderTodo();
          showUndoToast(t("「{label}」を元に戻しました", { label: s.label }), false);
        });
        setTimeout(() => {
          const cur = lastSessions.find((x) => x.id === s.id);
          if (cur && cur !== s) cur.task = s.task;
          if (todoShown) renderTodo();
        }, 850);
      });
      btns.appendChild(b);
    };
    if (g !== "done") check(t("済みにする"), { state: "done" }, "「{label}」を済みにしました");
    else check(t("確認した"), { seen: true }, "「{label}」を確認済みにしました");
    if (g === "you" || g === "due" || g === "done") {
      add("💤", t("寝かせる"), async () => {
        const ch = snoozeChoices();
        const ans = prompt(t("いつまで寝かせますか") + "\n" + ch.map((c, i) => `${i + 1}: ${c[0]} (${fmtUntil(c[1] / 1000)})`).join("\n")
          + "\n" + t("または 月/日 [時:分]"), "1");
        if (ans == null) return;
        let when = null;
        const k = parseInt(ans, 10);
        if (/^\d$/.test(ans.trim()) && ch[k - 1]) when = ch[k - 1][1];
        const m = ans.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
        if (m) {
          const now = new Date();
          when = new Date(now.getFullYear(), +m[1] - 1, +m[2], m[3] ? +m[3] : 9, m[4] ? +m[4] : 0);
          if (when < now) when.setFullYear(when.getFullYear() + 1);
        }
        if (!when) return alert(t("日付が読めませんでした"));
        await taskSet(s, { state: "snooze", until: when.getTime() / 1000 });
      });
    }
    if (g === "snooze") add("⏰", t("今やる"), () => taskSet(s, { state: "you" }));
    row.appendChild(btns);
    return row;
  }
  async function loadTodo(light) {
    // The extensions' own parts of this list need them loaded (/todo
    // opened directly starts before they are).
    if (extLoaded) await extLoaded;
    await Promise.all([
      refreshSessions({ light: !!light }).catch(() => {}),
      ...window.aigwExt.loadAll(),
    ]);
    renderTodo();
  }
  // In the same page (2026-11-08, after trying voice mode): a new page has
  // no user activation, so the browser would not let voice mode speak there.
  // ✅ and the entries still are links (/todo, /agents/#<id>; a middle click
  // or a new tab works as before), but a plain click switches the view here
  // and moves the URL with history.pushState; Back returns.
  let todoShown = false;
  let todoPushed = false;
  let todoAfterPop = null;
  const plainClick = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  function showTodoView(push) {
    if (todoShown) { loadTodo(true); return; }
    const show = () => {
      todoShown = true;
      if (push) { history.pushState({ aigw: "todo" }, "", "/todo"); todoPushed = true; }
      document.body.classList.add("todo-page");
      document.title = t("やること") + " - aigw";
      // At once from the list this page already has (2026-11-10, the user:
      // やることが確認中で結構待ちます), then again when the fresh one arrives.
      // "確認中…" only when there is no list yet (/todo opened directly).
      if (lastSessions.length) renderTodo();
      else todoModalEl.querySelector(".box").innerHTML = `<div class="empty">${t("確認中…")}</div>`;
      todoModalEl.hidden = false;
      loadTodo(true);
    };
    const afterOverlay = () => {
      if (currentSessionId) {
        // Closing pops the session's own history entry (async): show after.
        closeSession();
        setTimeout(show, 120);
      } else show();
    };
    // Something an extension shows over the page (aigwExt closeOverlay)
    // goes first.
    if (!window.aigwExt.closeOverlay(() => setTimeout(afterOverlay, 0))) afterOverlay();
  }
  function hideTodoView(then) {
    if (!todoShown) { if (then) then(); return; }
    const done = () => {
      todoShown = false;
      document.body.classList.remove("todo-page");
      document.title = `aigw (${SHORT_HOSTNAME})`;
      todoModalEl.hidden = true;
      refreshSessions().catch(() => {});
      if (then) then();
    };
    if (todoPushed) { todoPushed = false; todoAfterPop = done; history.back(); }
    else { history.replaceState(null, "", "/agents/"); done(); }
  }
  window.addEventListener("popstate", () => {
    if (window.aigwExt.back()) return;
    const onTodo = /\/todo\/?$/.test(location.pathname);
    if (todoAfterPop) { const f = todoAfterPop; todoAfterPop = null; f(); return; }
    if (onTodo && !todoShown) showTodoView(false);
    else if (!onTodo && todoShown) { todoPushed = false; hideTodoView(); }
  });
  document.getElementById("todo-btn").addEventListener("click", (e) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    showTodoView(true);
  });
  todoModalEl.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a || !plainClick(e)) return;
    const href = a.getAttribute("href") || "";
    const m = /^\/agents\/#([0-9a-f]{8,32})$/.exec(href);
    if (m) {
      e.preventDefault();
      const meta = lastSessions.find((x) => x.id === m[1]);
      if (!meta) return;
      // On top of /todo, not instead of it: Back closes the session and the
      // popstate below shows the list again.
      todoShown = false;
      document.body.classList.remove("todo-page");
      document.title = `aigw (${SHORT_HOSTNAME})`;
      todoModalEl.hidden = true;
      openSession(meta);
    } else if (href === "/agents/") {
      e.preventDefault();
      hideTodoView();
    }
  });
  if (TODO_PAGE) {
    // After the rest of this file has run (its let/const below are not
    // ready yet while this block executes).
    setTimeout(() => showTodoView(false), 0);
  }
  setInterval(() => { if (todoShown && document.visibilityState === "visible") loadTodo(true); }, 30000);
  document.addEventListener("visibilitychange", () => { if (todoShown && document.visibilityState === "visible") loadTodo(true); });

  // Everyone's Claude / Codex logins (the deployment notes): read-only, no
  // buttons. root's own row only while this user's root window is open
  // (the server decides).
  const loginsModalEl = document.getElementById("logins-modal");
  loginsModalEl.addEventListener("click", (e) => { if (e.target === loginsModalEl) loginsModalEl.hidden = true; });
  document.getElementById("login-list-btn").addEventListener("click", async () => {
    const box = loginsModalEl.querySelector(".box");
    box.innerHTML = `<h3>👥 ${t("全員のログイン一覧")}</h3><div class="note">${t("確認中…")}</div>`;
    loginsModalEl.hidden = false;
    let data;
    try {
      data = await api("/logins");
    } catch (e) {
      box.innerHTML = `<h3>👥 ${t("全員のログイン一覧")}</h3><div class="note">${escapeHtml(e.message)}</div><button class="close">${t("閉じる")}</button>`;
      box.querySelector(".close").addEventListener("click", () => { loginsModalEl.hidden = true; });
      return;
    }
    const cell = (v) => {
      if (!v) return `<td class="off"></td>`;
      if (!v.logged_in) return `<td class="off">${t("未ログイン")}</td>`;
      const who = v.email ? escapeHtml(v.email) : escapeHtml(v.method || t("ログイン済み"));
      const sub = [v.org, v.plan, v.email ? v.method : null].filter(Boolean).map(escapeHtml).join(" · ");
      return `<td>${who}${sub ? `<div class="sub">${sub}</div>` : ""}</td>`;
    };
    const rows = (data.users || []).map((u) => {
      const sc = u.scopes || {};
      return `<tr><td>${escapeHtml(u.user)}</td>${cell(sc.sandbox?.claude)}${cell(sc.host?.claude)}${cell(sc.email?.claude)}${cell(sc.sandbox?.codex)}${cell(sc.host?.codex)}</tr>`;
    }).join("") + (data.root ? `<tr><td>root</td>${cell(data.root.scopes?.root?.claude)}<td class="off"></td><td class="off"></td>${cell(data.root.scopes?.root?.codex)}<td class="off"></td></tr>` : "");
    box.innerHTML = `
      <h3>👥 ${t("全員のログイン一覧")}</h3>
      <div class="note">${t("見るだけの一覧です(ここからは変えられません)。root の行は、root の解錠中だけ出ます(root の列は Claude・Codex の sandbox の欄に出します)。ssh 先のマシンのログインは含みません。")}</div>
      <table>
        <tr><th>${t("ユーザー")}</th><th>Claude (sandbox)</th><th>Claude (${t("ホスト")})</th><th>Claude (Email)</th><th>Codex (sandbox)</th><th>Codex (${t("ホスト")})</th></tr>
        ${rows}
      </table>
      <button class="close">${t("閉じる")}</button>`;
    box.querySelector(".close").addEventListener("click", () => { loginsModalEl.hidden = true; });
  });

  // Sharing a whole folder (the deployment notes): every session in it and
  // in the folders under it, now and later, with the limits sharing one
  // session has (a root shell read-only; Email never this way).
  const folderShareEl = document.getElementById("folder-share");
  folderShareEl.addEventListener("click", (e) => { if (e.target === folderShareEl) folderShareEl.hidden = true; });
  function openFolderShare(id) {
    const f = folderById(id);
    if (!f) { folderShareEl.hidden = true; return; }
    const box = folderShareEl.querySelector(".box");
    const modeLabel = (m) => (m === "read" ? t("閲覧のみ") : t("共同作業"));
    const entries = [
      ...(f.shared_read || []).map((u) => ({ u, m: "read" })),
      ...(f.shared_with || []).map((u) => ({ u, m: "write" })),
    ];
    box.innerHTML = `
      <h3>👥 ${t("フォルダ「{name}」を共有", { name: escapeHtml(f.name) })}</h3>
      <div class="share-note">${t("中のセッションすべて(下のフォルダ、あとから入れたものも)が共有されます。root のシェルは閲覧のみ、Email はフォルダでは共有されません。閲覧のみ: チャットのログだけが見えます。")}</div>
      ${entries.length ? entries.map(({ u, m }) => `
        <div class="share-row" data-user="${escapeHtml(u)}">
          <span>${u === "*" ? t("全員") : escapeHtml(u)} &middot; ${modeLabel(m)}</span>
          <button class="unshare-btn">${t("解除")}</button>
        </div>`).join("") : `<div class="share-empty">${t("まだ誰とも共有していません")}</div>`}
      <div class="share-add">
        <select class="target"><option value="*">${t("全員")}</option><option value="user">${t("ユーザーを指定")}</option></select>
        <input type="text" class="username" placeholder="${t("ユーザー名")}" autocapitalize="off" autocorrect="off" hidden>
        <select class="mode"><option value="read">${t("閲覧のみ")}</option><option value="write" disabled>${t("共同作業")}</option></select>
        <button class="add">${t("共有する")}</button>
      </div>
      <button class="close">${t("閉じる")}</button>`;
    const targetEl = box.querySelector(".target"), userEl = box.querySelector(".username"), modeEl = box.querySelector(".mode");
    targetEl.addEventListener("change", () => {
      const everyone = targetEl.value === "*";
      userEl.hidden = everyone;
      modeEl.querySelector('option[value="write"]').disabled = everyone;
      if (everyone) modeEl.value = "read";
    });
    const run = async (op) => {
      try { await saveFolders([op]); } catch (e) {}
      openFolderShare(id);
    };
    box.querySelectorAll(".unshare-btn").forEach((b) => b.addEventListener("click", () =>
      run({ op: "unshare", id, username: b.closest(".share-row").dataset.user })));
    box.querySelector(".add").addEventListener("click", () => {
      const username = targetEl.value === "user" ? userEl.value.trim() : "*";
      if (username) run({ op: "share", id, username, mode: modeEl.value });
    });
    box.querySelector(".close").addEventListener("click", () => { folderShareEl.hidden = true; });
    folderShareEl.hidden = false;
  }
  // ＋ → このフォルダで新しいセッション: the bar above the list says where
  // it goes; 開始 sends the folder, and the backend starts it in the
  // folder's 作業フォルダ (made if missing) and files it there.
  let newSessionFolder = null;
  const nsbFolderEl = document.getElementById("nsb-folder");
  function setNewSessionFolder(id) {
    newSessionFolder = id && folderById(id) ? id : null;
    nsbFolderEl.hidden = !newSessionFolder;
    nsbFolderEl.innerHTML = "";
    if (!newSessionFolder) return;
    const wd = folderEffectiveWorkdir(id);
    const span = document.createElement("span");
    span.textContent = "📁 " + folderById(id).name + (wd ? " · " + t("作業フォルダ ~/{dir}", { dir: wd }) : "");
    const x = document.createElement("button");
    x.textContent = "✕";
    x.title = t("フォルダの指定をやめる");
    x.addEventListener("click", () => setNewSessionFolder(null));
    nsbFolderEl.append(span, x);
    viewList.scrollTop = 0;
    document.getElementById("label").focus();
  }
  async function deleteFolder(f) {
    const subs = childFolders(f.id).length;
    const inside = lastSessions.filter((s) => !s.owner && folderOfSession(s) === f.id).length;
    if (subs || inside) {
      alert(t("「{name}」は空ではないので消せません(フォルダ {f} 個、セッション {n} 件。アーカイブしたものも含みます)", { name: f.name, f: subs, n: inside }));
      return;
    }
    if (!confirm(t("フォルダ「{name}」を消しますか?", { name: f.name }))) return;
    folderDoc.folders = folderDoc.folders.filter((x) => x.id !== f.id);
    openFolders.delete(f.id);
    saveOpenFolders();
    await saveFolders([{ op: "delete", id: f.id }]);
  }
  async function archiveFolder(f, archived) {
    f.archived = archived;
    await saveFolders([{ op: "put", folder: { id: f.id, archived } }]);
    if (archived) {
      archiveUndoStack.push({ id: f.id, label: f.name, folder: true });
      if (archiveUndoStack.length > 50) archiveUndoStack.shift();
      showUndoToast(t("フォルダ「{label}」をアーカイブしました", { label: f.name }), true);
    }
  }
  // Stop: every running own session under it (this machine's, not archived).
  async function stopFolder(f) {
    const list = sessionsInSubtree(f.id, lastVisibleSessions.filter((s) => !s.owner && !s.archived && s.alive));
    if (!list.length) return;
    if (!confirm(t("「{name}」の中の {n} 件のセッションを停止しますか?(Claude が動いていれば会話を残してから終わらせます)", { name: f.name, n: list.length }))) return;
    const stopped = [];
    const failed = [];
    await runLimited(list, 3, async (s) => {
      try {
        await withUnlockRetry(() => api(sessionPath(s.id, "/stop", null), { method: "POST" }));
        stopped.push(s.id);
      } catch (e) {
        failed.push(`${s.label}: ${e.message}`);
      }
    });
    f.last_stopped = stopped;
    await saveFolders([{ op: "put", folder: { id: f.id, last_stopped: stopped } }]);
    if (failed.length) alert(t("停止できなかったもの:") + "\n" + failed.join("\n"));
    await refreshSessions();
  }
  function folderResumable(f) {
    const ids = new Set(f.last_stopped || []);
    return lastVisibleSessions.filter((s) => ids.has(s.id) && !s.owner && !s.alive);
  }
  // Resume: only what this folder's last stop stopped, two at a time.
  async function resumeFolder(f) {
    let list = folderResumable(f);
    if (!list.length) return;
    if (!confirm(t("「{name}」で前回停止した {n} 件を再開しますか?", { name: f.name, n: list.length }))) return;
    if (list.some((s) => s.locked)) {
      try {
        await unlockAndRefresh(lockedTierFor(list.filter((s) => s.locked)));
      } catch (e) {
        alert(e.message);
        return;
      }
      list = folderResumable(f);
    }
    const failed = [];
    await runLimited(list, 2, async (s) => {
      if (!canResumeEnded(s)) { failed.push(`${s.label}: ${t("再開できない種類です")}`); return; }
      try {
        await withUnlockRetry(() => api("/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resumeBody(s)),
        }));
      } catch (e) {
        failed.push(`${s.label}: ${e.message}`);
      }
    });
    f.last_stopped = [];
    await saveFolders([{ op: "put", folder: { id: f.id, last_stopped: [] } }]);
    if (failed.length) alert(t("再開できなかったもの:") + "\n" + failed.join("\n"));
    await refreshSessions();
  }
  async function runLimited(items, n, fn) {
    const queue = [...items];
    await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift());
    }));
  }

  function indentRow(row, depth) {
    if (depth) row.style.marginLeft = `${Math.min(depth, 8) * 0.9}rem`;
  }
  function makeFolderRow(f, depth, list) {
    const inside = sessionsInSubtree(f.id, list);
    const alive = inside.filter((s) => s.alive).length;
    const waiting = inside.filter((s) => s.waiting).length;
    const open = openFolders.has(f.id);
    // A built-in folder (aigwExt folders): its own label, a drag handle only
    // if it says so, and only ＋ for a folder inside it.
    const builtin = window.aigwExt.folder(f.id);
    const row = document.createElement("div");
    row.className = "session-row folder-row";
    row.dataset.folderId = f.id;
    if (f.workdir) row.title = t("作業フォルダ ~/{dir}", { dir: f.workdir });
    row.innerHTML = `
      <div class="folder-main">
        ${builtin && !builtin.draggable ? "" : `<span class="drag-handle" title="${t("ドラッグで移動")}">⠿</span>`}
        <span class="dot ${alive ? "alive" : "stopped"}"></span>
        <span class="label">${open ? "▾" : "▸"} ${builtin ? escapeHtml(builtin.label || f.name) : "📁 " + escapeHtml(f.name)}</span>
        <span class="meta">${inside.length}</span>${waiting ? `<span class="waiting-badge">${t("確認待ち")}${waiting}</span>` : ""}${(f.shared_with || []).length || (f.shared_read || []).length ? `<span class="meta" title="${t("フォルダごと共有中")}">👥</span>` : ""}${f.workdir ? `<span class="workdir">~/${escapeHtml(f.workdir)}</span>` : ""}
      </div>`;
    indentRow(row, depth);
    row.addEventListener("click", () => {
      if (open) openFolders.delete(f.id); else openFolders.add(f.id);
      saveOpenFolders();
      renderSessionList();
    });
    const handle = row.querySelector(".drag-handle");
    if (handle) wireSessionDrag(handle, row);
    const dot = row.querySelector(".dot");
    if (alive) {
      dot.classList.add("stoppable");
      dot.title = t("タップで中のセッションをすべて停止");
      dot.addEventListener("click", (e) => { e.stopPropagation(); stopFolder(f); });
    } else if (folderResumable(f).length) {
      dot.classList.add("resumable");
      dot.title = t("タップで前回停止したものを再開");
      dot.addEventListener("click", (e) => { e.stopPropagation(); resumeFolder(f); });
    }
    const btn = (cls, text, title, fn) => {
      const b = document.createElement("button");
      b.className = cls;
      b.textContent = text;
      b.title = title;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      row.appendChild(b);
    };
    if (builtin) {
      btn("edit-btn", "＋", t("この中にフォルダを作る"), () => createFolder(f.id));
    } else {
      btn("edit-btn", "＋", t("新しいセッション・フォルダ"), () => {});
      row.lastChild.onclick = (e) => { e.stopPropagation(); showFolderMenu(e.currentTarget, [
        [t("このフォルダで新しいセッション"), () => setNewSessionFolder(f.id)],
        [t("この中にフォルダを作る"), () => createFolder(f.id)],
      ]); };
      btn("edit-btn", "✏️", t("名前・作業フォルダ"), () => {});
      row.lastChild.onclick = (e) => { e.stopPropagation(); showFolderMenu(e.currentTarget, [
        [t("名前を変更"), () => renameFolder(f)],
        [t("作業フォルダを設定"), () => setFolderWorkdir(f)],
        [t("フォルダごと共有…"), () => openFolderShare(f.id)],
      ]); };
      btn("archive-btn", "🗄", t("フォルダごとアーカイブ"), () => archiveFolder(f, true));
      if (!childFolders(f.id).length && !lastSessions.some((s) => !s.owner && folderOfSession(s) === f.id)) {
        btn("delete-btn", "🗑", t("空のフォルダを消す"), () => deleteFolder(f));
      }
    }
    return row;
  }

  function renderSessionList() {
    if (dragState) return;
    const visible = lastVisibleSessions;
    const main = visible.filter((s) => !s.archived && !s.owner && !folderHidden(folderOfSession(s)));
    sessionsEl.innerHTML = "";
    const walk = (pid, depth, path) => {
      for (const f of childFolders(pid)) {
        if (f.archived) continue;
        // A built-in folder that says so is shown only once it has
        // something in it (aigwExt folders, hideWhenEmpty).
        const spec = window.aigwExt.folder(f.id);
        if (spec && spec.hideWhenEmpty && !childFolders(f.id).length
            && !lastSessions.some((s) => !s.owner && folderOfSession(s) === f.id)) continue;
        const row = makeFolderRow(f, depth, main);
        row.dataset.path = path.join("/");
        sessionsEl.appendChild(row);
        if (openFolders.has(f.id)) walk(f.id, depth + 1, [...path, f.id]);
      }
      for (const s of main) {
        if (folderOfSession(s) !== pid) continue;
        const row = makeSessionRow(s);
        row.dataset.path = path.join("/");
        indentRow(row, depth);
        sessionsEl.appendChild(row);
      }
    };
    walk(null, 0, []);
    // Archive: the same folder tree (fillArchivedFolders), with archived
    // sessions in no folder at its top level; those in a built-in folder
    // with an archive of its own (ownArchive) in that list.
    const archivedOwn = visible.filter((s) => s.archived && !s.owner && !folderHidden(folderOfSession(s)));
    extArchived.clear();
    for (const f of window.aigwExt.folders()) {
      if (f.ownArchive && folderById(f.id)) extArchived.set(f.id, archivedOwn.filter((s) => folderOfSession(s) === f.id));
    }
    lastArchivedSessions = archivedOwn.filter((s) => !extArchived.has(folderOfSession(s)));
    lastArchivedFolders = folderDoc.folders.filter((f) => f.archived && !folderHidden(f.parent));
    renderArchivedSection();
  }
  let lastArchivedFolders = [];
  document.getElementById("new-folder-btn").addEventListener("click", () => createFolder(null));

  // The archive as a tree (the deployment notes; 2026-11-04, at the user's
  // request: a session archived out of a folder goes "into the same folder
  // structure inside the archive"). Nothing is stored for this: an archived
  // session keeps its folder, so the archive shows, under the same folders,
  //  - every archived session, and
  //  - every archived folder with all it holds (📤 brings it back).
  // A folder appears only when something archived is under it; a folder that
  // is not itself archived has no 📤 (it is only the way to its contents).
  function fillArchivedFolders(listEl) {
    const all = lastVisibleSessions.filter((s) => !s.owner);
    // What a folder shows directly: everything in an archived folder, only
    // the archived sessions in one that is not.
    const shownIn = (f) => all.filter((s) => folderOfSession(s) === f.id && (s.archived || folderHidden(f.id)));
    const count = new Map();
    const countOf = (f) => {
      if (count.has(f.id)) return count.get(f.id);
      let n = shownIn(f).length;
      for (const sub of childFolders(f.id)) n += countOf(sub);
      count.set(f.id, n);
      return n;
    };
    const anyArchived = (f) => folderHidden(f.id) || childFolders(f.id).some(anyArchived);
    const walk = (pid, depth) => {
      for (const f of childFolders(pid)) {
        if (extArchived.has(f.id)) continue; // it has its own archive list
        const n = countOf(f);
        if (!n && !anyArchived(f)) continue;
        const open = openArchivedFolders.has(f.id);
        const row = document.createElement("div");
        row.className = "session-row folder-row";
        row.dataset.folderId = f.id;
        row.innerHTML = `
        <div class="folder-main">
          <span class="label">${open ? "▾" : "▸"} 📁 ${escapeHtml(f.name)}</span>
          <span class="meta">${n}</span>
        </div>`;
        indentRow(row, depth);
        row.addEventListener("click", () => {
          if (open) openArchivedFolders.delete(f.id); else openArchivedFolders.add(f.id);
          renderArchivedSection();
        });
        if (f.archived && !folderHidden(f.parent)) {
          const btn = document.createElement("button");
          btn.className = "archive-btn";
          btn.textContent = "📤";
          btn.title = t("フォルダごとアーカイブから戻す");
          btn.addEventListener("click", (e) => { e.stopPropagation(); archiveFolder(f, false); });
          row.appendChild(btn);
        }
        listEl.appendChild(row);
        if (!open) continue;
        walk(f.id, depth + 1);
        const sub = document.createElement("div");
        fillArchivedList(sub, shownIn(f));
        for (const r of [...sub.children]) { indentRow(r, depth + 1); listEl.appendChild(r); }
      }
    };
    walk(null, 0);
  }

  function makeSessionRow(s) {
    const row = document.createElement("div");
    row.className = "session-row";
    row.dataset.sessionId = s.id;
    // s.owner is only ever present on a /shared-with-me
    // entry -- shown as a badge so a shared session is never mistaken for
    // one's own, since it can be co-worked (messages/keys/stop) but not
    // renamed/deleted/archived from here (owner-only, see aigw-backend).
    const ownerBadge = s.owner ? ` &middot; ${t("{owner}さんと共有", { owner: escapeHtml(s.owner) })}` : "";
    row.innerHTML = `
      <div>
        <span class="drag-handle" title="${t("ドラッグで並べ替え")}">⠿</span>
        <span class="dot ${s.alive ? "alive" : "stopped"}"></span>
        <span class="label">${typeIcon(s)}${screenBadge(s)}${escapeHtml(s.label)}${waitingBadge(s)}</span>
        <div class="meta">${cwdPrefix(s)}${fmtTime(s.created_ts)}${ownerBadge}${issueSuffix(s)}${linkSuffix(s)}</div>
      </div>`;
    row.addEventListener("click", () => (s.locked ? openLockedSession(s) : openSession(s)));
    wireSessionDrag(row.querySelector(".drag-handle"), row);
    // Tapping an ended session's grey dot offers to resume it (2026-10-09,
    // user request: "灰色のスイッチを押したら、再開するか確認して、OKなら再開") --
    // instead of a separate ↻ button. Only one's own, resumable sessions
    // (a locked row carries no conversation id, so never qualifies).
    if (!s.alive && !s.owner && canResumeEnded(s)) {
      const dot = row.querySelector(".dot");
      dot.classList.add("resumable");
      dot.title = t("タップで再開");
      dot.addEventListener("click", (e) => {
        e.stopPropagation(); // don't also open the ended session
        resumeEndedSession(s);
      });
    } else if (s.alive && !s.owner && !s.locked) {
      // ...and a running one's green dot offers to stop it, the same as
      // the chat header's dot.
      const dot = row.querySelector(".dot");
      dot.classList.add("stoppable");
      dot.title = t("タップで停止");
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        stopSessionConfirmed(s.id, null, false);
      });
    }

    if (!s.owner) {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.textContent = "✏️";
      editBtn.title = t("名前を変更");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // don't also open the session
        renameSession(s);
      });
      row.appendChild(editBtn);

      const linkBtn = document.createElement("button");
      linkBtn.className = "link-btn" + (linkArmedSessionId === s.id ? " armed" : "");
      linkBtn.textContent = "🔗";
      linkBtn.title = s.link ? t("連携中(「{label}」)-- タップで切断", { label: s.link.partner_label }) : t("他のセッションとつなぐ");
      linkBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // don't also open the session
        onLinkButtonTapped(s);
      });
      row.appendChild(linkBtn);

      const archiveBtn = document.createElement("button");
      archiveBtn.className = "archive-btn";
      archiveBtn.textContent = "🗄";
      archiveBtn.title = t("アーカイブへ移動");
      archiveBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // don't also open the session
        archiveSession(s);
      });
      row.appendChild(archiveBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "delete-btn";
      delBtn.textContent = "🗑";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // don't also open the session
        deleteSession(s);
      });
      row.appendChild(delBtn);
    }

    return row;
  }

  // The periodic refreshes (the list every 20 s, やること every 30 s) ask
  // for the sessions without the archived ones (2026-11-10, the deployment notes:
  // they were ~80% of the list's bytes) and reuse the archived ones of the
  // last full answer. Every other refresh -- after archiving, unarchiving,
  // opening, any action -- is a full one, and so is a periodic one when the
  // full copy is older than ARCHIVED_REUSE_MS.
  const ARCHIVED_REUSE_MS = 5 * 60 * 1000;
  let archivedCopy = null;
  let archivedCopyAt = 0;
  // A light refresh while another refresh is still on its way rides on that
  // one instead of asking again (2026-11-10, the deployment notes: going from a
  // session to やること asked for the whole list three times in 4 s). A full
  // one -- after an action, whose result it must show -- always asks anew.
  let refreshInFlight = null;
  function refreshSessions(opts) {
    if (opts && opts.light && refreshInFlight) return refreshInFlight;
    const p = refreshSessionsNow(opts);
    refreshInFlight = p;
    const clear = () => { if (refreshInFlight === p) refreshInFlight = null; };
    p.then(clear, clear);
    return p;
  }
  async function refreshSessionsNow(opts) {
    const editSeq = listEditSeq;
    const tseq = taskSeq;
    const light = !!(opts && opts.light) && archivedCopy !== null && Date.now() - archivedCopyAt < ARCHIVED_REUSE_MS;
    const fetchedAt = Date.now();
    const [{ sessions: fetched }, sharedSessions, order, folders] = await Promise.all([
      api(light ? "/sessions?archived=0" : "/sessions"),
      api("/shared-with-me").then((r) => r.sessions).catch(() => []),
      api("/session-order").then((r) => r.order).catch(() => sessionOrder),
      api("/folders").catch(() => folderDoc),
    ]);
    // A drag saved while this was in flight: what came back is older than
    // what this page already has (2026-11-04, the user: drags sometimes
    // "did not take" -- a list refresh racing the save put them back).
    if (editSeq === listEditSeq && !folderSaving && !orderSaving) {
      sessionOrder = order;
      folderDoc = folders;
    }
    // owner is absent (falsy) on every entry from /sessions (one's own) and
    // set to the owning username on every /shared-with-me entry -- the same
    // field openSession() reads into currentOwner.
    let ownSessions = fetched;
    if (light) {
      // Unarchived since (another tab, another device): it came back in
      // the answer, so its archived copy is dropped.
      const ids = new Set(fetched.map((x) => x.id));
      ownSessions = fetched.concat(archivedCopy.filter((x) => !ids.has(x.id)));
    } else {
      archivedCopy = fetched.filter((x) => x.archived);
      archivedCopyAt = fetchedAt;
    }
    const merged = [...ownSessions, ...sharedSessions];
    for (const x of merged) {
      const o = taskLocal.get(x.id);
      if (o && o.seq > tseq) x.task = o.task;
    }
    // Currently-running sessions first (2026-08-15, at the user's request);
    // among those, newest-started first, since "which one is still going"
    // matters more than when it started. Among the rest, most-recently-
    // *ended* first (aigw-backend's ended_ts, set wherever meta["stopped"]
    // becomes true) rather than created_ts -- a session started long ago
    // but finished a minute ago belongs near the top, not buried under
    // everything created more recently but finished earlier. ended_ts can be
    // missing on older sessions from before this field existed; created_ts
    // is the closest fallback. This is only the fallback baseline now --
    // applyCustomOrder() below layers the user's own drag order on top.
    merged.sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      // sort_ts: a resumed session keeps the place of the one it replaced
      // (aigw-backend create_session, 2026-11-01).
      if (a.alive) return (b.sort_ts ?? b.created_ts) - (a.sort_ts ?? a.created_ts);
      return (b.ended_ts ?? b.created_ts) - (a.ended_ts ?? a.created_ts);
    });
    const sessions = applyCustomOrder(merged, sessionOrder);
    // Kept unfiltered so a drag's saveSessionOrder() can merge the visible
    // (machine-filtered) subset's new order back without losing the
    // relative position of sessions the filter is currently hiding.
    lastSessions = sessions;
    try { updateTodoBadge(); } catch (e) {}  // the deployment notes (not yet set up on the very first list)
    // Filtered by the header's machine selector -- the full unfiltered list
    // is still returned below so init()'s hash-restore can find a session
    // that belongs to a machine other than the one currently selected.
    // Archived sessions are excluded from this
    // main list -- they still count towards the drag-order/machine-filter
    // bookkeeping via `sessions`/`lastSessions` above, only the rendering
    // splits them out into #archived-list below.
    const visible = sessions.filter((s) => sessionMachine(s) === currentMachine);
    const lockedRows = visible.filter((s) => s.locked && !s.archived);
    lockedListTier = lockedTierFor(lockedRows);
    lockedListTextEl.textContent =
      t("🔒 {n} 件のセッションは、パスキーで解錠するまで名前を隠しています", { n: lockedRows.length });
    lockedListBarEl.hidden = lockedRows.length === 0;
    lockedListBarEl.style.display = lockedRows.length === 0 ? "none" : "flex";
    lastVisibleSessions = visible;
    // The main list as a folder tree, and the archive (the deployment notes).
    renderSessionList();
    // Not filtered by the machine selector: a shared log is found by its
    // owner, not by where it ran.
    lastSharedSessions = sessions.filter((s) => s.owner);
    renderSharedSection();
    updatePatrolBar();
    return sessions;
  }

  // Patrol (the deployment notes, 2026-11-04, at the user's request): ◀ ▶ under the
  // chat header go to the previous/next session without the list -- every
  // non-archived own session of the selected machine in list order (the
  // folder tree's order, open or not), folders ignored, wrapping around. The
  // filter narrows it to running or "確認待ち" ones. Locked rows are left
  // out (a passkey prompt would stop the round). Moving does not add browser
  // history: Back still returns to the list (see sessionHistoryPushed).
  const patrolBarEl = document.getElementById("patrol-bar");
  const patrolPosEl = document.getElementById("patrol-pos");
  const patrolFilterEl = document.getElementById("patrol-filter");
  const PATROL_FILTER_KEY = "aigw-patrol-filter";
  try { patrolFilterEl.value = localStorage.getItem(PATROL_FILTER_KEY) || "all"; } catch (e) {}
  if (!patrolFilterEl.value) patrolFilterEl.value = "all";
  function patrolBase() {
    const own = lastSessions.filter((s) => sessionMachine(s) === currentMachine && !s.archived && !s.owner && !s.locked
      && !folderHidden(folderOfSession(s)));
    return treeOrder(own);
  }
  function patrolPasses(s) {
    const f = patrolFilterEl.value;
    return f === "alive" ? !!s.alive : f === "waiting" ? !!s.waiting
      : f === "you" ? ["you", "due"].includes(taskGroup(s)) : true;
  }
  // A tap on the chat title opens and closes the bar (2026-11-04, user
  // request); kept in this browser, open at first.
  const PATROL_OPEN_KEY = "aigw-patrol-open";
  let patrolOpen = true;
  try { patrolOpen = localStorage.getItem(PATROL_OPEN_KEY) !== "0"; } catch (e) {}
  chatLabelEl.title = t("タップで巡回のバーを開閉");
  chatLabelEl.addEventListener("click", () => {
    if (!currentSessionId) return;
    patrolOpen = !patrolOpen;
    try { localStorage.setItem(PATROL_OPEN_KEY, patrolOpen ? "1" : "0"); } catch (e) {}
    updatePatrolBar();
  });
  const patrolFolderEl = document.getElementById("patrol-folder");
  function updatePatrolBar() {
    if (!patrolBarEl) return;
    const show = !!currentSessionId && !currentOwner && !isLoginPreset(currentPreset) && patrolOpen;
    patrolBarEl.hidden = !show;
    if (!show) return;
    const list = patrolBase().filter(patrolPasses);
    const i = list.findIndex((s) => s.id === currentSessionId);
    patrolPosEl.textContent = `${i >= 0 ? i + 1 : "–"}/${list.length}`;
    // Where it sits in the list's folders (2026-11-05, at the user's request).
    const cur = lastSessions.find((s) => s.id === currentSessionId && !s.owner);
    const fid = cur ? folderOfSession(cur) : null;
    const path = fid ? folderAncestors(fid).reverse().map((x) => folderById(x)?.name || "").filter(Boolean) : [];
    patrolFolderEl.textContent = "📁 " + (path.length ? path.join(" / ") : t("(フォルダなし)"));
  }
  function patrolTarget(dir) {
    const base = patrolBase();
    const n = base.length;
    let at = base.findIndex((s) => s.id === currentSessionId);
    if (at < 0) at = dir > 0 ? -1 : 0;
    for (let k = 1; k <= n; k++) {
      const s = base[(((at + dir * k) % n) + n) % n];
      if (s.id !== currentSessionId && patrolPasses(s)) return s;
    }
    return null;
  }
  async function patrolGo(dir) {
    if (!currentSessionId) return;
    await refreshSessions().catch(() => null);
    const s = patrolTarget(dir);
    if (s) { openSession(s); return; }
    showUndoToast(t("ほかに該当するセッションはありません"), false);
  }
  // 🗄 / 🗑 in the patrol bar (2026-11-05, at the user's request): act on the
  // session being shown, then go on to the next one (back to the list when
  // there is none). The undo toast/Ctrl+Z still covers the archive.
  async function patrolAct(kind) {
    const id = currentSessionId;
    if (!id || currentOwner) return;
    await refreshSessions().catch(() => null);
    const meta = lastSessions.find((s) => s.id === id && !s.owner);
    if (!meta) return;
    if (kind === "delete" && !confirm(t("「{label}」の会話ログを削除します。元に戻せません。よろしいですか?", { label: meta.label }))) return;
    const next = patrolTarget(1);
    if (kind === "archive") {
      await archiveSession(meta);
    } else {
      const ok = await api(`/sessions/${id}/delete`, { method: "POST" }).then(() => true, (e) => {
        alert(t("削除できませんでした: {err}", { err: e.message }));
        return false;
      });
      if (!ok) return;
      await refreshSessions().catch(() => null);
    }
    if (currentSessionId !== id) return; // moved elsewhere meanwhile
    const fresh = next && lastSessions.find((s) => s.id === next.id && !s.archived);
    if (fresh) openSession(fresh);
    else closeSession();
  }
  document.getElementById("patrol-archive").addEventListener("click", () => patrolAct("archive"));
  document.getElementById("patrol-delete").addEventListener("click", () => patrolAct("delete"));
  // The list keeps "確認待ち" current on its own while it is on screen (the
  // list otherwise refreshes only on navigation): every 20 s while visible.
  setInterval(() => {
    if (!currentSessionId && !dragState && document.visibilityState === "visible" && viewList.style.display !== "none") {
      refreshSessions({ light: true }).catch(() => null);
    }
  }, 20000);
  document.getElementById("patrol-prev").addEventListener("click", () => patrolGo(-1));
  document.getElementById("patrol-next").addEventListener("click", () => patrolGo(1));
  patrolFilterEl.addEventListener("change", () => {
    try { localStorage.setItem(PATROL_FILTER_KEY, patrolFilterEl.value); } catch (e) {}
    updatePatrolBar();
  });

  // The bottom-of-list "🗄 アーカイブを開く" button and the (initially
  // hidden) archived-sessions panel it reveals.
  // Re-run on every refreshSessions() so counts/rows stay current; the open
  // state itself (archivedVisible) is only ever flipped by the button click
  // below.
  function renderArchivedSection() {
    archiveToggleBtn.textContent = archivedVisible
      ? t("🗄 アーカイブを閉じる")
      : t("🗄 アーカイブを開く ({n})", { n: lastArchivedSessions.length + lastArchivedFolders.length });
    archivedListEl.hidden = !archivedVisible;
    archivedListEl.innerHTML = "";
    if (archivedVisible) {
      fillArchivedFolders(archivedListEl);
      // Top level: archived sessions that are in no folder.
      fillArchivedList(archivedListEl, lastArchivedSessions.filter((s) => !folderOfSession(s)));
    }
    // A built-in folder's own archive (aigwExt folders, ownArchive), with
    // its own open/close words.
    extArchivesEl.innerHTML = "";
    for (const [fid, list] of extArchived) {
      const spec = window.aigwExt.folder(fid) || {};
      const shown = extArchivedOpen.has(fid);
      if (!list.length && !shown) continue;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ext-archive-toggle-btn";
      toggle.textContent = shown
        ? t(spec.archiveClose || "🗄 アーカイブを閉じる")
        : t(spec.archiveOpen || "🗄 アーカイブを開く ({n})", { n: list.length });
      toggle.addEventListener("click", () => {
        if (shown) extArchivedOpen.delete(fid); else extArchivedOpen.add(fid);
        renderArchivedSection();
      });
      extArchivesEl.appendChild(toggle);
      if (!shown) continue;
      const listEl = document.createElement("div");
      listEl.className = "ext-archived-list";
      fillArchivedList(listEl, list);
      extArchivesEl.appendChild(listEl);
    }
  }

  function fillArchivedList(listEl, list) {
    for (const s of list) {
      const row = document.createElement("div");
      row.className = "session-row";
      row.dataset.sessionId = s.id;
      const ownerBadge = s.owner ? ` &middot; ${t("{owner}さんと共有", { owner: escapeHtml(s.owner) })}` : "";
      row.innerHTML = `
        <div>
          <span class="dot ${s.alive ? "alive" : "stopped"}"></span>
          <span class="label">${typeIcon(s)}${screenBadge(s)}${escapeHtml(s.label)}</span>
          <div class="meta">${cwdPrefix(s)}${fmtTime(s.created_ts)}${ownerBadge}</div>
        </div>`;
      row.addEventListener("click", () => (s.locked ? openLockedSession(s) : openSession(s)));

      if (!s.owner) {
        const restoreBtn = document.createElement("button");
        restoreBtn.className = "archive-btn";
        restoreBtn.textContent = "📤";
        restoreBtn.title = t("アーカイブから戻す");
        restoreBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          unarchiveSession(s);
        });
        row.appendChild(restoreBtn);

        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.textContent = "🗑";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteSession(s);
        });
        row.appendChild(delBtn);
      }

      listEl.appendChild(row);
    }
  }

  // "👥 共有ログ" (the deployment notes): folded like the archive; open, one
  // folder per owner, each opened on its own.
  function renderSharedSection() {
    sharedToggleBtn.hidden = lastSharedSessions.length === 0 && !sharedVisible;
    sharedToggleBtn.textContent = sharedVisible
      ? t("👥 共有ログを閉じる")
      : t("👥 共有ログを開く ({n})", { n: lastSharedSessions.length });
    sharedListEl.hidden = !sharedVisible;
    sharedListEl.innerHTML = "";
    if (!sharedVisible) return;
    const byOwner = new Map();
    for (const s of lastSharedSessions) {
      if (!byOwner.has(s.owner)) byOwner.set(s.owner, []);
      byOwner.get(s.owner).push(s);
    }
    for (const owner of [...byOwner.keys()].sort()) {
      const list = byOwner.get(owner);
      const open = openSharedOwners.has(owner);
      const folder = document.createElement("button");
      folder.type = "button";
      folder.className = "shared-folder";
      folder.textContent = `${open ? "📂" : "📁"} ${owner} (${list.length})`;
      folder.addEventListener("click", () => {
        if (open) openSharedOwners.delete(owner); else openSharedOwners.add(owner);
        renderSharedSection();
      });
      sharedListEl.appendChild(folder);
      if (!open) continue;
      for (const s of list) {
        const row = document.createElement("div");
        row.className = "session-row shared-row";
        row.dataset.sessionId = s.id;
        const mode = s.share_mode === "read" ? t("閲覧のみ") : t("共同作業");
        row.innerHTML = `
          <div>
            <span class="dot ${s.alive ? "alive" : "stopped"}"></span>
            <span class="label">${typeIcon(s)}${screenBadge(s)}${escapeHtml(s.label)}</span>
            <div class="meta">${fmtTime(s.created_ts)} &middot; ${mode}</div>
          </div>`;
        row.addEventListener("click", () => (s.locked ? openLockedSession(s) : openSession(s)));
        sharedListEl.appendChild(row);
      }
    }
  }

  sharedToggleBtn.addEventListener("click", () => {
    sharedVisible = !sharedVisible;
    renderSharedSection();
  });

  archiveToggleBtn.addEventListener("click", () => {
    archivedVisible = !archivedVisible;
    renderArchivedSection();
  });

  // Undo for 🗄 (2026-11-04, at the user's request): the sessions archived
  // from this page, newest last. A notice with "元に戻す" shows for a few
  // seconds after each archive, and Ctrl+Z (⌘Z) on the list -- not inside a
  // session, where the key belongs to the terminal, nor in a text field --
  // takes back the latest one, again and again down this list.
  const archiveUndoStack = [];
  let undoToastEl = null;
  let undoToastTimer = null;
  function hideUndoToast() {
    clearTimeout(undoToastTimer);
    if (undoToastEl) undoToastEl.remove();
    undoToastEl = null;
  }
  function showUndoToast(text, withButton) {
    hideUndoToast();
    const el = document.createElement("div");
    el.className = "undo-toast";
    const span = document.createElement("span");
    span.textContent = text;
    el.appendChild(span);
    if (withButton) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = t("元に戻す");
      // withButton: true = the archive undo; a function = its own undo (✓ on /todo).
      btn.addEventListener("click", () => {
        if (typeof withButton === "function") { hideUndoToast(); withButton(); } else undoArchive();
      });
      el.appendChild(btn);
    }
    document.body.appendChild(el);
    undoToastEl = el;
    undoToastTimer = setTimeout(hideUndoToast, 8000);
  }
  async function undoArchive() {
    const meta = archiveUndoStack.pop();
    if (!meta) {
      showUndoToast(t("元に戻すアーカイブはありません"), false);
      return;
    }
    hideUndoToast();
    if (meta.folder) {
      const f = folderById(meta.id);
      if (f) {
        await archiveFolder(f, false);
        showUndoToast(t("フォルダ「{label}」をアーカイブから戻しました", { label: meta.label }), false);
      }
      return;
    }
    if (await unarchiveSession(meta)) showUndoToast(t("「{label}」をアーカイブから戻しました", { label: meta.label }), false);
  }
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
    if (currentSessionId) return;
    const tgt = e.target;
    if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return;
    e.preventDefault();
    undoArchive();
  });

  async function archiveSession(meta) {
    const ok = await api(`/sessions/${meta.id}/archive`, { method: "POST" }).then(() => true, (e) => {
      alert(t("アーカイブできませんでした: {err}", { err: e.message }));
      return false;
    });
    if (ok) {
      archiveUndoStack.push({ id: meta.id, label: meta.label });
      if (archiveUndoStack.length > 50) archiveUndoStack.shift();
      showUndoToast(t("「{label}」をアーカイブしました", { label: meta.label }), true);
    }
    await refreshSessions();
  }

  async function unarchiveSession(meta) {
    const ok = await api(`/sessions/${meta.id}/unarchive`, { method: "POST" }).then(() => true, (e) => {
      alert(t("元に戻せませんでした: {err}", { err: e.message }));
      return false;
    });
    await refreshSessions();
    return ok;
  }

  // Drag (⠿) for session and folder rows alike (the deployment notes):
  // pointer events cover mouse and touch. Each row's place is taken once,
  // at pointerdown; the dragged row follows the pointer, and either
  //  - the pointer is over the middle half of a folder row: the item goes
  //    into that folder (the row lights up), or
  //  - it is between rows: the others slide apart and the item goes there,
  //    into whatever the row above it is in (an open folder's row: into
  //    that folder).
  // A folder carries its open contents along (hidden while dragging) and
  // can never go into itself. The list is redrawn from the saved state.
  function wireSessionDrag(handle, row) {
    handle.addEventListener("pointerdown", (e) => {
      // Left button / touch / pen only: a right click opens the context menu,
      // which swallows the pointerup -- the drag never ended and, with it
      // never ending, the list stopped redrawing (2026-11-04, the user: a
      // folder's new name "did not show" on Windows).
      if (e.button !== 0 || dragState) return;
      e.preventDefault(); // no text selection / native drag while dragging
      const folderId = row.dataset.folderId || null;
      const all = Array.from(sessionsEl.children);
      const carried = folderId
        ? all.filter((r) => r !== row && (r.dataset.path || "").split("/").includes(folderId))
        : [];
      for (const r of carried) r.style.display = "none";
      const rows = all.filter((r) => !carried.includes(r));
      // Places relative to the list's own top, so a scroll (or the header
      // above the list changing height while it scrolls) moves nothing.
      const base = sessionsEl.getBoundingClientRect().top;
      const rects = new Map(rows.map((r) => {
        const b = r.getBoundingClientRect();
        return [r, { top: b.top - base, bottom: b.bottom - base, height: b.height }];
      }));
      dragState = {
        pointerId: e.pointerId,
        row,
        rows,
        rects,
        carried,
        folderId,
        forbidden: folderId ? folderSubtree(folderId) : new Set(),
        originalIndex: rows.indexOf(row),
        targetIndex: rows.indexOf(row),
        into: null,
        moved: false,
        rowHeight: rects.get(row).height + 8,
        startY: e.clientY - base,
        lastY: e.clientY,
        scrollTimer: null,
      };
      row.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      dragState.lastY = e.clientY;
      dragMoved();
      // Near the top or bottom edge of the list, scroll it (a long list's
      // target can be off screen).
      const st = dragState;
      const box = viewList.getBoundingClientRect();
      const speed = e.clientY < box.top + 48 ? -24 : e.clientY > box.bottom - 48 ? 24 : 0;
      clearInterval(st.scrollTimer);
      st.scrollTimer = speed ? setInterval(() => {
        if (dragState !== st) return clearInterval(st.scrollTimer);
        const before = viewList.scrollTop;
        viewList.scrollTop += speed;
        if (viewList.scrollTop !== before) dragMoved();
      }, 30) : null;
    });
    const stop = (e) => {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      clearInterval(dragState.scrollTimer);
      endSessionDrag();
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    // Capture lost without a pointerup (the window lost focus, the pointer
    // was taken by the browser): the drag ends there too.
    handle.addEventListener("lostpointercapture", stop);
    // A plain tap on the handle must not open the session / fold the folder.
    handle.addEventListener("click", (e) => e.stopPropagation());
  }

  // Lays out the drag for the pointer's last position. The rows' places
  // were taken at pointerdown, relative to the list's top; the pointer is
  // compared the same way.
  function dragMoved() {
    const st = dragState;
    {
      const y = st.lastY - sessionsEl.getBoundingClientRect().top;
      const dy = y - st.startY;
      if (Math.abs(dy) > 4) st.moved = true;
      st.row.style.transform = `translateY(${dy}px)`;
      // Into a folder?
      let into = null;
      for (const r of st.rows) {
        if (r === st.row || !r.dataset.folderId || st.forbidden.has(r.dataset.folderId)) continue;
        const b = st.rects.get(r);
        if (y > b.top + b.height * 0.25 && y < b.bottom - b.height * 0.25) { into = r; break; }
      }
      for (const r of st.rows) r.classList.toggle("drop-into", r === into);
      st.into = into;
      // Otherwise: how many of the other rows are above the pointer.
      const others = st.rows.filter((r) => r !== st.row);
      let idx = 0;
      for (const r of others) {
        const b = st.rects.get(r);
        if (b.top + b.height / 2 < y) idx++;
      }
      st.targetIndex = idx;
      const orig = st.originalIndex;
      for (const r of others) {
        const j = st.rows.indexOf(r);
        let shift = 0;
        if (!into) {
          if (j > orig && j <= idx) shift = -st.rowHeight;
          else if (j < orig && j >= idx) shift = st.rowHeight;
        }
        r.style.transform = shift ? `translateY(${shift}px)` : "";
      }
    }
  }

  function rowParent(r) {
    if (r.dataset.folderId) return folderById(r.dataset.folderId)?.parent || null;
    const s = lastSessions.find((x) => x.id === r.dataset.sessionId);
    return s ? folderOfSession(s) : null;
  }

  function endSessionDrag() {
    const st = dragState;
    dragState = null;
    for (const r of st.rows) {
      r.style.transform = "";
      r.classList.remove("dragging", "drop-into");
    }
    for (const r of st.carried) r.style.display = "";
    if (!st.moved) return;
    const others = st.rows.filter((r) => r !== st.row);
    let parent;
    if (st.into) {
      parent = st.into.dataset.folderId;
    } else {
      const above = others[st.targetIndex - 1];
      if (!above) parent = null;
      else if (above.dataset.folderId && openFolders.has(above.dataset.folderId)) parent = above.dataset.folderId;
      else parent = rowParent(above);
    }
    if (parent && st.forbidden.has(parent)) { renderSessionList(); return; }
    if (st.folderId) {
      const f = folderById(st.folderId);
      f.parent = parent;
      folderDoc.folders = folderDoc.folders.filter((x) => x !== f);
      // Before the next folder with the same parent below the drop point,
      // else after the last of them.
      let before = null;
      if (!st.into) {
        for (const r of others.slice(st.targetIndex)) {
          const g = r.dataset.folderId && folderById(r.dataset.folderId);
          if (g && (g.parent || null) === parent) { before = g; break; }
        }
      }
      const at = before ? folderDoc.folders.indexOf(before) : folderDoc.folders.length;
      folderDoc.folders.splice(at, 0, f);
      // The folder it went into stays as it was, open or closed (2026-11-04,
      // the user: "ドロップしてもそのまま開かないように").
      saveFolders([{ op: "put", folder: { id: f.id, parent }, before: before ? before.id : "end" }]);
      return;
    }
    const id = st.row.dataset.sessionId;
    const s = lastSessions.find((x) => x.id === id);
    const ops = [];
    if (s && folderOfSession(s) !== parent) {
      folderDoc.assign[id] = parent || "";
      ops.push({ op: "assign", session: id, folder: parent || "" });
    }
    if (!st.into) {
      const ids = others.filter((r) => r.dataset.sessionId).map((r) => r.dataset.sessionId);
      const k = others.slice(0, st.targetIndex).filter((r) => r.dataset.sessionId).length;
      ids.splice(k, 0, id);
      saveSessionOrder(ids);
    }
    if (ops.length) saveFolders(ops);
    else renderSessionList();
  }

  // Merges the just-dragged, machine-filtered subset's new relative order
  // back into the full (unfiltered) saved order, leaving any session the
  // machine filter is currently hiding at its existing relative position --
  // same idea as a stable merge: walk the previous full order, and every
  // time a visible id comes up, take the next one off the new sequence
  // instead of the old one.
  function saveSessionOrder(visibleIdsNewOrder) {
    const visibleSet = new Set(visibleIdsNewOrder);
    const base = sessionOrder.length ? sessionOrder : lastSessions.map((s) => s.id);
    const full = base.filter((id) => lastSessions.some((s) => s.id === id)); // drop stale/deleted ids
    for (const s of lastSessions) {
      if (!full.includes(s.id)) full.push(s.id); // sessions never placed yet (new, or first drag ever)
    }
    const queue = [...visibleIdsNewOrder];
    sessionOrder = full.map((id) => (visibleSet.has(id) ? queue.shift() : id));
    listEditSeq++;
    orderSaving++;
    api("/session-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: sessionOrder }),
    }).catch(() => {}).finally(() => { orderSaving--; });
  }

  async function deleteSession(meta) {
    if (!confirm(t("「{label}」の会話ログを削除します。元に戻せません。よろしいですか?", { label: meta.label }))) return;
    await api(`/sessions/${meta.id}/delete`, { method: "POST" });
    await refreshSessions();
  }

  async function renameSession(meta) {
    const next = prompt("新しい名前:", meta.label);
    if (next === null) return; // cancelled
    const trimmed = next.trim();
    if (!trimmed || trimmed === meta.label) return;
    await api(`/sessions/${meta.id}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: trimmed }),
    }).catch((e) => alert(t("名前を変更できませんでした: {err}", { err: e.message })));
    await refreshSessions();
    // The chat header's own label is a separate DOM element (set once in
    // openSession(), not re-read from the session list) -- keep it in sync
    // if the session being renamed is the one currently open.
    if (currentSessionId === meta.id) chatLabelEl.textContent = typeIcon(meta) + screenBadge(meta) + trimmed;
  }

  // tmux sessions the user started by hand (outside aigw) that aren't
  // already tracked by a live aigw session -- see list_untracked_tmux_sessions
  // in aigw-backend. Covers BOTH sessions inside the user's own devbox
  // container and ones running directly on the host as that same user
  // (aigw-backend@<user> already runs as that literal Unix account, so it
  // has the same access to that user's host-level tmux server a normal
  // shell for them would -- discovered as a real gap when a user's actual
  // long-running sessions turned out to live there, not in the container).
  // Each entry is {name, location}, not a bare name, since a container
  // session and a host session could plausibly share a name (tmux's
  // default auto-numbered names especially). "接続" adopts one via
  // POST /sessions/adopt and opens it in the same chat view as any other
  // tmux-based (shell) session; output arrives via live_tail/agent_output
  // events from _watch_attached_session instead of a raw pipe-pane tail.
  function locationLabel(location) {
    if (location.startsWith("ssh:")) return location.slice(4);
    return location === "host" ? "host" : "container";
  }

  async function refreshTmuxSessions() {
    const { sessions } = await api("/tmux-sessions").catch(() => ({ sessions: [] }));
    tmuxSessionsEl.innerHTML = "";
    const machineOf = (location) => (location.startsWith("ssh:") ? location.slice(4) : "local");
    for (const { name, location, owner, read_only: readOnly } of sessions.filter((s) => machineOf(s.location) === currentMachine)) {
      const row = document.createElement("div");
      row.className = "tmux-row";
      const nameEl = document.createElement("span");
      nameEl.className = "name";
      // Whose it is on a machine every aigw user shares (the deployment notes);
      // someone else's can only be watched.
      const who = owner ? ` · ${t("{owner}さん", { owner })}` : "";
      nameEl.textContent = `${name} (${locationLabel(location)})${who}`;
      row.appendChild(nameEl);

      const btn = document.createElement("button");
      btn.textContent = readOnly ? t("見る") : t("接続");
      btn.addEventListener("click", () => adoptSession(name, location));
      row.appendChild(btn);

      tmuxSessionsEl.appendChild(row);
    }
  }

  async function adoptSession(tmuxName, location) {
    // An adopted pane was never sized for this phone -- it may have been
    // created by hand, or by aigw itself on some other, wider device --
    // so this resizes it to the current screen the same way create_session
    // already does for a brand-new pane.
    const meta = await withUnlockRetry(() => api("/sessions/adopt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmux_name: tmuxName, location, label: tmuxName,
        cols: computeScreenCols(), rows: computeScreenRows(),
      }),
    })).catch((e) => {
      alert(t("接続に失敗しました: {err}", { err: e.message }));
      return null;
    });
    if (!meta) return;
    await refreshSessions();
    openSession(meta);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---- chat history paging ------------------------------------------------
  //
  // A long-running session's events.jsonl can run to thousands of lines --
  // replaying all of it through SSE on every open (the old behavior) made
  // the initial render slow: thousands of DOM nodes and scrollTop-forced
  // reflows, not network transfer, dominated the wait (2026-08-28, at the
  // user's request). Now only the last HISTORY_PAGE_LIMIT events are loaded
  // up front (via GET .../events/page, plain JSON, not SSE); the SSE stream
  // then opens with ?since=<newest loaded seq> so it never replays what was
  // already fetched. Scrolling to the top of #messages fetches the next
  // page further back on demand, same shape as any other lazy-loaded chat
  // history.

  const HISTORY_PAGE_LIMIT = 50;
  let oldestLoadedSeq = null;   // seq of the oldest event currently rendered
  const movedSeqs = new Set();  // first copies of queued messages (renderEvent)
  let hasMoreHistory = false;
  let loadingHistory = false;
  const historyTopEl = document.createElement("div");
  historyTopEl.className = "history-top";

  function setHistoryTopText(text) {
    historyTopEl.textContent = text;
    historyTopEl.style.display = text ? "" : "none";
  }

  // Older-history-only bubble builder: unlike renderEvent(), this never runs
  // for the live tail of a session, so live_tail/screen (always superseded
  // by something already rendered below, or simply never persisted at all
  // for "screen") are always safe to skip outright, and session_ended is
  // rendered as plain text with none of renderEvent()'s current-session side
  // effects (chatDotEl, refreshAuthStatus()) -- those only make sense for
  // the live tail, never for a page of already-settled older history.
  function buildHistoryBubble(sessionId, ev) {
    const div = document.createElement("div");
    if (typeof ev.seq === "number") div.dataset.seq = ev.seq;
    if (ev.type === "user_message") {
      div.className = "bubble user";
      if (ev.from) {
        const who = document.createElement("span");
        who.className = "from";
        who.textContent = `${ev.from}: `;
        div.appendChild(who);
      }
      div.appendChild(document.createTextNode(ev.text));
      if (ev.submit === false) {
        const tag = document.createElement("span");
        tag.className = "nosubmit";
        tag.textContent = t("⏎なし");
        div.appendChild(tag);
      }
    } else if (ev.type === "agent_output") {
      div.className = "bubble agent";
      setTextWithLinks(div, ev.text);
      if (speakable(currentPreset, ev)) speechSource.set(div, ev.text);
    } else if (ev.type === "agent_thinking") {
      renderThought(div, ev.text);
    } else if (ev.type === "image") {
      div.className = "bubble agent";
      const img = document.createElement("img");
      const imgUrl = sessionApiUrl(sessionId, `/files/${encodeURIComponent(ev.filename)}`, currentOwner);
      img.loading = "lazy";
      img.decoding = "async";
      img.src = imgUrl;
      img.addEventListener("click", () => window.open(imgUrl, "_blank"));
      div.appendChild(img);
    } else if (ev.type === "attachment") {
      div.className = "bubble agent";
      renderAttachment(div, sessionId, ev.filename, ev.kind, ev.source_filename, ev.mtl);
    } else if (ev.type === "session_ended") {
      div.className = "bubble system";
      div.textContent = ev.exit_status
        ? t("セッションは終了しました (終了コード {code})", { code: ev.exit_status })
        : t("セッションは終了しました");
    } else if (ev.type === "system") {
      div.className = "bubble system";
      div.textContent = ev.text;
    } else {
      return null;
    }
    return div;
  }

  async function loadOlderHistory(limit = HISTORY_PAGE_LIMIT) {
    if (loadingHistory || !hasMoreHistory || oldestLoadedSeq === null || !currentSessionId) return false;
    loadingHistory = true;
    setHistoryTopText("読み込み中…");
    const sessionId = currentSessionId;
    const owner = currentOwner;
    try {
      const page = await api(sessionPath(sessionId, `/events/page?before=${oldestLoadedSeq}&limit=${limit}`, owner));
      if (sessionId !== currentSessionId) return false; // switched sessions while this was in flight
      const prevScrollHeight = messagesEl.scrollHeight;
      const prevScrollTop = messagesEl.scrollTop;
      const frag = document.createDocumentFragment();
      for (const ev of page.events) if (typeof ev.moved_from === "number") movedSeqs.add(ev.moved_from);
      for (const ev of page.events) {
        if (movedSeqs.has(ev.seq)) continue;
        const div = buildHistoryBubble(sessionId, ev);
        if (div) frag.appendChild(div);
      }
      messagesEl.insertBefore(frag, historyTopEl.nextSibling);
      // Keeps whatever the user was looking at in place rather than jumping
      // as new content grows the pane above it.
      messagesEl.scrollTop = prevScrollTop + (messagesEl.scrollHeight - prevScrollHeight);
      hasMoreHistory = page.has_more;
      if (page.events.length) oldestLoadedSeq = Math.min(...page.events.map((e) => e.seq));
      setHistoryTopText(hasMoreHistory ? "" : t("ここが会話の最初です"));
      return true;
    } catch (e) {
      setHistoryTopText("読み込みに失敗しました(スクロールでやり直せます)");
      return false;
    } finally {
      loadingHistory = false;
    }
  }

  messagesEl.addEventListener("scroll", () => {
    if (messagesEl.scrollTop < 80) loadOlderHistory();
  });

  // ---- jump to one event (chat search, 2026-10-11) -------------------------
  //
  // Loads older pages until the event with this seq is rendered, then
  // scrolls it to the middle of #messages and flashes it. Pages are sized to
  // reach the target in as few requests as possible (the backend caps a
  // page at 500).
  let pendingJumpSeq = null;
  let pendingJumpTerms = [];

  // The first occurrence of any of `terms` inside `el`, as a Range, plus
  // every occurrence for highlighting -- a bubble can be far taller than
  // the screen (a pasted log), where centering the bubble itself would
  // leave the match off-screen.
  function findTermRanges(el, terms) {
    const ranges = [];
    if (!terms.length) return ranges;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const lower = node.data.toLowerCase();
      for (const t of terms) {
        for (let j = lower.indexOf(t); j !== -1; j = lower.indexOf(t, j + t.length)) {
          const r = document.createRange();
          r.setStart(node, j);
          r.setEnd(node, j + t.length);
          ranges.push(r);
        }
      }
    }
    return ranges;
  }

  async function jumpToSeq(sessionId, seq, terms = []) {
    const find = () => messagesEl.querySelector(`[data-seq="${seq}"]`);
    let el = find();
    while (!el && sessionId === currentSessionId && hasMoreHistory
           && oldestLoadedSeq !== null && oldestLoadedSeq > seq) {
      const need = Math.min(500, oldestLoadedSeq - seq + 10);
      if (!(await loadOlderHistory(need))) break;
      el = find();
    }
    if (!el || sessionId !== currentSessionId) return;
    const ranges = findTermRanges(el, terms);
    if (ranges.length && window.CSS && CSS.highlights && typeof Highlight === "function") {
      CSS.highlights.set("search-term", new Highlight(...ranges));
    }
    const position = () => {
      const first = ranges.length ? ranges[0].getBoundingClientRect() : null;
      if (first && first.height && el.getBoundingClientRect().height > messagesEl.clientHeight) {
        const box = messagesEl.getBoundingClientRect();
        messagesEl.scrollTop += first.top - box.top - messagesEl.clientHeight / 2;
      } else {
        el.scrollIntoView({ block: "center" });
      }
    };
    position();
    // Images and 3D models above the target finish loading after this and
    // push it down; keep it in place for a few seconds, until the user
    // scrolls by hand or leaves the session.
    const stopEvents = ["wheel", "touchstart", "pointerdown", "keydown"];
    let timer = null;
    const stop = () => {
      clearInterval(timer);
      for (const t of stopEvents) messagesEl.removeEventListener(t, stop);
    };
    for (const t of stopEvents) messagesEl.addEventListener(t, stop, { passive: true });
    const until = Date.now() + 5000;
    timer = setInterval(() => {
      if (Date.now() > until || sessionId !== currentSessionId || !el.isConnected) stop();
      else position();
    }, 250);
    el.classList.remove("search-hit");
    void el.offsetWidth; // restart the animation if the same bubble is hit twice
    el.classList.add("search-hit");
  }

  async function connectSessionEvents(meta) {
    oldestLoadedSeq = null;
    movedSeqs.clear();
    queuedUserEls.length = 0;
    hasMoreHistory = false;
    loadingHistory = false;
    setHistoryTopText("");
    let since = 0;
    let replayAll = false;
    try {
      // host/root/Email sessions need this browser's passkey window just to
      // be read (the deployment notes, 2026-10-09): ask for it here, where
      // the tap that opened the session still counts as a user gesture.
      const page = await withUnlockRetry(() => api(sessionPath(meta.id, `/events/page?limit=${HISTORY_PAGE_LIMIT}`, currentOwner)));
      if (meta.id !== currentSessionId) return; // switched sessions while this was in flight
      renderingHistory = true;
      try { for (const ev of page.events) renderEvent(meta.id, ev); } finally { renderingHistory = false; }
      hasMoreHistory = page.has_more;
      if (page.events.length) {
        oldestLoadedSeq = page.events[0].seq;
        since = page.events[page.events.length - 1].seq;
      }
      // Only worth saying for an actual (if short) conversation -- a brand
      // new, still-empty session has nothing to mark the "start" of yet.
      setHistoryTopText(!hasMoreHistory && page.events.length ? t("ここが会話の最初です") : "");
      if (pendingJumpSeq !== null) {
        const seq = pendingJumpSeq;
        pendingJumpSeq = null;
        await jumpToSeq(meta.id, seq, pendingJumpTerms);
      }
    } catch (e) {
      if (e.unlockRequired) {
        setHistoryTopText("🔒 このセッションを読むにはパスキーでの解錠が要ります。開き直してください");
        return;
      }
      replayAll = true;
      // Falls through to a from-scratch SSE replay (since=0) below -- worse
      // than the fast path, but still correct, and the initial history
      // fetch failing at all should be rare.
    }
    if (meta.id !== currentSessionId) return;
    // Survives backend restarts (2026-10-06, user report "この会話がチャットに
    // 出てません"): while aigw-backend restarts the gateway answers this
    // stream with an error status, and EventSource then gives up for good
    // (readyState CLOSED) -- the chat silently stopped updating until the
    // page was reloaded. On CLOSED, reopen after a short delay from the last
    // seq actually received. The browser's own automatic reconnect (for a
    // dropped-but-200 stream) reuses the original ?since=, so events are
    // de-duplicated by seq here too. Ephemeral ones (no seq: "screen") are
    // always passed through.
    let lastSeq = since;
    const openedAt = Date.now() / 1000;
    const open = () => {
      if (meta.id !== currentSessionId) return;
      if (currentEventSource) currentEventSource.close();
      const es = new EventSource(sessionApiUrl(meta.id, `/events?since=${lastSeq}`, currentOwner));
      currentEventSource = es;
      es.onmessage = (e) => {
        let ev;
        try {
          ev = JSON.parse(e.data);
        } catch (err) {
          console.error("bad event", err);
          return;
        }
        if (typeof ev.seq === "number") {
          if (ev.seq <= lastSeq) return;
          lastSeq = ev.seq;
        }
        let el = null;
        try {
          el = renderEvent(meta.id, ev);
        } catch (err) {
          console.error("bad event", err);
        }
        // Read aloud only what arrives after the history page. If that page
        // failed, this stream replays from seq 0 and only replies newer than
        // the open itself count (ts is the server's clock, hence the slack).
        if (speakable(meta.preset, ev) && meta.id === currentSessionId
            && !(replayAll && !(ev.ts > openedAt - 60))) speak(ev.text, el);
      };
      es.onerror = () => {
        if (es.readyState !== EventSource.CLOSED) return; // the browser is retrying by itself
        setTimeout(async () => {
          if (currentEventSource !== es || meta.id !== currentSessionId) return;
          // The backend also ends the stream when the passkey window closes;
          // reopening would only be refused again every 3 seconds.
          try {
            await api(sessionPath(meta.id, `/events/page?limit=1`, currentOwner));
          } catch (err) {
            if (err.unlockRequired) {
              setHistoryTopText("🔒 パスキーの解錠が切れました。開き直してください");
              return;
            }
          }
          if (currentEventSource === es && meta.id === currentSessionId) open();
        }, 3000);
      };
    };
    open();
  }

  function openSession(meta, jumpSeq = null, jumpTerms = []) {
    // From やること (a voice 「次」 or 「…を開いて」, say): leave it first, so
    // the session gets the app's URL and Back returns to the list.
    if (todoShown) return hideTodoView(() => openSession(meta, jumpSeq, jumpTerms));
    tapToLeave = false;
    markTaskSeen(meta);  // the deployment notes: a 済み looked at leaves the list
    pendingJumpSeq = jumpSeq;
    pendingJumpTerms = jumpTerms;
    if (window.CSS && CSS.highlights) CSS.highlights.delete("search-term");
    // Going back from here should land on this session's own machine's
    // list -- matters when it was opened by a notification or a reload's
    // hash rather than by tapping it in that list.
    selectMachine(sessionMachine(meta));
    currentSessionId = meta.id;
    currentPreset = meta.preset;
    currentSessionMeta = meta;
    openFolderPath(folderOfSession(meta));
    updateUnlockNotice();
    // Set by refreshSharedWithMe() tagging -- absent (falsy)
    // for one's own sessions, which is the only case sessionPath()/
    // sessionApiUrl() need to tell apart.
    currentOwner = meta.owner || null;
    chatLabelEl.textContent = typeIcon(meta) + screenBadge(meta) + meta.label;
    currentShareMode = currentOwner ? (meta.share_mode || "write") : null;
    // Read-only: a session shared read-only, or someone else's session on a
    // shared ssh:<machine> adopted only to watch (the deployment notes).
    const readOnly = currentShareMode === "read" || !!meta.read_only;
    chatOwnerBadgeEl.textContent = currentOwner
      ? (readOnly ? t("{owner}さんの共有ログ(閲覧のみ)", { owner: currentOwner }) : t("{owner}さんと共有中", { owner: currentOwner }))
      : meta.read_only ? t("{owner}さんのセッション(見るだけ)", { owner: meta.remote_owner || "?" }) : "";
    // The panel itself is now always reachable (2026-08-28): it also holds
    // 💾 save, which a shared viewer needs too. The sharing *management*
    // controls rendered inside stay owner-only (renderSharePane checks
    // currentOwner) -- managing sharing on a session shared *to* me is not
    // something sharing is meant to also grant.
    shareBtn.title = currentOwner ? t("保存") : t("共有");
    currentSharedWith = currentOwner ? [] : (meta.shared_with || []);
    currentSharedRead = currentOwner ? [] : (meta.shared_read || []);
    updateShareBtnColor();
    setShareVisible(false);
    chatDotEl.className = `dot ${meta.alive ? "alive" : "stopped"}`;
    messagesEl.innerHTML = "";
    newMsgBtnEl.classList.remove("visible"); // belonged to the previous session
    messagesEl.appendChild(historyTopEl);
    setHistoryTopText("");
    liveBubbleEl = null;
    viewList.style.display = "none";
    viewChat.style.display = "flex";
    // #chat-header (back/label/screen/share/reload/stop) replaces it
    // while chatting -- two stacked header bars was too much on a phone
    // screen (2026-08-15, at the user's request). #reload-btn itself moved
    // into #chat-header rather than being lost along with this.
    topHeaderEl.style.display = "none";
    // Both the soft keyboard and the screen panel are about a real pane, so
    // neither applies to the headless preset.
    const hasPane = !HEADLESS_PRESETS.includes(meta.preset) && !readOnly;
    keyToolbarEl.classList.toggle("visible", hasPane);
    // Watching someone else's pane is what the screen panel is for; a
    // read-only share is the chat log only (the deployment notes).
    screenBtn.style.display = hasPane || meta.read_only ? "" : "none";
    composerEl.style.display = readOnly ? "none" : "";
    // "Type without submitting" needs somewhere for the characters to sit
    // between calls, which only a real pane has -- a headless turn is a whole
    // message or nothing, so 実行 is the only button there.
    sendBtn.classList.toggle("hidden", !hasPane);
    latestScreen = "";
    setScreenVisible(false);
    setAgentsVisible(false);
    pushSessionHistory();
    setHash(meta.id);
    updatePatrolBar();

    if (currentEventSource) currentEventSource.close();
    currentEventSource = null;
    stopSpeaking();
    updateSpeakBtn();
    updateChatResumeBtn();
    connectSessionEvents(meta);
  }

  function closeSession() {
    tapToLeave = false;
    popSessionHistory();
    if (currentEventSource) currentEventSource.close();
    currentEventSource = null;
    stopSpeaking();
    if (speakPopEl) {
      speakPopEl.remove();
      speakPopEl = null;
    }
    closeAudioMenu();
    currentSessionId = null;
    currentOwner = null;
    currentShareMode = null;
    currentSessionMeta = null;
    updateUnlockNotice();
    viewChat.style.display = "none";
    topHeaderEl.style.display = "flex";
    keyToolbarEl.classList.remove("visible");
    setScreenVisible(false);
    setAgentsVisible(false);
    if (sessionOpenedFromAuth) {
      // Back to the auth page it was launched from, not the session list --
      // openAuthView() also does the refreshAuthStatus() this case needs
      // ("coming back from a claude-login session is exactly when this
      // changed, and there is no event to tell us it did").
      sessionOpenedFromAuth = false;
      openAuthView();
    } else {
      viewList.style.display = "block";
      // Back to /todo (opened from the to-do list): that entry keeps its
      // URL, and the to-do popstate handler shows the list again.
      if (!/\/todo\/?$/.test(location.pathname)) setHash(listHash());
      refreshAuthStatus();
    }
    refreshSessions();
    refreshTmuxSessions();
    // A finished conversation is itself resumable, and an agent may have
    // created directories -- so both pickers are re-read on the way back.
    refreshWorkdirs(false);
  }

  // Swipe right to go back, replacing the ← button (2026-08-15, at the
  // user's request). Originally armed only within 24px of the left edge,
  // but that was too thin a target to hit reliably on a real phone
  // (2026-08-16, at the user's request to widen it) -- now it starts
  // anywhere in the chat view EXCEPT the few elements that have their own
  // real meaning for a horizontal drag: the key toolbar's own row of keys,
  // the screen/agents panels (both can scroll horizontally), and the
  // composer (a drag there is far more likely to be selecting/moving the
  // cursor in the still-unsent message than trying to leave the screen).
  // Not preventDefault'd. Same "only a real drag past a threshold, never
  // an ordinary tap" shape as the pull-to-refresh gesture below.
  (function () {
    const EXCLUDED_SELECTOR = "#key-toolbar, #screen-pane, #agents-pane, #composer";
    const SWIPE_THRESHOLD = 80;
    const MAX_VERTICAL_DRIFT = 60;
    let startX = null;
    let startY = null;
    viewChat.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) { startX = null; return; }
      const t = e.touches[0];
      if (t.target.closest && t.target.closest(EXCLUDED_SELECTOR)) { startX = null; return; }
      startX = t.clientX;
      startY = t.clientY;
    }, { passive: true });
    viewChat.addEventListener("touchend", (e) => {
      if (startX === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      startX = null;
      if (dx > SWIPE_THRESHOLD && dy < MAX_VERTICAL_DRIFT) closeSession();
    });
  })();

  // Pull-to-refresh has nothing to trigger from -- html/body never scroll
  // (see index.html) -- so a phone with no visible browser chrome (a PWA
  // added to the home screen) has no other way to reload this page at all.
  // #top-header lost its own copy of this button entirely back on
  // 2026-08-15 (moved into #chat-header only) -- #top-reload-btn restores
  // it for the session-list page (2026-08-28, at the user's request).
  document.getElementById("reload-btn").addEventListener("click", () => location.reload());
  document.getElementById("top-reload-btn").addEventListener("click", () => location.reload());

  // ---- chat search (2026-10-11, at the user's request) ----------------------
  //
  // GET /search scans this user's own sessions' chat logs (aigw-backend's
  // search_events), and GET /shared/<owner>/search, once per owner who
  // shares something with this user, the sessions shared with them -- the
  // owner's backend applies the same shared_with check as opening one.
  // host/root/Email sessions only while this browser has their passkey
  // window (the reply counts the skipped ones). Tapping a hit opens that
  // session and jumps to the message (openSession's jumpSeq).
  const searchPanelEl = document.getElementById("search-panel");
  const searchInputEl = document.getElementById("search-input");
  const searchStatusEl = document.getElementById("search-status");
  const searchResultsEl = document.getElementById("search-results");
  const SEARCH_TYPE_LABEL = { user_message: t("自分"), agent_output: "AI", agent_thinking: t("AI(思考)"), system: t("システム") };

  document.getElementById("search-toggle-btn").addEventListener("click", () => {
    searchPanelEl.hidden = !searchPanelEl.hidden;
    if (!searchPanelEl.hidden) searchInputEl.focus();
  });

  function appendHighlighted(el, text, terms) {
    const lower = text.toLowerCase();
    let i = 0;
    while (i < text.length) {
      let best = -1, bestLen = 0;
      for (const t of terms) {
        const j = lower.indexOf(t, i);
        if (j !== -1 && (best === -1 || j < best)) { best = j; bestLen = t.length; }
      }
      if (best === -1) break;
      if (best > i) el.appendChild(document.createTextNode(text.slice(i, best)));
      const m = document.createElement("mark");
      m.textContent = text.slice(best, best + bestLen);
      el.appendChild(m);
      i = best + bestLen;
    }
    if (i < text.length) el.appendChild(document.createTextNode(text.slice(i)));
  }

  async function openSearchHit(hit, terms) {
    const match = (s) => s.id === hit.session_id && (s.owner || null) === (hit.owner || null);
    let meta = lastSessions.find(match);
    if (!meta) {
      const sessions = await refreshSessions();
      meta = sessions.find(match);
    }
    if (!meta) {
      searchStatusEl.textContent = t("このセッションはもうありません");
      return;
    }
    openSession(meta, hit.seq, terms);
  }

  async function runSearch(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    searchResultsEl.innerHTML = "";
    if (!terms.length) { searchStatusEl.textContent = ""; return; }
    searchStatusEl.textContent = t("検索中…");
    const qp = `/search?q=${encodeURIComponent(q)}`;
    const owners = [...new Set(lastSessions.filter((s) => s.owner).map((s) => s.owner))];
    let r;
    try {
      const [own, ...shared] = await Promise.all([
        api(qp),
        ...owners.map((o) => api(`/shared/${encodeURIComponent(o)}${qp}`)
          .then((x) => ({ ...x, hits: x.hits.map((h) => ({ ...h, owner: o })) }))
          .catch(() => ({ hits: [], locked: 0, truncated: false }))),
      ]);
      const all = [own, ...shared];
      const hits = all.flatMap((x) => x.hits).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      r = {
        hits: hits.slice(0, 200),
        locked: all.reduce((n, x) => n + (x.locked || 0), 0),
        truncated: hits.length > 200 || all.some((x) => x.truncated),
      };
    } catch (e) {
      searchStatusEl.textContent = t("検索できませんでした: {err}", { err: e.message });
      return;
    }
    const notes = [r.hits.length ? t("{n}件", { n: r.hits.length }) + (r.truncated ? t("(新しい順に表示、これより古いものは省略)") : "") : t("見つかりませんでした")];
    if (r.locked) notes.push(t("🔒 {n}個のセッション(ホスト・ルート・Email)は解錠すると検索できます", { n: r.locked }));
    searchStatusEl.textContent = notes.join(t("。"));
    for (const hit of r.hits) {
      const row = document.createElement("div");
      row.className = "search-hit-row";
      row.dataset.sessionId = hit.session_id;
      if (hit.owner) row.dataset.owner = hit.owner;
      row.dataset.seq = hit.seq;
      const metaEl = document.createElement("div");
      metaEl.className = "meta";
      metaEl.textContent = `${hit.archived ? "🗄 " : ""}${hit.owner ? t("[{owner}さん] ", { owner: hit.owner }) : ""}${hit.label} · ${hit.ts ? fmtDateTime(hit.ts) : ""} · ${SEARCH_TYPE_LABEL[hit.type] || hit.type}`;
      const snip = document.createElement("div");
      snip.className = "snippet";
      appendHighlighted(snip, hit.snippet, terms);
      row.appendChild(metaEl);
      row.appendChild(snip);
      row.addEventListener("click", () => openSearchHit(hit, terms));
      searchResultsEl.appendChild(row);
    }
  }

  document.getElementById("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    searchInputEl.blur(); // closes the phone keyboard so the results are visible
    runSearch(searchInputEl.value.trim());
  });

  // Logging out moved from its own always-visible header link to a
  // tap-to-confirm on the username itself (2026-08-28, at the user's
  // request, to free up header space) -- whoEl.textContent is read at click
  // time, not registration time, since applyCapabilities() only fills it in
  // once GET /api/me answers.
  // POST, not a plain `location.href = "/agents/logout"` navigation: logging
  // out changes server state now that there is a real session store (Phase 3),
  // and SameSite=Lax still attaches the session cookie to a top-level GET
  // navigation any other site can trigger -- so a GET logout route is a
  // logout-CSRF anyone can fire at you. The gateway now answers this only on
  // POST and returns {"ok": true} rather than a 302, so the redirect happens
  // here afterwards instead. Failure is ignored on purpose: the server-side
  // revoke either happened or the session was already invalid, and either way
  // sending the user back to /agents/ is the right next step.
  whoEl.addEventListener("click", async () => {
    if (confirm(t("{who} からログアウトしますか？", { who: whoEl.textContent }))) {
      try {
        await fetch("/agents/logout", { method: "POST", credentials: "same-origin" });
      } catch (e) { /* fall through to the redirect regardless */ }
      location.href = "/agents/";
    }
  });

  // A hand-rolled approximation of the same gesture, scoped to the header:
  // native pull-to-refresh needs the document itself to be at scroll
  // position 0 and dragged down, which never applies here, so this just
  // watches for a downward drag starting on the (always-visible, never
  // scrolling) header and reloads past a threshold. Not preventDefault'd
  // anywhere, so an ordinary tap on 再読み込み/ログアウト still behaves as a
  // plain click -- only a real drag past PULL_THRESHOLD does anything.
  (function () {
    const header = document.querySelector("header");
    const PULL_THRESHOLD = 70;
    let startY = null;
    let pulling = false;
    header.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      pulling = false;
    }, { passive: true });
    header.addEventListener("touchmove", (e) => {
      if (startY === null || e.touches.length !== 1) return;
      pulling = e.touches[0].clientY - startY > PULL_THRESHOLD;
    }, { passive: true });
    header.addEventListener("touchend", () => {
      if (pulling) location.reload();
      startY = null;
      pulling = false;
    });
  })();

  // How many monospace columns the screen panel can actually show without
  // horizontal scrolling, measured against its real font/size rather than
  // assumed -- a fixed 220-column pane is what a fullscreen TUI (claude-tui)
  // lays its own borders/menus out against, and none of that fits a phone
  // screen at a readable size.
  //
  // Measured with a real, off-screen <pre> styled exactly like #screen-pane,
  // not Canvas measureText -- Canvas's font shorthand parser does not
  // reliably resolve the "ui-monospace" CSS Fonts 4 generic the same way
  // layout does on every engine, and a silent fallback there measures a
  // different (in practice, narrower) font than #screen-pane actually
  // renders with, which is exactly what produced a pane roughly 2x wider
  // than the phone's real screen.
  function computeScreenCols() {
    const probe = document.createElement("pre");
    probe.style.cssText =
      "position: absolute; visibility: hidden; white-space: pre; margin: 0; padding: 0; " +
      "font-family: ui-monospace, monospace; font-size: 0.7rem; line-height: 1.25;";
    const sample = "0".repeat(100);
    probe.textContent = sample;
    document.body.appendChild(probe);
    const charWidth = probe.getBoundingClientRect().width / sample.length;
    document.body.removeChild(probe);

    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const horizontalPadding = 1.6 * rootPx; // #screen-pane's 0.8rem left + right
    const available = document.documentElement.clientWidth - horizontalPadding;
    return Math.max(20, Math.floor(available / charWidth));
  }

  // How many monospace rows the screen panel can actually show at once,
  // sent as the tmux pane's own height (2026-08-31)
  // so a fullscreen TUI (claude-tui, or `claude` run by hand)
  // lays itself out against a *real* terminal size instead of the flat 300
  // rows every session used to get regardless of any screen looking at it
  // -- which left a large dead gap between the actual conversation and a
  // footer/composer a fullscreen program pins to the true bottom of
  // whatever height it is told the terminal has. Unlike computeScreenCols,
  // no off-screen <pre> measurement is needed: line-height is already an
  // exact multiple of font-size by CSS definition, not something a font's
  // metrics can make narrower than assumed the way character width can.
  //
  // Deliberately asks for SCREEN_OVERFLOW_BUFFER_ROWS more than what
  // #screen-pane's own max-height can actually display at once
  // (2026-09-01, at the user's request) -- a
  // pane sized to *exactly* fill the panel never overflows it, so the
  // panel never gets a scrollbar/scroll position to drag on at all, and
  // the gesture meant to reach history mode from there (dragging/wheeling
  // up while already at the top) turned out not to fire reliably on every
  // device/browser. A few rows of permanent, always-present overflow is a
  // far smaller version of the exact defect this whole feature fixed (a
  // fullscreen program padding unused rows with blank lines) -- accepted
  // deliberately this time, in exchange for scrolling to reach history
  // always working through the one, always-reliable native path (the
  // "scroll" listener above, confirmed to work whenever real overflow
  // exists) instead of a gesture that does not.
  const SCREEN_OVERFLOW_BUFFER_ROWS = 5;
  function computeScreenRows() {
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const lineHeightPx = 0.7 * 1.25 * rootPx; // #screen-pane's font-size * line-height
    const verticalPadding = 1.2 * rootPx; // #screen-pane's 0.6rem top + bottom
    const available = document.documentElement.clientHeight * 0.45 - verticalPadding; // max-height: 45vh
    return Math.max(10, Math.floor(available / lineHeightPx)) + SCREEN_OVERFLOW_BUFFER_ROWS;
  }

  const createBtn = document.getElementById("create-btn");

  createBtn.addEventListener("click", async () => {
    // A cold remote tmux server (first session after it
    // was last idle) can now take up to a
    // few minutes to actually start (aigw-backend polls rather than failing
    // fast), so without this a second tap while the first was still in
    // flight created a second, duplicate session -- confirmed 2026-08-14 as
    // exactly why "the first tap did nothing, the second one worked, then a
    // failure showed up later" was actually two sessions racing, not one
    // session failing. The button text is the only feedback a plain
    // disabled button gives, so it says so explicitly.
    if (createBtn.disabled) return;
    createBtn.disabled = true;
    const originalLabel = createBtn.textContent;
    createBtn.textContent = t("起動中…");
    try {
      let preset = presetEl.value;
      const label = document.getElementById("label").value;
      const body = { preset, label, cols: computeScreenCols(), rows: computeScreenRows() };
      // The backend rejects these outright for the plain shells rather than
      // ignoring them, so only send them for the presets they apply to.
      if (CWD_PRESETS.includes(preset) || preset === "mail-tui") {
        body.cwd = currentCwd;
        body.resume = resumeEl.value;
      } else if (sshCwdMachines.includes(currentMachine) && preset === `claude-tui-${currentMachine}`) {
        // resume is only meaningful once a drive/folder was actually chosen
        // (see create_session's own check) -- an empty currentSshCwd sends
        // resume: "", same as never picking one from #ssh-resume.
        body.cwd = currentSshCwd;
        body.resume = sshResumeEl.value;
      } else if (SHELL_CWD_PRESETS.includes(preset)) {
        // No resume for these (see SHELL_CWD_PRESETS' own comment) -- just
        // the working directory, already in whatever shape create_session
        // expects for this preset's scope (sandhome-relative for "shell",
        // an absolute path for "host-shell"/"root-shell").
        body.cwd = shellCwdByPreset[preset];
      }
      // 🪟: the same preset on the machine's desktop variant
      // (the deployment notes) -- cwd/resume above stay valid as-is, since the
      // variant is the same machine and filesystem.
      // Only while a toggle is actually on screen (the Claude preset's
      // #ssh-resume row, or #ssh-shell-opts for "Shell"): a 🪟 left on from
      // before must not silently apply to a preset that doesn't show it.
      const variant = sshDesktop[currentMachine];
      const toggleShown = sshCwdOptsEl.classList.contains("visible") || sshShellOptsEl.classList.contains("visible");
      if (desktopMode && variant && toggleShown && preset.endsWith(`-${currentMachine}`)) {
        preset = preset.slice(0, -currentMachine.length) + variant;
        body.preset = preset;
      }
      // Only the claude-tui presets honor this (see aigw-backend's
      // CLAUDE_TUI_PRESETS/create_session) -- the headless "claude" preset
      // hardcodes it unconditionally already, and the plain shells have no
      // such flag at all.
      if (preset === "claude-tui" || preset.startsWith("claude-tui-")) {
        body.skip_permissions = skipPermissionsEl.checked;
      }
      // Made from a folder's ＋ (the deployment notes): the backend picks the
      // directory from the folder, unless a conversation to resume was
      // chosen (that one's own folder stands).
      if (newSessionFolder) {
        body.folder = newSessionFolder;
        if (folderEffectiveWorkdir(newSessionFolder) && !body.resume) delete body.cwd;
      }
      // withUnlockRetry: picking "host-shell"/"root-shell" (or any other
      // host/root preset) while the 15-minute window is closed pops the
      // passkey prompt right here, then creates this same session once it
      // succeeds -- the user never has to press 開始 a second time.
      const meta = await withUnlockRetry(() => api("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).catch((e) => {
        alert(t("セッションを作成できませんでした: {err}", { err: e.message }));
        return null;
      });
      if (!meta) return;
      document.getElementById("label").value = "";
      resumeEl.value = "";
      sshResumeEl.value = "";
      setNewSessionFolder(null);
      await refreshSessions();
      openSession(meta);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = originalLabel;
    }
  });

  // ← is a link to the list (its href kept on the selected machine's list);
  // a plain click closes the chat without reloading the page.
  const backLinkEl = document.getElementById("back-btn");
  backLinkEl.addEventListener("click", (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    closeSession();
  });
  const syncBackHref = () => {
    backLinkEl.href = `${appPath()}${location.search}${listHash() ? "#" + listHash() : ""}`;
  };
  backLinkEl.addEventListener("pointerdown", syncBackHref);
  backLinkEl.addEventListener("focus", syncBackHref);
  backLinkEl.addEventListener("contextmenu", syncBackHref);
  // See tapToLeave. Capture phase, so the tap does nothing else on the way.
  viewChat.addEventListener("click", (e) => {
    if (!tapToLeave) return;
    e.preventDefault();
    e.stopPropagation();
    closeSession();
  }, true);

  // The chat header's status dot: on one's own ended, resumable session a
  // tap offers to resume it (same as the list row's grey dot); its
  // long-press force-stop does nothing once the session has ended.
  function chatDotResumable() {
    const m = currentSessionMeta;
    return !!m && m.alive === false && !currentOwner && canResumeEnded(m);
  }
  function updateChatResumeBtn() {
    const m = currentSessionMeta;
    const ended = !!m && m.alive === false;
    const resumable = chatDotResumable();
    chatDotEl.classList.toggle("resumable", resumable);
    chatDotEl.title = resumable ? t("タップで再開") : ended ? t("終了しています") : t("タップで停止");
  }
  chatDotEl.addEventListener("click", () => {
    if (chatDotResumable()) { resumeEndedSession(currentSessionMeta); return; }
    if (currentSessionMeta && currentSessionMeta.alive !== false && currentShareMode !== "read") {
      stopSessionConfirmed(currentSessionId, currentOwner, true);
    }
  });

  // Stopping a running session: an ordinary tap on its green status dot and
  // a confirm (2026-10-09, user request -- it used to be a long-press, now
  // that the grey dot's tap resumes, a tap is consistent). The backend first
  // sends Claude Code Ctrl+C twice so it exits with its conversation saved
  // for a later resume, then ends the session (aigw-backend's
  // _graceful_claude_exit).
  async function stopSessionConfirmed(sessionId, owner, fromChat) {
    if (!confirm(t("このセッションを停止しますか？(Claude が動いていれば Ctrl+C を2回送り、会話を残してから終わらせます)"))) return;
    try {
      await withUnlockRetry(() => api(sessionPath(sessionId, "/stop", owner), { method: "POST" }));
    } catch (e) {
      alert(t("停止できませんでした: {err}", { err: e.message }));
      return;
    }
    if (fromChat) closeSession();
    else await refreshSessions();
  }

  // Which ended sessions get ↻: the presets create_session accepts `resume`
  // for (aigw-backend: CWD_PRESETS, the Email preset, and a drives-capable
  // ssh machine's Claude once a folder was chosen), and only once the
  // conversation id is known. The backend re-checks all of it (the log must
  // still exist in that folder), so this only decides whether to offer it.
  function canResumeEnded(s) {
    if (!s.claude_session_id) return false;
    if (CWD_PRESETS.includes(s.preset) || s.preset === "mail-tui") return true;
    // A shell (incl. root) where `claude` was run by hand: the backend
    // records the folder that conversation ran in as claude_cwd (null when
    // it never ran), and on ↻ opens the same shell there and types
    // `claude --resume <id>` (the deployment notes).
    if (["shell", "host-shell", "root-shell"].includes(s.preset)) return !!s.claude_cwd;
    return s.preset.startsWith("claude-tui-") && !!s.cwd;
  }

  let resumingSession = false;
  async function resumeEndedSession(s, confirmed) {
    if (resumingSession) return;
    if (!confirmed && !confirm(t("「{label}」を続きから再開しますか？", { label: s.label }))) return;
    resumingSession = true;
    try {
      const body = resumeBody(s);
      // Same passkey handling as 開始 (Email and host/root presets).
      const meta = await withUnlockRetry(() => api("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })).catch(async (e) => {
        // Already running elsewhere (e.g. resumed by the server while this
        // page still showed the stopped one): go there instead.
        if (e.runningSession) {
          const list = await refreshSessions().catch(() => lastSessions);
          const other = (list || []).find((x) => x.id === e.runningSession);
          if (other) {
            showUndoToast(t("この会話は別のセッションで動いているので、そちらを開きます"), false);
            openSession(other);
            return null;
          }
        }
        alert(t("再開できませんでした: {err}", { err: e.message }));
        return null;
      });
      if (!meta) return;
      await refreshSessions();
      openSession(meta);
    } finally {
      resumingSession = false;
    }
  }

  function resumeBody(s) {
    const body = {
      preset: s.preset,
      label: s.label,
      cwd: s.claude_cwd || s.cwd || "",
      resume: s.claude_session_id,
      // The backend resumes this same session (same id, its history goes
      // on); only if that cannot be done safely does it copy the history
      // into a new one and delete this (the deployment notes).
      replace_session: s.id,
      cols: computeScreenCols(),
      rows: computeScreenRows(),
    };
    if (s.preset === "claude-tui" || s.preset.startsWith("claude-tui-")) {
      body.skip_permissions = s.skip_permissions !== false;
    }
    return body;
  }

  // Force-stopping a still-*running* session -- aborting a hung shell, or a
  // claude turn the user doesn't want to wait out -- is not something the
  // automatic dead-pane/remain-on-exit detection (aigw-backend) can ever
  // replace: there is nothing to detect until a session already stops on
  // its own. It used to be a dedicated, always-visible 停止 button;
  // replaced 2026-08-16 (at the user's request, now that natural exits are
  // caught automatically) with a long-press on the status dot + a
  // confirm() dialog, so ending a still-running session takes a deliberate
  // gesture rather than an ordinary tap that sits among harmless buttons.

  // submit=false is the 送信 button: the characters, no Enter. The box is
  // still cleared -- the text has left for the pane either way, and what it
  // looks like there is the screen panel's job, not the composer's.
  // submit=true with an empty box is a bare Enter, which is how 実行 answers
  // a selection menu or a "press Enter to continue" without the soft keyboard.
  async function send(submit) {
    const text = textEl.value;
    if (!currentSessionId) return;
    if (!text.trim() && !submit) return;
    textEl.value = "";
    autoResizeTextarea();
    // Immediate feedback: a headless turn can take several seconds and
    // produces no output at all until it's fully done, which otherwise
    // looks exactly like nothing is happening.
    if (HEADLESS_PRESETS.includes(currentPreset)) {
      if (!text.trim()) return;
      addThinkingIndicator();
    }
    try {
      // withUnlockRetry: a host/root session's first message after the
      // 15-minute window has closed pops the passkey prompt right here,
      // then re-sends this same text automatically once it succeeds
      // (the design notes).
      await withUnlockRetry(() => api(sessionPath(currentSessionId, "/messages", currentOwner), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, submit: !!submit }),
      }));
    } catch (e) {
      // The box was already cleared above (so a *successful* send doesn't
      // flash the old text back before the reply arrives) -- without this,
      // a POST failure (a network blip on the phone, aigw-backend-proxy's
      // socket-activation cold start, a transient 502/504) silently
      // dropped the message with zero indication: the box looked like it
      // had sent, nothing ever reached claude, and there was nothing to
      // retry because the text was already gone. Reported 2026-08-17 as
      // "たまにclaudeにメッセージが届かない" (occasionally, since it only
      // shows up on that one unlucky request). Restoring the text and
      // re-growing the box puts the user back exactly where they were
      // before pressing send/実行, instead of just losing the message.
      //
      // Prepended rather than overwriting (2026-08-29, at the user's
      // request): the failure only surfaces after the request round-trips,
      // by which point the user may have already started typing something
      // new into the now-empty box -- a plain overwrite would silently
      // discard *that* instead.
      textEl.value = textEl.value ? `${text}\n${textEl.value}` : text;
      autoResizeTextarea();
      alert(t("送信に失敗しました: {err}", { err: e.message }) + "\n" + t("もう一度お試しください。"));
    }
  }

  // Grows the composer with its content instead of scrolling a long draft
  // inside a fixed-height box (2026-08-16, at the user's request) -- CSS's
  // own max-height still caps it (see #composer textarea), past which this
  // just leaves the browser's normal internal scrollbar to take over.
  // Resetting to "auto" before reading scrollHeight is required, not just
  // stylistic: scrollHeight otherwise reports the *current* (possibly
  // still-large, from before text was deleted) height's content, so a
  // shrinking edit would never shrink the box back down.
  function autoResizeTextarea() {
    textEl.style.height = "auto";
    textEl.style.height = `${textEl.scrollHeight}px`;
  }
  textEl.addEventListener("input", autoResizeTextarea);

  // ---- Image attachments (2026-09-08) -------------------------------------
  //
  // Claude Code (or whatever else is in the pane) has no notion of "a chat
  // attachment" -- only file paths in its prompt. So this uploads the file,
  // then inserts the path POST /attach hands back as literal text into the
  // composer: sending it from there on is just an ordinary message, same as
  // if the user had typed that path themselves.
  //
  // Kept in sync with aigw-backend's MAX_INBOX_BYTES -- this is only a fast
  // client-side rejection so a large pick fails immediately instead of after
  // a slow upload; the backend enforces the real limit regardless.
  const MAX_ATTACH_BYTES = 100 * 1024 * 1024;

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(",") + 1));
      reader.onerror = () => reject(reader.error || new Error("failed to read the file"));
      reader.readAsDataURL(file);
    });
  }

  // Any file type since 2026-10-07 (user request) -- the session only ever
  // gets a path, so what the file is doesn't matter to anything here.
  async function attachFile(file) {
    if (!currentSessionId) return;
    if (file.size > MAX_ATTACH_BYTES) {
      alert(t("ファイルが大きすぎます(上限{mb}MB)。", { mb: Math.floor(MAX_ATTACH_BYTES / (1024 * 1024)) }));
      return;
    }
    let path;
    try {
      const data_base64 = await fileToBase64(file);
      // withUnlockRetry: same as send() below -- a host/root session's
      // window can have closed since it was opened, and this action is
      // gated exactly like a message into that same session.
      ({ path } = await withUnlockRetry(() => api(sessionPath(currentSessionId, "/attach", currentOwner), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name || (file.type.startsWith("image/") ? "image.png" : "upload"), data_base64 }),
      })));
    } catch (e) {
      alert(t("ファイルの添付に失敗しました: {err}", { err: e.message }));
      return;
    }
    const sep = textEl.value && !/[\s]$/.test(textEl.value) ? " " : "";
    textEl.value = `${textEl.value}${sep}${path} `;
    autoResizeTextarea();
    textEl.focus();
  }

  attachFileInputEl.addEventListener("change", () => {
    const file = attachFileInputEl.files[0];
    attachFileInputEl.value = ""; // so picking the same file again still fires "change"
    if (file) attachFile(file);
  });

  // Clipboard-paste is the other half of "両方で" (2026-09-08): works in
  // every preset, headless "claude" chat included, since the composer
  // itself (unlike #key-toolbar) is never hidden.
  textEl.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      // Any pasted file (not just images, 2026-10-07); plain text pastes
      // have kind "string" and fall through to the normal paste.
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        attachFile(file);
        break; // one file per paste, same as the file picker's one-file flow
      }
    }
  });

  sendBtn.addEventListener("click", () => send(false));
  runBtn.addEventListener("click", () => send(true));
  // The phone keyboard's own return key is the everyday case, so it means 実行.
  // The Enter that confirms an IME conversion (kanji) is not a send
  // (2026-10-26, Mac Chrome sent on confirm): isComposing / keyCode 229 cover
  // most browsers; Safari-style ordering fires compositionend just before
  // that keydown, so an Enter within 50ms of compositionend is skipped too.
  let compositionEndAt = 0;
  textEl.addEventListener("compositionend", () => { compositionEndAt = Date.now(); });
  textEl.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229 || Date.now() - compositionEndAt < 50) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(true);
    }
  });

  function urlBase64ToUint8Array(base64) {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const base64safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64safe);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function setupPush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.register("/agents/sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;
    const { key } = await api("/vapid-public-key").catch(() => ({ key: null }));
    if (!key) return;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await api("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
  }

  // Keeps the page pinned to the *actual* visible area (CSS's own 100dvh
  // already handles the browser's own chrome collapsing/expanding, but not
  // the on-screen keyboard reliably across iOS/Android) by tracking
  // window.visualViewport, which is what actually shrinks when the keyboard
  // opens. Sets --app-height, which index.html's `body` rule reads via
  // `var(--app-height, 100dvh)` -- see that file for the full fallback
  // chain. Falls back to window.innerHeight (won't react to the keyboard,
  // but still better than a hardcoded 100vh) on browsers with no
  // VisualViewport support at all.
  function setupViewportHeight() {
    const vv = window.visualViewport;
    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${h}px`);
    };
    (vv || window).addEventListener("resize", update);
    update();
  }
  setupViewportHeight();

  // ---- extensions (ext/README.md) ------------------------------------------
  //
  // /config's "ext" lists each extension's page files; they are loaded from
  // /agents/ext/<name>/<file> and register themselves with window.aigwExt
  // (static/ext.js), which this file asks at each extension point. What an
  // extension may use of this page is aigwExt.app. None at all is the
  // published core's normal case; one that fails to load is left out.
  window.aigwExt.app = {
    api,
    t,
    escapeHtml,
    plainClick: (e) => plainClick(e),
    sessions: () => lastSessions,
    refreshSessions: () => refreshSessions(),
    // Opens one of this user's sessions by id (refreshing the list first);
    // false when there is no such session.
    async openSessionById(id) {
      const all = await refreshSessions().catch(() => lastSessions);
      const meta = (all || lastSessions).find((x) => x.id === id);
      if (meta) openSession(meta);
      return !!meta;
    },
    findSession: (id) => lastSessions.find((x) => x.id === id) || null,
    openSession: (meta) => openSession(meta),
    // Redraws what extensions add to (the list, the to-do list).
    render() {
      renderSessionList();
      if (todoShown) renderTodo();
    },
  };
  function loadExtFile(name, file, kind) {
    return new Promise((resolve) => {
      const url = `/agents/ext/${encodeURIComponent(name)}/${encodeURIComponent(file)}`;
      const el = kind === "css" ? document.createElement("link") : document.createElement("script");
      if (kind === "css") { el.rel = "stylesheet"; el.href = url; } else { el.src = url; el.async = false; }
      el.onload = () => resolve(true);
      el.onerror = () => { console.error(`extension ${name}: could not load ${file}`); resolve(false); };
      document.head.appendChild(el);
    });
  }
  // Waits for the files (a few seconds at most), so the first paint
  // already has the extensions' folders and words.
  let extLoaded = null;
  async function loadExtensions() {
    let conf;
    try { conf = await api("/config"); } catch (e) { return; }
    const loads = [];
    for (const x of Array.isArray(conf && conf.ext) ? conf.ext : []) {
      for (const f of x.css || []) loads.push(loadExtFile(x.name, f, "css"));
      for (const f of x.js || []) loads.push(loadExtFile(x.name, f, "js"));
    }
    await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 4000))]);
  }
  window.aigwExt.onRegister(() => {
    readExtOpenKeys();
    if (lastVisibleSessions.length) renderSessionList();
  });
  // The page's insertion points (aigwExt slots): the header's links and a
  // row of the settings page.
  function fillExtSlots() {
    window.aigwExt.fillSlot("header-links", document.getElementById("ext-slot-header-links"), window.aigwExt.app);
    window.aigwExt.fillSlot("settings", document.getElementById("ext-slot-settings"), window.aigwExt.app);
  }

  async function init() {
    const extReady = extLoaded = loadExtensions();
    const me = await api("/me").catch(() => null);
    if (!me) {
      location.href = "/agents/";
      return;
    }
    whoEl.textContent = me.username;
    buildKeyToolbar();
    // Display language (the deployment notes): the picker on the settings page, and the
    // choice saved on the server (another device may have changed it).
    const langSelectEl = document.getElementById("lang-select");
    for (const [code, name] of Object.entries(window.aigwI18n.LANGS)) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      langSelectEl.appendChild(opt);
    }
    langSelectEl.value = window.aigwI18n.lang();
    langSelectEl.addEventListener("change", () => window.aigwI18n.setLang(langSelectEl.value));
    window.aigwI18n.syncFromServer();

    // A session (or auth) deep link -- typically a push notification's
    // click, see sw.js -- gets in as fast as possible: applyHash()'s own
    // refreshSessions() call is all it needs. Everything below is state
    // only the *list* view's own controls need (capabilities for the
    // preset dropdown, workdirs for new sessions, tmux-sessions for
    // "attach" candidates) and none of it should hold up a notification tap
    // that already knows exactly which session it wants -- each of those
    // calls is a real network/SSH round trip, and ssh_reachable() alone can
    // cost several seconds per GPU machine that's asleep or off
    // (2026-08-23). This used to run last, so a
    // notification tap paid for all of them before showing anything.
    // The extensions first (one quick call): their folders decide where a
    // session is listed.
    await extReady;
    await applyHash();

    await applyCapabilities();
    // applyHash() above may have picked a machine (a "machine=" hash, or an
    // opened session's own) before the <select> existed -- and, for a
    // session, before ssh_desktop was known, so a desktop variant's session
    // was attributed to the variant itself rather than its base machine,
    // and shown without its 🐚/🪟 badge. Redo both now.
    if (currentSessionMeta) {
      currentMachine = sessionMachine(currentSessionMeta);
      chatLabelEl.textContent = typeIcon(currentSessionMeta) + screenBadge(currentSessionMeta) + currentSessionMeta.label;
    }
    const wanted = currentMachine;
    syncMachineSelect();
    if (currentMachine !== "local") rebuildPresetOptions();
    if (wanted !== currentMachine && !currentSessionId) setHash(listHash());
    // Same for the settings page opened by its hash (a reload there):
    // openAuthView() ran before the "auth" option existed.
    if (viewAuth.style.display === "flex") machineSelectEl.value = "auth";
    updateMachineBtn();
    initUnlockUI();
    fillExtSlots();
    applyPresetOptions();
    await refreshWorkdirs(false);
    await refreshSessions();
    await refreshTmuxSessions();
    // Not awaited: it shells into the container, which is slower than
    // everything else here and shouldn't hold up the first paint.
    refreshAuthStatus();
    setupPush().catch((e) => console.warn("push setup skipped:", e));
  }

  // openSession()/openAuthView() write their state to location.hash
  // precisely so a reload (browser's own, or aigw's #reload-btn/header-
  // swipe) can return here instead of always landing back on the session
  // list -- this reads it back, both right after init() and on every
  // later "hashchange" (below). The hashchange case is what a push
  // notification's click needs: sw.js's client.navigate() changes an
  // already-open client's hash without reloading the page (a same-
  // document, fragment-only navigation), so nothing short of a listener
  // here would ever notice and actually open the session (2026-08-16, at
  // the user's request -- before this, clicking the notification moved
  // the address bar but left whatever view was already on screen alone).
  // #issue=owner/repo%23n (the deployment notes): the link a GitHub issue
  // carries. Asks before starting anything -- the link sits in an issue
  // anyone can read, and what it starts is Claude in this viewer's own devbox.
  async function startIssueSession(ref) {
    let info;
    try {
      info = await api(`/issue?ref=${encodeURIComponent(ref)}`);
    } catch (e) {
      alert(t("Issue を読めませんでした: {err}", { err: e.message }));
      return;
    }
    if (info.sessions.length) {
      if (!confirm(t("この Issue のセッションがすでに動いています。開きますか？"))) return;
      const meta = (await refreshSessions()).find((s) => s.id === info.sessions[0]);
      if (meta) openSession(meta);
      return;
    }
    const repo = info.ref.split("/")[1].split("#")[0];
    if (!info.cloned) {
      alert(t("~/sandhome/{repo} がありません。先に clone してください", { repo }));
      return;
    }
    const lines = [
      `#${info.number} ${info.title}`,
      `Status: ${info.status || "-"} / Worker: ${info.worker || "-"} / ${t("担当")}: ${info.assignees.join(", ") || "-"}`,
    ];
    if (info.state !== "OPEN") lines.push(t("⚠ この Issue は閉じています"));
    else if (info.status !== "Ready" && info.status !== "In progress") lines.push(t("⚠ Status が Ready ではありません"));
    lines.push("", t("この Issue 用の worktree(~/sandhome/{repo}-wt/i{n})で Claude を起動しますか？", { repo, n: info.number }));
    if (!confirm(lines.join("\n"))) return;
    const meta = await withUnlockRetry(() => api("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset: "claude-tui", issue: info.ref, label: `#${info.number} ${info.title}`.slice(0, 80) }),
    })).catch((e) => {
      alert(t("セッションを作成できませんでした: {err}", { err: e.message }));
      return null;
    });
    if (!meta) return;
    await refreshSessions();
    openSession(meta);
  }

  async function applyHash() {
    const hashId = location.hash.slice(1);
    if (hashId.startsWith("issue=")) {
      setHash(""); // one-shot: a reload must not offer to start it again
      await refreshSessions();
      await startIssueSession(decodeURIComponent(hashId.slice("issue=".length)));
      return;
    }
    if (hashId === "auth") {
      // Unconditional, not "only if not already showing": openAuthView()
      // is idempotent (setHash() inside it uses replaceState, so it can't
      // re-trigger this same listener), and this path only ever runs from
      // init() or an externally-driven hashchange in the first place.
      openAuthView();
      return;
    }
    if (!hashId || hashId.startsWith("machine=")) {
      selectMachine(hashId ? decodeURIComponent(hashId.slice("machine=".length)) : "local");
      if (currentSessionId) closeSession();
      else await refreshSessions();
      return;
    }
    if (hashId === currentSessionId) return; // already there
    const sessions = await refreshSessions();
    const meta = sessions.find((s) => s.id === hashId);
    if (meta) openSession(meta);
    else setHash(""); // stale link (session since deleted) -- drop it
  }

  // A plain click on a link an extension handles (aigwExt links): its own
  // way of opening it, not the browser's.
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || !plainClick(e)) return;
    const open = window.aigwExt.linkHandler(a.getAttribute("href"), a);
    if (!open) return;
    e.preventDefault();
    open(a.getAttribute("href"));
  });

  // ---- voice mode (the deployment notes, 2026-11-08) ----------------------------------
  // The user: "aigw を音声だけで操作するモード…クリックやフォーカスの移動が
  // 手作業になって、完全なハンズフリーでは使えない". 🎙 turns it on: the
  // browser's speech recognition listens all the time; a few fixed words
  // act at once (次・読んで・ストップ・はい/いいえ・送信…), everything else goes
  // to the server's resident Haiku (POST /voice/command), which answers with
  // one action. Anything that sends is read back and waits for 「はい」.
  // While this page speaks, listening pauses (so it does not hear itself).
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  // The session list's top bar toggles directly; the open session's header
  // button (#audio-btn) only shows the state -- its menu toggles.
  const voiceBtns = [document.getElementById("voice-btn"), document.getElementById("audio-btn")].filter(Boolean);
  const voiceBarEl = document.getElementById("voice-bar");
  let voiceOn = false;
  let voiceRec = null;
  let voiceSpeaking = false;
  let voicePending = null;   // {say, run} waiting for はい/いいえ
  let voiceDraft = null;     // {session, text} while dictating
  let voiceLastSay = "";
  let voiceSaidEnd = 0;
  let voiceInterimBase = null; // the input box's text before the guess being shown
  // Japanese runs on with no space; a space only between two Latin words.
  const voiceJoin = (a, b) => a + (a && /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? " " : "") + b;
  // Dictation goes where the cursor is, replacing a selection (2026-11-11,
  // the user: マウスで選択してから喋ったら、選択したところが消えてそこに
  // 文字が入るように。今は常に一番後ろに追加される). The textarea keeps its
  // selection while focus is elsewhere, so a selection made before speaking
  // still counts. After it, the cursor sits after what was put in.
  function voiceSplice(base, start, end, text) {
    const before = base.slice(0, start), after = base.slice(end);
    const head = voiceJoin(before, text);
    const sp = after && /[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(after) ? " " : "";
    return { value: head + sp + after, caret: head.length, atEnd: !after };
  }
  function voiceInsert(text) {
    const r = voiceSplice(textEl.value, textEl.selectionStart, textEl.selectionEnd, text);
    textEl.value = r.value;
    textEl.setSelectionRange(r.caret, r.caret);
    autoResizeTextarea();
    if (r.atEnd) textEl.scrollTop = textEl.scrollHeight;
  }
  let voiceTodoDone = new Set();
  const voiceDrive = () => !!(voiceBarEl.querySelector(".drive") || {}).checked;
  const vnorm = (s) => s.replace(/[。、,.!?！？\s]/g, "");

  function voiceShow(heard) {
    const st = voiceBarEl.querySelector(".st");
    st.textContent = voiceDraft
      ? t("✍️ 入力中(「{l}」)— 「送信」で送る・「取り消し」で消す・「入力終わり」でやめる", { l: labelOf(voiceDraft.session) })
      : voicePending ? `❓ ${voicePending.say}` : (heard ? `👂 ${heard}` : t("🎙 聞いています"));
  }
  function labelOf(id) {
    const s = lastSessions.find((x) => x.id === id);
    return s ? s.label : id;
  }
  // Short sounds instead of words for the frequent acknowledgements
  // (2026-11-08, the user: the talkback was too much, and 「送信しました」was
  // lost under the reading of replies). A tone can overlap speech and still
  // be told apart. The context is made on 🎙's own tap (browsers start
  // audio only from one).
  let voiceAudio = null;
  const EARCONS = {
    on: [[660, 0.08], [880, 0.1]],
    start: [[880, 0.07]],          // dictation started
    sent: [[784, 0.07], [1175, 0.12]],
    cancel: [[523, 0.07], [392, 0.12]],
    back: [[660, 0.06]],
    err: [[220, 0.25]],
  };
  function voiceTone(kind) {
    if (!voiceAudio) return;
    let t0 = voiceAudio.currentTime + 0.01;
    for (const [hz, dur] of EARCONS[kind] || []) {
      const o = voiceAudio.createOscillator(), g = voiceAudio.createGain();
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(voiceAudio.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
      t0 += dur + 0.03;
    }
  }
  const voiceTtsAudio = new Audio();
  voiceTtsAudio.preservesPitch = true;
  function voiceHush() { // stop our own voice, either kind
    if (canSpeak) speechSynthesis.cancel();
    if (!voiceTtsAudio.paused) { voiceTtsAudio.pause(); if (voiceTtsAudio.onended) voiceTtsAudio.onended(); }
  }
  function voiceSay(text) {
    return new Promise((resolve) => {
      if (!text || !canSpeak) return resolve();
      voiceLastSay = text;
      voiceSpeaking = true;
      try { if (voiceRec) { voiceRec.abort(); voiceRec.running = false; } } catch (e) {}
      const chunks = speechChunks(speechText(text));
      let i = 0, timer = null;
      const next = () => {
        clearTimeout(timer);
        if (i >= chunks.length || !voiceOn) { voiceSpeaking = false; voiceSaidEnd = Date.now(); voiceListen(); return resolve(); }
        const c = chunks[i++];
        let done = false;
        let via = null; // "device" | "cloud": whichever began, the other keeps out
        const once = () => { if (!done) { done = true; next(); } };
        const device = () => {
          if (done || via === "device") return;
          via = "device";
          clearTimeout(timer);
          const u = utterance(c);
          u.onend = u.onerror = once;
          // Android's speech often reports its end late or not at all, and
          // listening waited for it (2026-11-09, the user: after 「停止しますか」
          // nothing was heard for a while): go on after the time it should take.
          timer = setTimeout(once, 600 + c.length * 120);
          speechSynthesis.speak(u);
        };
        // Google's voice when read-aloud is set to it (2026-11-12, the user,
        // after read-aloud and voice mode came under one button: 読み上げが
        // 古くなってしまいました。GoogleAPI版は？ -- voice mode had always
        // used the device's voice). Any failure: the device's voice.
        if (!useCloud()) return device();
        timer = setTimeout(device, 4000); // Google slow to answer
        loadCloudVoices().then(() => {
          const lang = pieceLang(c);
          const voice = cloudVoiceFor(lang);
          if (!voice) return device();
          if (chunks[i]) { const v2 = cloudVoiceFor(pieceLang(chunks[i])); if (v2) ttsUrl(v2, chunks[i]); }
          return ttsUrl(voice, c).then((url) => {
            if (done || via) return;
            via = "cloud";
            clearTimeout(timer);
            const sink = speakPref(SPEAK_SINK_KEY);
            if (canSink && voiceTtsAudio.sinkId !== sink) voiceTtsAudio.setSinkId(sink).catch(() => {});
            voiceTtsAudio.onended = once;
            voiceTtsAudio.onerror = () => { cloudFailed(); via = null; device(); };
            voiceTtsAudio.src = url;
            voiceTtsAudio.playbackRate = pieceRate(lang);
            timer = setTimeout(once, 3000 + c.length * 250); // onended missing
            return voiceTtsAudio.play();
          });
        }).catch(() => { cloudFailed(); device(); });
      };
      next();
    });
  }
  function voiceListen() {
    if (!voiceOn || voiceSpeaking || !SpeechRec) return;
    if (voiceRec) { voiceRecStart(voiceRec); return; }
    const r = new SpeechRec();
    r.lang = "ja-JP";
    r.continuous = true;
    r.interimResults = true;
    // What is being recognized is shown as it comes (2026-11-08, the user:
    // the text arrived all at once, well after speaking, with nothing to
    // see before): while dictating, straight in the input box (replaced
    // as the guess changes, kept when final); otherwise on the bar.
    // Android's Chrome (2026-11-09, the user: text came in many times over)
    // hands back results already given -- the same final again, and each
    // final holding everything said so far in this run. A final is taken
    // once per index, and on Android only the part after the last one.
    r.onresult = (e) => {
      if (voiceSpeaking) return; // our own voice
      let interim = "";
      const finals = [];
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const tx = res[0].transcript;
        if (!res.isFinal) {
          if (voicePending && !r.doneIdx.has(i)) {
            const g = voiceAndroid && r.lastFinal && tx.trim().startsWith(r.lastFinal) ? tx.trim().slice(r.lastFinal.length) : tx;
            const gn = vnorm(g);
            if (gn && gn.length <= 8 && (VOICE_YES.test(gn) || VOICE_NO.test(gn))) {
              r.doneIdx.add(i);
              r.early = { text: gn, at: Date.now() };
              finals.push(g.trim());
              continue;
            }
          }
          interim += tx;
          continue;
        }
        if (r.doneIdx.has(i)) continue;
        r.doneIdx.add(i);
        const f = voiceNewPart(r, tx.trim());
        // the settled form of an answer already taken from its guess
        if (f && r.early && Date.now() - r.early.at < 4000 && vnorm(f).startsWith(r.early.text)) { r.early = null; continue; }
        if (f) finals.push(f);
      }
      if (voiceAndroid && r.lastFinal && interim.trim().startsWith(r.lastFinal)) interim = interim.trim().slice(r.lastFinal.length);
      if (finals.length && voiceInterimBase !== null) {
        // the guess goes; the final text is put in its place (or acted on) below
        textEl.value = voiceInterimBase.value;
        textEl.setSelectionRange(voiceInterimBase.start, voiceInterimBase.end);
        voiceInterimBase = null;
        autoResizeTextarea();
      }
      for (const f of finals) voiceHeard(f);
      if (interim) {
        if (voiceDraft && currentSessionId === voiceDraft.session) {
          if (voiceInterimBase === null) {
            voiceInterimBase = { value: textEl.value, start: textEl.selectionStart, end: textEl.selectionEnd };
          }
          const b = voiceInterimBase;
          const r = voiceSplice(b.value, b.start, b.end, interim);
          textEl.value = r.value;
          textEl.setSelectionRange(r.caret, r.caret);
          autoResizeTextarea();
          if (r.atEnd) textEl.scrollTop = textEl.scrollHeight;
        } else voiceShow(interim);
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        voiceStop();
        alert(t("マイクを許可してください"));
      }
    };
    // Chrome ends a continuous recognition now and then: start it again.
    r.onend = () => { r.running = false; if (voiceOn && !voiceSpeaking) setTimeout(() => voiceRecStart(r), 250); };
    voiceRec = r;
    voiceRecStart(r);
  }
  // start() throws while the last run is still ending (after an abort for
  // our own speech): try again shortly instead of staying deaf.
  function voiceRecStart(r, tries = 0) {
    if (!voiceOn || voiceSpeaking || r !== voiceRec || r.running) return;
    r.doneIdx = new Set();
    r.lastFinal = "";
    try { r.start(); r.running = true; }
    catch (e) { if (tries < 8) setTimeout(() => voiceRecStart(r, tries + 1), 300); }
  }
  const voiceAndroid = /Android/i.test(navigator.userAgent);
  function voiceNewPart(r, full) {
    if (!voiceAndroid) return full;
    const prev = r.lastFinal;
    r.lastFinal = full;
    if (prev && full.startsWith(prev)) return full.slice(prev.length).trim();
    return full;
  }
  function voiceStart() {
    if (!SpeechRec) return alert(t("音声認識は Chrome か Edge で"));
    voiceOn = true;
    voiceBtns.forEach((b) => b.classList.add("on"));
    voiceBarEl.hidden = false;
    try { voiceAudio = voiceAudio || new (window.AudioContext || window.webkitAudioContext)(); voiceAudio.resume(); } catch (e) {}
    voiceShow();
    voiceTone("on");
    voiceListen();
  }
  function voiceStop() {
    voiceOn = false;
    voicePending = null;
    voiceDraft = null;
    voiceBtns.forEach((b) => b.classList.remove("on"));
    voiceBarEl.hidden = true;
    try { voiceRec && voiceRec.abort(); } catch (e) {}
    voiceRec = null;
    voiceHush();
  }
  document.getElementById("voice-btn").addEventListener("click", () => (voiceOn ? voiceStop() : voiceStart()));
  voiceBarEl.querySelector(".off").addEventListener("click", voiceStop);

  async function voiceSend(sid, text) {
    try {
      await withUnlockRetry(() => api(sessionPath(sid, "/messages", null), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, submit: true }),
      }));
      voiceTone("sent");
    } catch (e) {
      voiceTone("err");
      await voiceSay(e.unlockRequired ? t("解錠してください") : t("送信失敗"));
    }
  }
  function voiceConfirm(say, run) {
    voicePending = { say, run };
    voiceShow();
    return voiceSay(say);
  }
  async function voiceOpen(sid) {
    const meta = lastSessions.find((s) => s.id === sid);
    if (!meta) return false;
    if (currentSessionId !== sid) openSession(meta);
    return true;
  }
  async function voiceSummary(sid) {
    try {
      const r = await api("/voice/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sid }) });
      return r.say || "";
    } catch (e) { return ""; }
  }
  // 「次」: the next session whose turn is yours (and 寝かせ whose date came),
  // opened, its note and a short summary of its last reply read out.
  async function voiceTodoNext() {
    await refreshSessions().catch(() => {});
    const due = lastSessions.filter((s) => ["you", "due"].includes(taskGroup(s)));
    let s = due.find((x) => !voiceTodoDone.has(x.id));
    if (!s && due.length) { voiceTodoDone = new Set(); s = due[0]; }
    if (!s) return voiceSay(t("あなたの番なし"));
    voiceTodoDone.add(s.id);
    await voiceOpen(s.id);
    const note = (s.task && s.task.text) || "";
    await voiceSay(`${s.label}。${note}`);
    const sum = await voiceSummary(s.id);
    if (sum) await voiceSay(sum);
  }
  function voiceUntil(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(str || "");
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0).getTime() / 1000;
  }
  async function voiceAct(a) {
    const sid = a.session;
    switch (a.action) {
      case "open":
        await voiceOpen(sid);
        return voiceSay(labelOf(sid));
      case "send":
        if (!a.text) return voiceSay(a.say || t("何を送りますか"));
        return voiceConfirm(t("「{l}」へ「{x}」。送りますか", { l: labelOf(sid), x: a.text }), () => voiceSend(sid, a.text));
      case "dictate":
        await voiceOpen(sid);
        return voiceStartDictation(sid);
      case "show":
        if (a.what === "email") return voiceShowEmail();
        if (a.what === "todo") return voiceShowTodo();
        return voiceBack();
      case "read":
        await voiceOpen(sid);
        return voiceSay(a.read_text || a.say);
      case "todo":
        return voiceTodoNext();
      case "task": {
        const body = { state: a.state };
        if (a.state === "snooze") {
          const u = voiceUntil(a.until);
          if (!u) return voiceSay(t("日付は？"));
          body.until = u;
        }
        try {
          await api(`/sessions/${encodeURIComponent(sid)}/task`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          return voiceTone("sent");
        } catch (e) { return voiceSay(t("変更失敗")); }
      }
      case "interrupt":
        return voiceInterrupt(sid);
      case "stop":
        return voiceStopSession(sid);
      case "resume":
        return voiceResume(sid);
      case "close":
        if (currentSessionId) closeSession();
        return voiceSay(a.say);
      default:
        return voiceSay(a.say);
    }
  }
  // 中断・停止・再開 (2026-11-08, the user: "セッションの中断・再開も音声で").
  // 中断 is Esc (Claude stops what it is doing, the session stays); 停止
  // ends the session (asked first, like the green dot); 再開 resumes an
  // ended one with its conversation (the grey dot's ↻).
  async function voiceInterrupt(sid) {
    try {
      await withUnlockRetry(() => api(sessionPath(sid, "/keys", null), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "Escape", ctrl: false, alt: false, shift: false }),
      }));
      voiceTone("cancel");
    } catch (e) { voiceTone("err"); return voiceSay(e.unlockRequired ? t("解錠してください") : t("中断失敗")); }
  }
  function voiceStopSession(sid) {
    const s = lastSessions.find((x) => x.id === sid);
    if (!s || s.alive === false) return voiceSay(t("止まっています"));
    return voiceConfirm(t("「{l}」を停止しますか", { l: s.label }), async () => {
      try {
        await withUnlockRetry(() => api(sessionPath(sid, "/stop", null), { method: "POST" }));
        if (currentSessionId === sid) closeSession(); else await refreshSessions();
        voiceTone("sent");
      } catch (e) { voiceTone("err"); return voiceSay(e.unlockRequired ? t("解錠してください") : t("停止失敗")); }
    });
  }
  async function voiceResume(sid) {
    await refreshSessions().catch(() => {});
    const s = lastSessions.find((x) => x.id === sid);
    if (!s) return voiceSay(t("どのセッション？"));
    if (s.alive) return voiceSay(t("動いています"));
    if (s.owner || !canResumeEnded(s)) return voiceSay(t("再開できません"));
    await voiceSay(s.label);
    return resumeEndedSession(s, true);
  }
  function voiceStartDictation(sid) {
    voiceDraft = { session: sid };
    voiceInterimBase = null;
    voiceShow();
    textEl.focus({ preventScroll: true });
    voiceTone("start");
  }
  async function voiceComposerSend() {
    const d = voiceDraft;
    if (!textEl.value.trim()) return voiceSay(t("空です"));
    // Dictation goes on after a send, until 「入力終わり」 (2026-11-09, the
    // user: having to say 「入力」 again after every 送信 was tedious).
    const go = async () => {
      await send(true);
      if (currentSessionId !== d.session) { voiceDraft = null; voiceShow(); }
      voiceTone("sent");
    };
    if (voiceDrive()) return voiceConfirm(t("「{l}」へ「{x}」。送りますか", { l: labelOf(d.session), x: textEl.value }), go);
    return go();
  }
  function voiceShowTodo() {
    showTodoView(true);
    const n = lastSessions.filter((s) => ["you", "due"].includes(taskGroup(s))).length;
    return voiceSay(t("やること、{n}件", { n }));
  }
  // The Email box's page (/email/): the way an extension opens it over this
  // page (aigwExt links) when there is one, else a tab of its own.
  function voiceShowEmail() {
    const open = window.aigwExt.linkHandler("/email/");
    if (open) open("/email/");
    else window.open("/email/", "_blank");
    return voiceSay(t("メール"));
  }
  function voiceBack() {
    if (window.aigwExt.closeOverlay()) { /* the extension's overlay closed */ }
    else if (todoShown) hideTodoView();
    else if (currentSessionId) closeSession();
    voiceTone("back");
  }
  textEl.addEventListener("focus", () => {
    if (voiceOn && currentSessionId && !voiceDraft) { voiceDraft = { session: currentSessionId }; voiceShow(); }
  });

  // Answers to a question (はい/いいえ). Taken from the guess already, not
  // only once the recognizer settles on it (2026-11-09, the user: answering
  // 「停止しますか」 took very long -- on Android the settled result comes
  // well after one stops talking).
  const VOICE_YES = /^(はい|はーい|うん|お願い|送って|オッケー|オーケー|OK|いいよ|どうぞ)/i;
  const VOICE_NO = /^(いいえ|いや|やめ|キャンセル|取り消|違う|ちがう|だめ|ダメ|ノー)/;
  const VOICE_DICT_END = /^(入力|書き取り)(終わり|終わって|終了|停止|ストップ|やめ|やめて|止めて|を終わって|を終了|を止めて|をやめて)(して)?$/;
  async function voiceHeard(text) {
    if (!text) return;
    // Our own words caught by the mic (the end of speech is guessed on
    // Android, see voiceSay): what was just said is not taken as an answer.
    const bare = (x) => (x || "").replace(/[^\p{L}\p{N}]/gu, "");
    const said = bare(voiceLastSay), heard = bare(text);
    if (said && heard.length >= 3 && Date.now() - voiceSaidEnd < 5000 && said.includes(heard)) return;
    voiceShow(text);
    const n = vnorm(text);
    if (voicePending) {
      const p = voicePending;
      if (VOICE_YES.test(n)) { voicePending = null; voiceShow(); return p.run(); }
      if (VOICE_NO.test(n)) { voicePending = null; voiceShow(); return voiceTone("cancel"); }
      return voiceSay(t("はい か いいえ で"));
    }
    if (voiceDraft) {
      // Dictation goes into the session's own input box (2026-11-08, the
      // user could not find how to get the transcript into it).
      if (currentSessionId !== voiceDraft.session) { voiceDraft = null; voiceShow(); }
      else {
        if (/^(送信|送信して|送信します|送って|送る|送ります|実行|実行して|そうしん|ソウシン)$/.test(n)) return voiceComposerSend();
        if (/^(取り消し|キャンセル|消して|全部消して)$/.test(n)) {
          textEl.value = ""; autoResizeTextarea(); voiceDraft = null; voiceShow();
          return voiceTone("cancel");
        }
        if (VOICE_DICT_END.test(n)) { voiceDraft = null; voiceShow(); return voiceTone("back"); }
        if (/^(読んで|読み上げて|確認)$/.test(n)) return voiceSay(textEl.value || t("空です"));
        if (/^改行$/.test(n)) { voiceInsert("\n"); return; }
        voiceInsert(text);
        return;
      }
    }
    // 「入力停止」 outside dictation must not become 停止 (2026-11-09: it was
    // taken as stopping the session).
    if (VOICE_DICT_END.test(n)) return voiceTone("back");
    if (/^(中断|中断して|エスケープ|作業を止めて|作業中断)$/.test(n)) {
      if (!currentSessionId) return voiceSay(t("セッションを開いて"));
      return voiceInterrupt(currentSessionId);
    }
    if (/^(停止|停止して|セッションを止めて|セッション停止|終了して)$/.test(n)) {
      if (!currentSessionId) return voiceSay(t("セッションを開いて"));
      return voiceStopSession(currentSessionId);
    }
    if (/^(再開|再開して|続きから|続きから再開)$/.test(n)) {
      if (!currentSessionId) return voiceSay(t("セッションを開いて"));
      return voiceResume(currentSessionId);
    }
    if (/^(書いて|入力|入力して|書き取り|口述)$/.test(n)) {
      if (!currentSessionId) return voiceSay(t("セッションを開いて"));
      return voiceStartDictation(currentSessionId);
    }
    if (/^(やること|やることリスト|ToDo|トゥードゥー)$/i.test(n)) return voiceShowTodo();
    if (/^(メール|メール一覧|新着まとめ|メールのリスト|Eメール)$/i.test(n)) return voiceShowEmail();
    if (/^(戻る|閉じて|戻って|一覧|一覧に戻って)$/.test(n)) return voiceBack();
    if (/^(ストップ|止めて|静かに|黙って)$/.test(n)) { speechSynthesis.cancel(); voiceHush(); return; }
    if (/^(もう一度|もう一回|もういっかい)$/.test(n)) return voiceSay(voiceLastSay);
    if (/^(次|次の|つぎ)$/.test(n)) return voiceTodoNext();
    if (/^(音声モード終了|音声終わり|おしまい)$/.test(n)) { await voiceSay(t("終わります")); return voiceStop(); }
    if (/^(読んで|要約して)$/.test(n) && currentSessionId) return voiceSay((await voiceSummary(currentSessionId)) || t("返事なし"));
    voiceBarEl.classList.add("busy");
    try {
      const a = await api("/voice/command", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, current: currentSessionId, mode: voiceDrive() ? "drive" : "desk" }),
      });
      await voiceAct(a);
    } catch (e) {
      voiceTone("err");
    } finally {
      voiceBarEl.classList.remove("busy");
      voiceShow();
    }
  }

  window.addEventListener("hashchange", applyHash);
  // sw.js's notificationclick posts {type: "open-session"} to an already-open
  // window rather than relying on WindowClient.navigate(), which not every
  // browser has (iOS Safari) -- 2026-10-04, at the user's request
  // ("通知を開いたときに、当該セッションが開きません").
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.type === "open-session" && typeof d.session_id === "string") {
        setHash(d.session_id);
        applyHash();
      }
    });
  }

  init();
})();
