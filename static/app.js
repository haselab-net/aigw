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
  function setHash(value) {
    const url = value ? `${location.pathname}${location.search}#${value}` : `${location.pathname}${location.search}`;
    history.replaceState(null, "", url);
  }

  const viewList = document.getElementById("view-list");
  const viewChat = document.getElementById("view-chat");
  const viewAuth = document.getElementById("view-auth");
  const topHeaderEl = document.getElementById("top-header");
  const sessionsEl = document.getElementById("sessions");
  const archiveToggleBtn = document.getElementById("archive-toggle-btn");
  const archivedListEl = document.getElementById("archived-list");
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
  const sshCwdChildEl = document.getElementById("ssh-cwd-child");

  // Working directory for a new claude session, relative to ~/sandhome
  // ("" = ~/sandhome itself). Walked one level at a time, so it can go as
  // deep as the tree does.
  let currentCwd = "";

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
  // instead (#ssh-cwd-opts, sshCwdMachines below) -- never
  // added to this list, since it has no resume and is rooted at a drive
  // letter, not ~/sandhome.
  const CWD_PRESETS = ["claude", "claude-tui"];
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
  let dragState = null;
  // Archived sessions are display-only: hidden
  // from the main list, shown instead in #archived-list once the toggle
  // button is pressed. Recomputed on every refreshSessions(); archivedVisible
  // survives across refreshes (a manual toggle) but resets to closed on
  // reload, same as sessionMachine/currentMachine above.
  let archivedVisible = false;
  let lastArchivedSessions = [];
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
    return loc.startsWith("ssh:") ? loc.slice(4) : "local";
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
    currentMachine = machineSelectEl.value;
    currentSshCwd = ""; // a path on the previous machine means nothing on this one
    if (viewAuth.style.display !== "none") {
      // Was viewing the auth page -- picking any real machine here is now
      // the only way to leave it (no back button there
      // any more, 2026-08-15, at the user's request).
      viewAuth.style.display = "none";
      viewList.style.display = "block";
      setHash("");
    }
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
      opt.textContent = "Shell (root・sandbox外)";
      presetEl.appendChild(opt);
      // Same gate as the preset option above: the root Claude-auth row is
      // only ever useful to a user who can reach the root tmux server at all.
      document.getElementById("auth-row-root").classList.add("visible");
    }
    localPresetOptionsHtml = presetEl.innerHTML;

    sshCwdMachines = caps.ssh_machines_drives || [];

    machineSelectEl.innerHTML = "";
    const localOpt = document.createElement("option");
    localOpt.value = "local";
    localOpt.textContent = MACHINE_LABELS.local;
    machineSelectEl.appendChild(localOpt);
    for (const machine of caps.ssh_machines || []) {
      MACHINE_LABELS[machine] = machine;
      const opt = document.createElement("option");
      opt.value = machine;
      opt.textContent = machine;
      machineSelectEl.appendChild(opt);
      addSshAuthRow(machine);
    }
    // Not a machine -- a one-shot navigation to view-auth, always last in
    // the list ("ホスト一覧の一番下", 2026-08-15). Renamed "Claude 認証" ->
    // "設定" (2026-08-18) once that page grew a second, unrelated concern
    // (Kill Chrome) -- see index.html's comment on #auth-header.
    const authOpt = document.createElement("option");
    authOpt.value = "auth";
    authOpt.textContent = "設定";
    machineSelectEl.appendChild(authOpt);
    machineSelectEl.addEventListener("change", applyMachineFilter);
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
    claudeOptsEl.classList.toggle("visible", CWD_PRESETS.includes(presetEl.value));
    // #ssh-cwd-opts: only for a drives-capable machine's
    // own Claude preset ("claude-tui-<machine>") -- "Shell" on the same
    // machine gets no picker either, same as the local "shell" preset.
    const showSshCwd = sshCwdMachines.includes(currentMachine) && presetEl.value === `claude-tui-${currentMachine}`;
    sshCwdOptsEl.classList.toggle("visible", showSshCwd);
    if (showSshCwd) refreshSshWorkdirs();
  }

  // Re-reads the level `currentCwd` points at. A directory that has since
  // been renamed or deleted answers 400, which drops us back to ~/sandhome
  // rather than leaving the UI pointing at something that isn't there.
  async function refreshWorkdirs() {
    const asked = currentCwd;
    const r = await api(`/workdirs?dir=${encodeURIComponent(asked)}`).catch(() => null);
    if (asked !== currentCwd) return; // a later navigation already won
    if (!r) {
      if (currentCwd === "") return;
      currentCwd = "";
      return refreshWorkdirs();
    }
    currentCwd = r.dir;
    cwdCrumbEl.textContent = currentCwd ? `sandhome/${currentCwd}` : "sandhome";
    cwdUpBtn.disabled = !currentCwd;

    cwdChildEl.innerHTML = "";
    const head = document.createElement("option");
    head.value = "";
    head.textContent = r.subdirs.length ? "サブフォルダを開く…" : "(サブフォルダなし)";
    cwdChildEl.appendChild(head);
    cwdChildEl.disabled = !r.subdirs.length;
    for (const name of r.subdirs) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      cwdChildEl.appendChild(opt);
    }
    await refreshConversations();
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
    sshCwdCrumbEl.textContent = atRoot ? "ドライブを選択…" : mountPathLabel(currentSshCwd);
    sshCwdUpBtn.disabled = atRoot;

    sshCwdChildEl.innerHTML = "";
    const items = atRoot ? r.drives : r.subdirs;
    const head = document.createElement("option");
    head.value = "";
    head.textContent = items.length
      ? (atRoot ? "ドライブを選ぶ…" : "サブフォルダを開く…")
      : (atRoot ? "(ドライブが見つかりません)" : "(サブフォルダなし)");
    sshCwdChildEl.appendChild(head);
    sshCwdChildEl.disabled = !items.length;
    for (const name of items) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = atRoot ? `${name.toUpperCase()}:` : name;
      sshCwdChildEl.appendChild(opt);
    }
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

  // Conversations are per-directory (Claude Code files them under the cwd
  // they ran in), so this reruns on every navigation.
  async function refreshConversations() {
    const cwd = currentCwd;
    resumeEl.innerHTML = "";
    const fresh = document.createElement("option");
    fresh.value = "";
    fresh.textContent = "新規";
    resumeEl.appendChild(fresh);
    const { conversations } = await api(`/claude-conversations?cwd=${encodeURIComponent(cwd)}`)
      .catch(() => ({ conversations: [] }));
    // A slow directory read could land after the user has already picked
    // another directory; that answer belongs to the old one, so drop it.
    if (currentCwd !== cwd) return;
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
      resumeEl.appendChild(opt);
    }
  }

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
    container: "sandboxコンテナ内",
    host: "このホスト(sandbox外・あなた自身)",
    root: "このホストの root",
  };

  function setChecking(el) {
    el.textContent = "確認中…";
    el.className = "auth-status-text";
  }

  // Shared by all three rows (container/host/root) -- st is one of
  // GET /claude-auth's per-scope values: null (root only, no root-shell
  // access -- the row is hidden anyway, see applyCapabilities()),
  // {"error": "..."} (the check itself failed), or the loggedIn/email/etc
  // shape `claude auth status --json` returns.
  function renderAuthStatus(el, st) {
    if (st == null) {
      el.textContent = "権限なし";
      el.className = "auth-status-text";
    } else if (st.error) {
      el.textContent = st.error;
      el.className = "auth-status-text err";
    } else if (st.loggedIn) {
      const detail = [st.authMethod, st.orgName, st.subscriptionType].filter(Boolean).join(" / ");
      el.textContent = `${st.email || "ログイン済み"}${detail ? ` (${detail})` : ""}`;
      el.className = "auth-status-text in";
    } else {
      el.textContent = "未ログイン";
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
      if (!confirm(`${AUTH_SCOPE_LABELS[scope]}のClaude Codeをログアウトします。よろしいですか?`)) return;
      const r = await withUnlockRetry(() => api("/claude-auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      })).catch((e) => ({ error: e.message }));
      if (r.error) alert(`ログアウトに失敗しました: ${r.error}`);
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
        alert(`ログインを開始できませんでした: ${e.message}`);
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
        <span class="auth-status-text">確認中…</span>
      </div>
      <div class="auth-actions">
        <button class="auth-login" data-scope="${scope}">ログイン</button>
        <button class="auth-logout" data-scope="${scope}">ログアウト</button>
      </div>`;
    document.getElementById("claude-auth-section").appendChild(row);
    authStatusEls[scope] = row.querySelector(".auth-status-text");
    const loginBtn = row.querySelector("button.auth-login");
    const logoutBtn = row.querySelector("button.auth-logout");
    wireAuthLoginButton(loginBtn);
    wireAuthLogoutButton(logoutBtn);
    authLoginBtns = [...authLoginBtns, loginBtn];
    authLogoutBtns = [...authLogoutBtns, logoutBtn];
  }

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
    chromeKillStatusEl.textContent = "実行中…";
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
      chromeKillStatusEl.textContent = "停止しました";
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
    killChrome("all", "全ユーザーのheadful ChromeをKillします。よろしいですか?"));

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
    attachBtn.title = "画像を添付";
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
        throw new Error("このブラウザはパスキー(WebAuthn)に対応していません");
      }
      const begin = await api("/unlock/begin-assertion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!begin.ok) throw new Error(begin.error || "認証を開始できませんでした");
      let cred;
      try {
        cred = await navigator.credentials.get({ publicKey: requestOptionsFromWire(begin.options) });
      } catch (e) {
        throw new Error(`生体認証がキャンセルまたは失敗しました: ${e.message}`);
      }
      const finish = await api("/unlock/finish-assertion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialToJSON(cred) }),
      });
      if (!finish.ok) throw new Error(finish.error || "認証に失敗しました");
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
    if (!tier || !currentSessionMeta.alive) {
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
    unlockBadgeEl.title = `${label} がアンロック中。タップでロック(今すぐ解除)`;
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
    if (!confirm("root/hostのアンロックを今すぐ解除しますか?")) return;
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

  function addThinkingIndicator() {
    removeThinkingIndicator();
    const div = document.createElement("div");
    div.className = "bubble agent thinking";
    div.id = "thinking-indicator";
    div.textContent = "考え中…";
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
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
  const INLINE_RE = /(https?:\/\/[^\s<>"']+)|\*\*([^\n*]+?)\*\*/g;

  function setTextWithLinks(el, text) {
    el.textContent = "";
    let last = 0;
    for (const m of text.matchAll(INLINE_RE)) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        const a = document.createElement("a");
        a.href = m[1];
        a.textContent = m[1];
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        el.appendChild(a);
      } else {
        const strong = document.createElement("strong");
        strong.textContent = m[2];
        el.appendChild(strong);
      }
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
      agentsPaneEl.innerHTML = '<div class="agents-empty">サブエージェントはまだありません</div>';
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
    back.textContent = "← 一覧";
    back.addEventListener("click", () => {
      currentAgentId = null;
      agentsPaneEl.innerHTML = '<div class="agents-empty">読み込み中…</div>';
      refreshAgentsList();
    });
    header.appendChild(back);
    header.appendChild(document.createTextNode(description));
    agentsPaneEl.appendChild(header);
    const body = document.createElement("div");
    body.className = "agent-detail-body";
    setTextWithLinks(body, text || "(まだ内容がありません)");
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
    agentsPaneEl.innerHTML = '<div class="agents-empty">読み込み中…</div>';
    refreshAgentDetail();
  }

  function setAgentsVisible(on) {
    agentsVisible = on;
    agentsPaneEl.classList.toggle("visible", on);
    agentsBtn.classList.toggle("active", on);
    stopAgentsPoll();
    if (!on) return;
    currentAgentId = null;
    agentsPaneEl.innerHTML = '<div class="agents-empty">読み込み中…</div>';
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
      alert(`ダウンロードに失敗しました${res ? `: ${res.status}` : ""}`);
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
    shareBtn.classList.toggle("shared", !currentOwner && currentSharedWith.length > 0);
  }

  function renderSharePane() {
    updateShareBtnColor();
    const save = `
      <div class="share-save">
        <button id="share-download-btn">💾 会話ログを保存</button>
      </div>`;
    // Sharing *management* stays owner-only -- currentOwner set means this
    // session was shared to me, not mine to re-share.
    if (currentOwner) {
      sharePaneEl.innerHTML = save;
      sharePaneEl.querySelector("#share-download-btn").addEventListener("click", downloadTranscript);
      return;
    }
    const risky = currentPreset === "host-shell" || currentPreset === "root-shell";
    const warn = risky
      ? `<div class="share-warn">⚠️ 共有すると、相手はあなた${currentPreset === "root-shell" ? "(root)" : ""}と同じ権限でコマンドを実行できます。</div>`
      : "";
    const rows = currentSharedWith.length
      ? currentSharedWith.map((u) => `
          <div class="share-row" data-user="${escapeHtml(u)}">
            <span>${escapeHtml(u)}</span>
            <button class="unshare-btn">解除</button>
          </div>`).join("")
      : `<div class="share-empty">まだ誰とも共有していません</div>`;
    sharePaneEl.innerHTML = `
      ${save}
      ${warn}
      ${rows}
      <div class="share-add">
        <input type="text" id="share-username" placeholder="ユーザー名" autocapitalize="off" autocorrect="off">
        <button id="share-add-btn">共有する</button>
      </div>`;
    sharePaneEl.querySelector("#share-download-btn").addEventListener("click", downloadTranscript);
    sharePaneEl.querySelectorAll(".unshare-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const username = btn.closest(".share-row").dataset.user;
        try {
          const meta = await api(`/sessions/${currentSessionId}/unshare`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
          });
          currentSharedWith = meta.shared_with || [];
          renderSharePane();
        } catch (e) {
          alert(`共有解除に失敗しました: ${e.message}`);
        }
      });
    });
    sharePaneEl.querySelector("#share-add-btn").addEventListener("click", async () => {
      const input = sharePaneEl.querySelector("#share-username");
      const username = input.value.trim();
      if (!username) return;
      try {
        const meta = await api(`/sessions/${currentSessionId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        currentSharedWith = meta.shared_with || [];
        input.value = "";
        renderSharePane();
      } catch (e) {
        alert(`共有に失敗しました: ${e.message}`);
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
  function renderAttachment(div, sessionId, filename, kind, displayName) {
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
    if (kind === "model3d") {
      const btn = document.createElement("button");
      btn.className = "attachment-card";
      btn.innerHTML = `<span class="attachment-icon">🧊</span><span class="attachment-name"></span>`;
      btn.querySelector(".attachment-name").textContent = label;
      // A new tab, not a same-page modal: opening a 3D model this way gives
      // an orbit/zoom-capable viewer the whole screen instead of fighting
      // the chat view's own scroll/swipe. The actual viewer page is a
      // site-extras.js concern (see initSiteExtras() above) -- the
      // published core has no dedicated 3D viewer of its own, so absent
      // that, the plain file just opens as the browser's own default
      // handling for whatever this attachment's mime type is.
      btn.addEventListener("click", () => {
        if (window.aigwSiteExtras?.openModel3d) window.aigwSiteExtras.openModel3d(url, label);
        else window.open(url, "_blank");
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

  function renderEvent(sessionId, ev) {
    // Ephemeral, and not a conversation event: it carries no seq, is never
    // written to events.jsonl, and must not disturb the chat log — including
    // the thinking indicator, which every other event clears.
    if (ev.type === "screen") {
      applyScreen(ev.text);
      return;
    }

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
      if (!liveBubbleEl) {
        liveBubbleEl = document.createElement("div");
        liveBubbleEl.className = "bubble agent live";
        messagesEl.appendChild(liveBubbleEl);
      }
      setTextWithLinks(liveBubbleEl, ev.text);
      messagesEl.scrollTop = messagesEl.scrollHeight;
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
        tag.textContent = "⏎なし";
        div.appendChild(tag);
      }
    } else if (ev.type === "agent_output") {
      div.className = "bubble agent";
      setTextWithLinks(div, ev.text);
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
      renderAttachment(div, sessionId, ev.filename, ev.kind, ev.source_filename);
    } else if (ev.type === "session_ended") {
      if (sessionId === currentSessionId) {
        chatDotEl.className = "dot stopped";
        // A dead session's pane has nothing further to arrive -- see
        // updateUnlockNotice()'s own alive check.
        if (currentSessionMeta) currentSessionMeta.alive = false;
        updateUnlockNotice();
      }
      div.className = "bubble system";
      // exit_status is only present when the pane was kept around long
      // enough to be read (aigw-backend's remain-on-exit path); a nonzero
      // one is worth showing, since the message that explains it is the
      // bubble immediately above this one.
      div.textContent = ev.exit_status
        ? `セッションは終了しました (終了コード ${ev.exit_status})`
        : "セッションは終了しました";
      // A claude-login pane ends exactly when `claude auth login` is done,
      // success or failure -- i.e. this is the moment the auth panel's
      // answer changed, and the user should not have to press ⟳ to find out.
      if (sessionId === currentSessionId && String(currentPreset).startsWith("claude-login")) {
        refreshAuthStatus();
      }
    } else if (ev.type === "system") {
      div.className = "bubble system";
      div.textContent = ev.text;
    } else {
      return;
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
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

  async function refreshSessions() {
    const [{ sessions: ownSessions }, sharedSessions, order] = await Promise.all([
      api("/sessions"),
      api("/shared-with-me").then((r) => r.sessions).catch(() => []),
      api("/session-order").then((r) => r.order).catch(() => sessionOrder),
    ]);
    sessionOrder = order;
    // owner is absent (falsy) on every entry from /sessions (one's own) and
    // set to the owning username on every /shared-with-me entry -- the same
    // field openSession() reads into currentOwner.
    const merged = [...ownSessions, ...sharedSessions];
    sessionsEl.innerHTML = "";
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
      if (a.alive) return b.created_ts - a.created_ts;
      return (b.ended_ts ?? b.created_ts) - (a.ended_ts ?? a.created_ts);
    });
    const sessions = applyCustomOrder(merged, sessionOrder);
    // Kept unfiltered so a drag's saveSessionOrder() can merge the visible
    // (machine-filtered) subset's new order back without losing the
    // relative position of sessions the filter is currently hiding.
    lastSessions = sessions;
    // Filtered by the header's machine selector -- the full unfiltered list
    // is still returned below so init()'s hash-restore can find a session
    // that belongs to a machine other than the one currently selected.
    // Archived sessions are excluded from this
    // main list -- they still count towards the drag-order/machine-filter
    // bookkeeping via `sessions`/`lastSessions` above, only the rendering
    // splits them out into #archived-list below.
    const visible = sessions.filter((s) => sessionMachine(s) === currentMachine);
    for (const s of visible.filter((s) => !s.archived)) {
      const row = document.createElement("div");
      row.className = "session-row";
      row.dataset.sessionId = s.id;
      // s.owner is only ever present on a /shared-with-me
      // entry -- shown as a badge so a shared session is never mistaken for
      // one's own, since it can be co-worked (messages/keys/stop) but not
      // renamed/deleted/archived from here (owner-only, see aigw-backend).
      const ownerBadge = s.owner ? ` &middot; ${escapeHtml(s.owner)}さんと共有` : "";
      row.innerHTML = `
        <div>
          <span class="drag-handle" title="ドラッグで並べ替え">⠿</span>
          <span class="dot ${s.alive ? "alive" : "stopped"}"></span>
          <span class="label">${escapeHtml(s.label)}</span>
          <div class="meta">${s.preset}${cwdSuffix(s)} &middot; ${fmtTime(s.created_ts)}${ownerBadge}</div>
        </div>`;
      row.addEventListener("click", () => openSession(s));
      wireSessionDrag(row.querySelector(".drag-handle"), row);

      if (!s.owner) {
        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.textContent = "✏️";
        editBtn.title = "名前を変更";
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // don't also open the session
          renameSession(s);
        });
        row.appendChild(editBtn);

        const archiveBtn = document.createElement("button");
        archiveBtn.className = "archive-btn";
        archiveBtn.textContent = "🗄";
        archiveBtn.title = "アーカイブへ移動";
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

      sessionsEl.appendChild(row);
    }
    lastArchivedSessions = visible.filter((s) => s.archived);
    renderArchivedSection();
    return sessions;
  }

  // The bottom-of-list "🗄 アーカイブを開く" button and the (initially
  // hidden) archived-sessions panel it reveals.
  // Re-run on every refreshSessions() so counts/rows stay current; the open
  // state itself (archivedVisible) is only ever flipped by the button click
  // below.
  function renderArchivedSection() {
    archiveToggleBtn.textContent = archivedVisible
      ? "🗄 アーカイブを閉じる"
      : `🗄 アーカイブを開く (${lastArchivedSessions.length})`;
    archivedListEl.hidden = !archivedVisible;
    archivedListEl.innerHTML = "";
    if (!archivedVisible) return;
    for (const s of lastArchivedSessions) {
      const row = document.createElement("div");
      row.className = "session-row";
      row.dataset.sessionId = s.id;
      const ownerBadge = s.owner ? ` &middot; ${escapeHtml(s.owner)}さんと共有` : "";
      row.innerHTML = `
        <div>
          <span class="dot ${s.alive ? "alive" : "stopped"}"></span>
          <span class="label">${escapeHtml(s.label)}</span>
          <div class="meta">${s.preset}${cwdSuffix(s)} &middot; ${fmtTime(s.created_ts)}${ownerBadge}</div>
        </div>`;
      row.addEventListener("click", () => openSession(s));

      if (!s.owner) {
        const restoreBtn = document.createElement("button");
        restoreBtn.className = "archive-btn";
        restoreBtn.textContent = "📤";
        restoreBtn.title = "アーカイブから戻す";
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

      archivedListEl.appendChild(row);
    }
  }

  archiveToggleBtn.addEventListener("click", () => {
    archivedVisible = !archivedVisible;
    renderArchivedSection();
  });

  async function archiveSession(meta) {
    await api(`/sessions/${meta.id}/archive`, { method: "POST" }).catch((e) =>
      alert(`アーカイブできませんでした: ${e.message}`));
    await refreshSessions();
  }

  async function unarchiveSession(meta) {
    await api(`/sessions/${meta.id}/unarchive`, { method: "POST" }).catch((e) =>
      alert(`元に戻せませんでした: ${e.message}`));
    await refreshSessions();
  }

  // Drag-to-reorder: pointer events cover both mouse
  // and touch in one handler, unlike the touchstart/touchmove pairs used
  // elsewhere in this file for the (touch-only) edge-swipe gestures. The
  // dragged row follows the pointer via `transform: translateY()`; other
  // rows shift out of the way the same way, purely visually -- the DOM
  // itself is only reordered once, in endSessionDrag(), by comparing each
  // row's position in `rows` (captured at pointerdown, so it stays stable
  // for the whole gesture) against the live targetIndex.
  function wireSessionDrag(handle, row) {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault(); // no text selection / native drag while dragging
      const rows = Array.from(sessionsEl.children);
      dragState = {
        pointerId: e.pointerId,
        row,
        rows,
        originalIndex: rows.indexOf(row),
        targetIndex: rows.indexOf(row),
        rowHeight: row.getBoundingClientRect().height,
        startY: e.clientY,
      };
      row.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      const dy = e.clientY - dragState.startY;
      dragState.row.style.transform = `translateY(${dy}px)`;
      const raw = dragState.originalIndex + Math.round(dy / dragState.rowHeight);
      const targetIndex = Math.max(0, Math.min(dragState.rows.length - 1, raw));
      dragState.targetIndex = targetIndex;
      for (const r of dragState.rows) {
        if (r === dragState.row) continue;
        const j = dragState.rows.indexOf(r);
        let shift = 0;
        if (dragState.originalIndex < targetIndex && j > dragState.originalIndex && j <= targetIndex) {
          shift = -dragState.rowHeight; // row moved down past it -- it slides up
        } else if (dragState.originalIndex > targetIndex && j < dragState.originalIndex && j >= targetIndex) {
          shift = dragState.rowHeight; // row moved up past it -- it slides down
        }
        r.style.transform = shift ? `translateY(${shift}px)` : "";
      }
    });
    const stop = (e) => {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      endSessionDrag();
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    // A plain tap on the handle (pointerdown+up with no real movement) still
    // bubbles a click to the row below, which would open the session --
    // exactly like editBtn/delBtn below, this must not happen.
    handle.addEventListener("click", (e) => e.stopPropagation());
  }

  function endSessionDrag() {
    const { row, rows, targetIndex } = dragState;
    const newRows = rows.filter((r) => r !== row);
    newRows.splice(targetIndex, 0, row);
    for (const r of rows) {
      r.style.transform = "";
      r.classList.remove("dragging");
    }
    for (const r of newRows) sessionsEl.appendChild(r); // reorders in place
    dragState = null;
    saveSessionOrder(newRows.map((r) => r.dataset.sessionId));
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
    api("/session-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: sessionOrder }),
    }).catch(() => {});
  }

  async function deleteSession(meta) {
    if (!confirm(`「${meta.label}」の会話ログを削除します。元に戻せません。よろしいですか?`)) return;
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
    }).catch((e) => alert(`名前を変更できませんでした: ${e.message}`));
    await refreshSessions();
    // The chat header's own label is a separate DOM element (set once in
    // openSession(), not re-read from the session list) -- keep it in sync
    // if the session being renamed is the one currently open.
    if (currentSessionId === meta.id) chatLabelEl.textContent = trimmed;
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
    for (const { name, location } of sessions.filter((s) => machineOf(s.location) === currentMachine)) {
      const row = document.createElement("div");
      row.className = "tmux-row";
      const nameEl = document.createElement("span");
      nameEl.className = "name";
      nameEl.textContent = `${name} (${locationLabel(location)})`;
      row.appendChild(nameEl);

      const btn = document.createElement("button");
      btn.textContent = "接続";
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
      alert(`接続に失敗しました: ${e.message}`);
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
        tag.textContent = "⏎なし";
        div.appendChild(tag);
      }
    } else if (ev.type === "agent_output") {
      div.className = "bubble agent";
      setTextWithLinks(div, ev.text);
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
      renderAttachment(div, sessionId, ev.filename, ev.kind, ev.source_filename);
    } else if (ev.type === "session_ended") {
      div.className = "bubble system";
      div.textContent = ev.exit_status
        ? `セッションは終了しました (終了コード ${ev.exit_status})`
        : "セッションは終了しました";
    } else if (ev.type === "system") {
      div.className = "bubble system";
      div.textContent = ev.text;
    } else {
      return null;
    }
    return div;
  }

  async function loadOlderHistory() {
    if (loadingHistory || !hasMoreHistory || oldestLoadedSeq === null || !currentSessionId) return;
    loadingHistory = true;
    setHistoryTopText("読み込み中…");
    const sessionId = currentSessionId;
    const owner = currentOwner;
    try {
      const page = await api(sessionPath(sessionId, `/events/page?before=${oldestLoadedSeq}&limit=${HISTORY_PAGE_LIMIT}`, owner));
      if (sessionId !== currentSessionId) return; // switched sessions while this was in flight
      const prevScrollHeight = messagesEl.scrollHeight;
      const prevScrollTop = messagesEl.scrollTop;
      const frag = document.createDocumentFragment();
      for (const ev of page.events) {
        const div = buildHistoryBubble(sessionId, ev);
        if (div) frag.appendChild(div);
      }
      messagesEl.insertBefore(frag, historyTopEl.nextSibling);
      // Keeps whatever the user was looking at in place rather than jumping
      // as new content grows the pane above it.
      messagesEl.scrollTop = prevScrollTop + (messagesEl.scrollHeight - prevScrollHeight);
      hasMoreHistory = page.has_more;
      if (page.events.length) oldestLoadedSeq = Math.min(...page.events.map((e) => e.seq));
      setHistoryTopText(hasMoreHistory ? "" : "ここが会話の最初です");
    } catch (e) {
      setHistoryTopText("読み込みに失敗しました(スクロールでやり直せます)");
    } finally {
      loadingHistory = false;
    }
  }

  messagesEl.addEventListener("scroll", () => {
    if (messagesEl.scrollTop < 80) loadOlderHistory();
  });

  async function connectSessionEvents(meta) {
    oldestLoadedSeq = null;
    hasMoreHistory = false;
    loadingHistory = false;
    setHistoryTopText("");
    let since = 0;
    try {
      const page = await api(sessionPath(meta.id, `/events/page?limit=${HISTORY_PAGE_LIMIT}`, currentOwner));
      if (meta.id !== currentSessionId) return; // switched sessions while this was in flight
      for (const ev of page.events) renderEvent(meta.id, ev);
      hasMoreHistory = page.has_more;
      if (page.events.length) {
        oldestLoadedSeq = page.events[0].seq;
        since = page.events[page.events.length - 1].seq;
      }
      // Only worth saying for an actual (if short) conversation -- a brand
      // new, still-empty session has nothing to mark the "start" of yet.
      setHistoryTopText(!hasMoreHistory && page.events.length ? "ここが会話の最初です" : "");
    } catch (e) {
      // Falls through to a from-scratch SSE replay (since=0) below -- worse
      // than the fast path, but still correct, and the initial history
      // fetch failing at all should be rare.
    }
    if (meta.id !== currentSessionId) return;
    if (currentEventSource) currentEventSource.close();
    currentEventSource = new EventSource(sessionApiUrl(meta.id, `/events?since=${since}`, currentOwner));
    currentEventSource.onmessage = (e) => {
      try {
        renderEvent(meta.id, JSON.parse(e.data));
      } catch (err) {
        console.error("bad event", err);
      }
    };
  }

  function openSession(meta) {
    currentSessionId = meta.id;
    currentPreset = meta.preset;
    currentSessionMeta = meta;
    updateUnlockNotice();
    // Set by refreshSharedWithMe() tagging -- absent (falsy)
    // for one's own sessions, which is the only case sessionPath()/
    // sessionApiUrl() need to tell apart.
    currentOwner = meta.owner || null;
    chatLabelEl.textContent = meta.label;
    chatOwnerBadgeEl.textContent = currentOwner ? `${currentOwner}さんと共有中` : "";
    // The panel itself is now always reachable (2026-08-28): it also holds
    // 💾 save, which a shared viewer needs too. The sharing *management*
    // controls rendered inside stay owner-only (renderSharePane checks
    // currentOwner) -- managing sharing on a session shared *to* me is not
    // something sharing is meant to also grant.
    shareBtn.title = currentOwner ? "保存" : "共有";
    currentSharedWith = currentOwner ? [] : (meta.shared_with || []);
    updateShareBtnColor();
    setShareVisible(false);
    chatDotEl.className = `dot ${meta.alive ? "alive" : "stopped"}`;
    messagesEl.innerHTML = "";
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
    const hasPane = !HEADLESS_PRESETS.includes(meta.preset);
    keyToolbarEl.classList.toggle("visible", hasPane);
    screenBtn.style.display = hasPane ? "" : "none";
    // "Type without submitting" needs somewhere for the characters to sit
    // between calls, which only a real pane has -- a headless turn is a whole
    // message or nothing, so 実行 is the only button there.
    sendBtn.classList.toggle("hidden", !hasPane);
    latestScreen = "";
    setScreenVisible(false);
    setAgentsVisible(false);
    setHash(meta.id);

    if (currentEventSource) currentEventSource.close();
    currentEventSource = null;
    connectSessionEvents(meta);
  }

  function closeSession() {
    if (currentEventSource) currentEventSource.close();
    currentEventSource = null;
    currentSessionId = null;
    currentOwner = null;
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
      setHash("");
      refreshAuthStatus();
    }
    refreshSessions();
    refreshTmuxSessions();
    // A finished conversation is itself resumable, and an agent may have
    // created directories -- so both pickers are re-read on the way back.
    refreshWorkdirs();
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
    if (confirm(`${whoEl.textContent} からログアウトしますか？`)) {
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
    createBtn.textContent = "起動中…";
    try {
      const preset = presetEl.value;
      const label = document.getElementById("label").value;
      const body = { preset, label, cols: computeScreenCols(), rows: computeScreenRows() };
      // The backend rejects these outright for the plain shells rather than
      // ignoring them, so only send them for the presets they apply to.
      if (CWD_PRESETS.includes(preset)) {
        body.cwd = currentCwd;
        body.resume = resumeEl.value;
      } else if (sshCwdMachines.includes(currentMachine) && preset === `claude-tui-${currentMachine}`) {
        // No resume counterpart, see create_session.
        body.cwd = currentSshCwd;
      }
      // Only the claude-tui presets honor this (see aigw-backend's
      // CLAUDE_TUI_PRESETS/create_session) -- the headless "claude" preset
      // hardcodes it unconditionally already, and the plain shells have no
      // such flag at all.
      if (preset === "claude-tui" || preset.startsWith("claude-tui-")) {
        body.skip_permissions = skipPermissionsEl.checked;
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
        alert(`セッションを作成できませんでした: ${e.message}`);
        return null;
      });
      if (!meta) return;
      document.getElementById("label").value = "";
      resumeEl.value = "";
      await refreshSessions();
      openSession(meta);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = originalLabel;
    }
  });

  document.getElementById("back-btn").addEventListener("click", closeSession);

  // Force-stopping a still-*running* session -- aborting a hung shell, or a
  // claude turn the user doesn't want to wait out -- is not something the
  // automatic dead-pane/remain-on-exit detection (aigw-backend) can ever
  // replace: there is nothing to detect until a session already stops on
  // its own. It used to be a dedicated, always-visible 停止 button;
  // replaced 2026-08-16 (at the user's request, now that natural exits are
  // caught automatically) with a long-press on the status dot + a
  // confirm() dialog, so ending a still-running session takes a deliberate
  // gesture rather than an ordinary tap that sits among harmless buttons.
  (function () {
    const LONG_PRESS_MS = 600;
    let pressTimer = null;
    function arm() {
      if (!currentSessionId) return;
      pressTimer = setTimeout(async () => {
        pressTimer = null;
        if (!confirm("このセッションを強制終了しますか？(まだ動いている場合のみ意味があります)")) return;
        try {
          await withUnlockRetry(() => api(sessionPath(currentSessionId, "/stop", currentOwner), { method: "POST" }));
        } catch (e) {
          alert(`停止できませんでした: ${e.message}`);
          return;
        }
        closeSession();
      }, LONG_PRESS_MS);
    }
    function disarm() {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }
    chatDotEl.addEventListener("touchstart", arm, { passive: true });
    chatDotEl.addEventListener("touchend", disarm);
    chatDotEl.addEventListener("touchmove", disarm);
    chatDotEl.addEventListener("mousedown", arm);
    chatDotEl.addEventListener("mouseup", disarm);
    chatDotEl.addEventListener("mouseleave", disarm);
  })();

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
      alert(`送信に失敗しました: ${e.message}\nもう一度お試しください。`);
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
  const MAX_ATTACH_BYTES = 15 * 1024 * 1024;

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(",") + 1));
      reader.onerror = () => reject(reader.error || new Error("failed to read the file"));
      reader.readAsDataURL(file);
    });
  }

  async function attachImageFile(file) {
    if (!currentSessionId) return;
    if (!file.type || !file.type.startsWith("image/")) {
      alert("画像ファイルのみ添付できます。");
      return;
    }
    if (file.size > MAX_ATTACH_BYTES) {
      alert(`画像が大きすぎます(上限${Math.floor(MAX_ATTACH_BYTES / (1024 * 1024))}MB)。`);
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
        body: JSON.stringify({ filename: file.name || "image.png", data_base64 }),
      })));
    } catch (e) {
      alert(`画像の添付に失敗しました: ${e.message}`);
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
    if (file) attachImageFile(file);
  });

  // Clipboard-paste is the other half of "両方で" (2026-09-08): works in
  // every preset, headless "claude" chat included, since the composer
  // itself (unlike #key-toolbar) is never hidden.
  textEl.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) attachImageFile(file);
        break; // one image per paste, same as the file picker's one-file flow
      }
    }
  });

  sendBtn.addEventListener("click", () => send(false));
  runBtn.addEventListener("click", () => send(true));
  // The phone keyboard's own return key is the everyday case, so it means 実行.
  textEl.addEventListener("keydown", (e) => {
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

  // Optional deployment-supplied extension (see the two "Extension point"
  // comments in index.html, and site-extras.js's own route in the
  // gateway) -- a plain object a deployment's own site-extras.js assigns
  // to window.aigwSiteExtras before this file's own <script> tag runs.
  // Absent in the published core, so every call site here (and the
  // model3d attachment handler below) treats it as fully optional.
  function initSiteExtras() {
    if (!window.aigwSiteExtras?.init) return;
    try {
      window.aigwSiteExtras.init({
        api,
        headerLinksEl: document.getElementById("site-extra-header-links"),
        authRowsEl: document.getElementById("site-extra-auth-rows"),
      });
    } catch (e) {
      console.error("site-extras init failed:", e);
    }
  }

  async function init() {
    const me = await api("/me").catch(() => null);
    if (!me) {
      location.href = "/agents/";
      return;
    }
    whoEl.textContent = me.username;
    buildKeyToolbar();

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
    await applyHash();

    await applyCapabilities();
    initUnlockUI();
    initSiteExtras();
    applyPresetOptions();
    await refreshWorkdirs();
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
  async function applyHash() {
    const hashId = location.hash.slice(1);
    if (hashId === "auth") {
      // Unconditional, not "only if not already showing": openAuthView()
      // is idempotent (setHash() inside it uses replaceState, so it can't
      // re-trigger this same listener), and this path only ever runs from
      // init() or an externally-driven hashchange in the first place.
      openAuthView();
      return;
    }
    if (!hashId) {
      if (currentSessionId) closeSession();
      return;
    }
    if (hashId === currentSessionId) return; // already there
    const sessions = await refreshSessions();
    const meta = sessions.find((s) => s.id === hashId);
    if (meta) openSession(meta);
    else setHash(""); // stale link (session since deleted) -- drop it
  }

  window.addEventListener("hashchange", applyHash);

  init();
})();
