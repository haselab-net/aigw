// The page's extension registry (ext/README.md): window.aigwExt.
//
// An extension's page files (listed in /config's "ext", loaded by app.js
// from /agents/ext/<name>/<file>) call aigwExt.register(name, hooks), and
// app.js asks this registry at each of its extension points. No DOM here,
// so it runs in node too (tests/test_ext_frontend.py). A hook that throws
// is logged and counts as no answer: an extension never stops the page.
//
// hooks:
//   folders: [{id, label, draggable, hideWhenEmpty, ownArchive,
//              archiveOpen, archiveClose, openKey}]
//                          built-in folders' look (the backend's api.folder)
//   folderOf(session)      -> folder id or null, for a session no folder
//                             was chosen for
//   todo: {load() -> Promise, rows(session) -> [row], extraRows() -> [row]}
//                          the to-do list: rows(s) add to one session's
//                          entry ({title} replaces its title; {href, icon,
//                          tip} adds a link button), extraRows() are entries
//                          on top ({href, icon, who, msg, className})
//   links: [{match(url, el) -> bool, open(url, el)}]
//                          a plain click on a link in the page
//   back() -> bool         true: this Back (popstate) is the extension's,
//                          the page leaves it alone
//   closeOverlay(then) -> bool
//                          true: the extension had something over the page,
//                          closes it and calls then() once it is gone (false:
//                          nothing there, then() not called)
//   model3d(url, label, opts) -> bool
//                          opens a 3D model attachment its own way
//   slots: {"header-links": fn(el, app), "settings": fn(el, app)}
//                          the page's insertion points
//   i18n: {en: {...}, "zh-CN": {...}} (or a plain {ja: en})
//                          the extension's own words
(() => {
  "use strict";
  const exts = [];
  const listeners = [];

  function guard(name, what, fn, fallback) {
    try {
      return fn();
    } catch (e) {
      console.error(`aigw extension ${name}: ${what}:`, e);
      return fallback;
    }
  }
  function each(fn) {
    for (const e of exts) fn(e.name, e.hooks || {});
  }

  const x = {
    // Set by app.js: what an extension may use of the page (api, t,
    // openSessionById, refresh, ...).
    app: null,

    register(name, hooks) {
      exts.push({ name: String(name), hooks: hooks || {} });
      const h = hooks || {};
      if (h.i18n && typeof window !== "undefined" && window.aigwI18n) {
        guard(name, "i18n", () => {
          const langs = Object.keys(h.i18n).every((k) => k === "en" || k === "zh-CN");
          window.aigwI18n.add(langs ? h.i18n : { en: h.i18n });
        });
      }
      for (const fn of listeners) guard(name, "listener", () => fn(name));
    },
    // fn(name) after each register (app.js re-renders what it showed).
    onRegister(fn) {
      listeners.push(fn);
    },
    names() {
      return exts.map((e) => e.name);
    },
    folders() {
      const out = [];
      each((name, h) => {
        for (const f of Array.isArray(h.folders) ? h.folders : []) out.push(Object.assign({ ext: name }, f));
      });
      return out;
    },
    folder(id) {
      return x.folders().find((f) => f.id === id) || null;
    },
    folderOf(session) {
      let found = null;
      each((name, h) => {
        if (found || typeof h.folderOf !== "function") return;
        found = guard(name, "folderOf", () => h.folderOf(session), null) || null;
      });
      return found;
    },
    todoRows(session) {
      const out = [];
      each((name, h) => {
        if (!h.todo || typeof h.todo.rows !== "function") return;
        const r = guard(name, "todo.rows", () => h.todo.rows(session), []);
        if (Array.isArray(r)) out.push(...r);
      });
      return out;
    },
    extraTodoRows() {
      const out = [];
      each((name, h) => {
        if (!h.todo || typeof h.todo.extraRows !== "function") return;
        const r = guard(name, "todo.extraRows", () => h.todo.extraRows(), []);
        if (Array.isArray(r)) out.push(...r);
      });
      return out;
    },
    // One promise per extension with a todo.load; each settles (never
    // rejects), so Promise.all of them waits for all.
    loadAll() {
      const out = [];
      each((name, h) => {
        if (!h.todo || typeof h.todo.load !== "function") return;
        out.push(Promise.resolve()
          .then(() => h.todo.load())
          .catch((e) => console.error(`aigw extension ${name}: todo.load:`, e)));
      });
      return out;
    },
    // The open function of the first extension link that matches, or null.
    linkHandler(url, el) {
      let found = null;
      each((name, h) => {
        if (found) return;
        for (const l of Array.isArray(h.links) ? h.links : []) {
          if (guard(name, "links.match", () => l.match(url, el), false)) {
            found = (u) => guard(name, "links.open", () => l.open(u === undefined ? url : u, el), null);
            return;
          }
        }
      });
      return found;
    },
    back() {
      let taken = false;
      each((name, h) => {
        if (!taken && typeof h.back === "function") taken = !!guard(name, "back", () => h.back(), false);
      });
      return taken;
    },
    // True when an extension had something over the page: it closes it and
    // calls then() once it is gone. False: nothing was there, then() is not
    // called (the caller goes on at once).
    closeOverlay(then) {
      let taken = false;
      each((name, h) => {
        if (!taken && typeof h.closeOverlay === "function") {
          taken = !!guard(name, "closeOverlay", () => h.closeOverlay(then), false);
        }
      });
      return taken;
    },
    model3d(url, label, opts) {
      let taken = false;
      each((name, h) => {
        if (!taken && typeof h.model3d === "function") taken = !!guard(name, "model3d", () => h.model3d(url, label, opts), false);
      });
      return taken;
    },
    // Runs every extension's fn for one insertion point.
    fillSlot(slot, el, app) {
      each((name, h) => {
        const fn = h.slots && h.slots[slot];
        if (typeof fn === "function") guard(name, `slot ${slot}`, () => fn(el, app));
      });
    },
    i18n() {
      const out = {};
      each((name, h) => {
        if (h.i18n && typeof h.i18n === "object") Object.assign(out, h.i18n);
      });
      return out;
    },
  };
  window.aigwExt = x;
})();
