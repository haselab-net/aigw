// Cases for the core (public part) as it behaves today, with mail items only. Must pass before and after the split,
// in the full repo and (via shape.test.mjs) in the public shape. Fake data only.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path';
import { makeBox, startServer, FIX } from './helpers.mjs';

const ITEMS = () => JSON.parse(fs.readFileSync(path.join(FIX, 'items-mail.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Run every test here against a box built by `mk` (shape.test.mjs reuses this with the private paths dropped)
export function coreTests(label, mk, opts = {}) {
  test(`${label}: conf.mjs get / hooks / check`, opts, () => {
    const b = mk({ conf: { hooks: { preCheck: [{ cmd: 'echo hi', timeout: 5 }, 'true'] } } });
    try {
      assert.equal(b.node('conf.mjs', ['get', 'me.name']).stdout, '田中\n');
      assert.equal(b.node('conf.mjs', ['get', 'me.mentions']).stdout, '@田中\n');
      assert.equal(b.node('conf.mjs', ['get', 'no.such', 'dflt']).stdout, 'dflt\n');
      assert.equal(b.node('conf.mjs', ['get', 'session.preset']).stdout, 'mail-tui\n');
      assert.equal(b.node('conf.mjs', ['hooks', 'preCheck']).stdout, '5\techo hi\n300\ttrue\n');
      const j = JSON.parse(b.node('conf.mjs', ['json']).stdout);
      assert.equal(j.account, 'test@example.com');
      assert.deepEqual(j.session, { preset: 'mail-tui', cwd: 'digest', group: 'digest' });
      const c = b.node('conf.mjs', ['check']);
      assert.equal(c.status, 0);
      assert.match(c.stdout, /設定: .*local\/config\.json/);
      assert.match(c.stdout, /local\/PROCEDURE\.md/);
      assert.match(c.stdout, /local\/RULES\.md/);
    } finally { b.cleanup(); }
  });

  test(`${label}: conf.mjs without local/config.json falls back to defaults; account from .gmail/account`, opts, () => {
    const b = mk();
    try {
      fs.rmSync(path.join(b.code, 'local', 'config.json'));
      const j = JSON.parse(b.node('conf.mjs', ['json']).stdout);
      assert.equal(j.account, 'test@example.com');
      assert.equal(j.pageUrl, '/email/');
      assert.match(j.notifyUrl, /^http:\/\/172\.17\.0\.1:\d+\/notify$/);
      assert.match(b.node('conf.mjs', ['check']).stdout, /設定が無い/);
    } finally { b.cleanup(); }
  });

  test(`${label}: server page, auth, rows, counts, status change runs done-sync (mail archive)`, opts, async () => {
    const b = mk({ items: ITEMS() });
    const s = await startServer(b);
    try {
      assert.equal((await s.get('/email/', {})).status, 403);
      const p = await s.get('/email/');
      assert.equal(p.status, 200);
      for (const id of ['mail:18a0000000000001', 'mail:18a0000000000002', 'mail:18a0000000000003', 'misc:noaction'])
        assert.ok(p.text.includes(`data-id="${id}"`), id);
      assert.ok(p.text.includes('[定形済] 定例会の日程'));
      assert.ok(p.text.includes('data-mobile="https://mail.google.com/mail/mu/mp/39/#cv/all/18a0000000000001"'));
      assert.ok(p.text.includes('待ち: 条件: 伊藤さんから資料が届いたら'));
      // the refs list of the summary item: one ref marked in the text, the other listed
      assert.match(p.text, /要約に無い元のメッセージ 1件/);
      const c = JSON.parse((await s.get('/email/counts')).text);
      assert.equal(c.unread, 2); assert.equal(c.undecided, 1); assert.equal(c.fired, 0);
      const r = await s.get('/email/row?id=' + encodeURIComponent('mail:18a0000000000002'));
      assert.equal(r.status, 200); assert.ok(r.text.includes('打ち合わせの案内'));
      assert.equal((await s.get('/email/row?id=nope')).status, 404);
      assert.equal((await s.get('/email/rows?status=' + encodeURIComponent('既決') + '&offset=0')).text.includes('済んだ話'), true);
      assert.equal((await s.post('/email/status', { id: 'mail:18a0000000000002', status: '既決' })).status, 200);
      assert.equal((await s.post('/email/status', { id: 'mail:18a0000000000002', status: 'bad' })).status, 400);
      let it; for (let i = 0; i < 100; i++) { it = b.items().items.find(x => x.id === 'mail:18a0000000000002'); if (it.synced) break; await sleep(100); }
      assert.equal(it.status, '既決'); assert.equal(it.byUser, true);
      assert.deepEqual(it.synced.how, 'gmail.py archive');
      assert.ok(b.calls().some(c => c[0] === 'gmail.py' && c[1] === 'archive' && c.includes('18a0000000000002')));
      assert.equal((await s.post('/email/session', { id: 'mail:18a0000000000003', session: { id: 'sess-1', claude_session_id: 'x' } })).status, 200);
      assert.equal(b.items().items.find(x => x.id === 'mail:18a0000000000003').status, '未決');
    } finally { await s.stop(); b.cleanup(); }
  });

  test(`${label}: add.mjs adds, keeps the owner's status, reopens, merges the summary item`, opts, () => {
    const b = mk({ items: ITEMS() });
    try {
      const f = path.join(b.root, 'new.json');
      fs.writeFileSync(f, JSON.stringify([
        { id: 'mail:18a0000000000009', source: 'mail', time: '2026-11-05T09:00', from: '山本', title: '新しい依頼', summary: '依頼。', action: '返信', status: '未決', link: '' },
        { id: 'mail:18a0000000000001', source: 'mail', time: '2026-11-01T09:00', from: '佐藤', title: '書類の確認のお願い', summary: '更新。', action: '', status: '未読', link: '' },
        { id: 'mail:18a0000000000004', source: 'mail', time: '2026-11-05T10:00', from: '高橋', title: '済んだ話', summary: '新しい返信。', action: '返信', status: '未決', link: '' },
        { id: 'misc:noaction', source: 'misc', time: '2026-11-05T12:00', from: '定期チェック', title: '対応不要のまとめ', summary: '11/05 12:00 [メール] 配信: [配信元B](mail:18a00000000000b1 mail:18a00000000000b2)(案内)', action: '', link: '', refs: [] },
      ]));
      const r = b.node('add.mjs', [f, 'テストのメモ']);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /^added 2, total 7$/m);
      assert.match(r.stderr, /REOPEN mail:18a0000000000004/);
      const d = b.items(), by = Object.fromEntries(d.items.map(i => [i.id, i]));
      assert.equal(by['mail:18a0000000000009'].status, '未決');
      assert.equal(by['mail:18a0000000000001'].status, '未決');           // byUser keeps the owner's status
      assert.equal(by['mail:18a0000000000001'].summary, '更新。');
      assert.equal(by['mail:18a0000000000004'].status, '未決');
      assert.equal(by['mail:18a0000000000004'].synced, undefined);
      const m = by['misc:noaction'];
      assert.equal(m.summary.split('\n').length, 2);
      assert.ok(m.summary.startsWith('11/05 12:00'));
      assert.deepEqual(m.refs, ['mail:18a00000000000a1', 'mail:18a00000000000a2', 'mail:18a00000000000b1', 'mail:18a00000000000b2']);
      assert.equal(d.runs.at(-1).note, 'テストのメモ');
    } finally { b.cleanup(); }
  });

  test(`${label}: done-sync archive of done mail and summary refs; --mail-done records`, opts, () => {
    const items = ITEMS();
    items.items.find(i => i.id === 'misc:noaction').status = '既決';
    items.items.push({ id: 'mail:18a000000000000c', source: 'mail', time: '2026-11-05T09:00', from: 'x', title: '片付け待ち', summary: '', status: '既決' });
    const b = mk({ items });
    try {
      const r = b.node('done-sync.mjs');
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /todo 2 refs 2/);
      assert.match(r.stdout, /mail 18a000000000000c archived 片付け待ち/);
      assert.match(r.stdout, /mail 18a00000000000a1 archived \(misc:noaction の refs\)/);
      const by = Object.fromEntries(b.items().items.map(i => [i.id, i]));
      assert.ok(by['mail:18a000000000000c'].synced);
      assert.ok(by['misc:noaction'].synced);
      // read-only token: only list, then the caller moves them out of the inbox and records
      const items2 = ITEMS(); items2.items.push({ id: 'mail:18a000000000000d', source: 'mail', time: '2026-11-05T09:00', from: 'x', title: 't', summary: '', status: '既決' });
      fs.writeFileSync(path.join(b.code, 'items.json'), JSON.stringify(items2));
      fs.writeFileSync(path.join(b.home, '.gmail', 'token.json'), JSON.stringify({ scopes: ['https://www.googleapis.com/auth/gmail.readonly'] }));
      assert.match(b.node('done-sync.mjs').stdout, /^mail 18a000000000000d t$/m);
      assert.equal(b.items().items.find(i => i.id === 'mail:18a000000000000d').synced, undefined);
      b.node('done-sync.mjs', ['--mail-done', '18a000000000000d']);
      assert.equal(b.items().items.find(i => i.id === 'mail:18a000000000000d').synced.how, 'gmail archived');
    } finally { b.cleanup(); }
  });

  test(`${label}: set-status, item, wait set/list/fire/clear/tick`, opts, () => {
    const b = mk({ items: ITEMS() });
    try {
      assert.equal(b.node('set-status.mjs', ['mail:18a0000000000002', '未決', 'メモ']).status, 0);
      assert.equal(b.items().items.find(i => i.id === 'mail:18a0000000000002').note, 'メモ');
      assert.equal(b.node('set-status.mjs', ['mail:18a0000000000002', 'bad']).status, 2);
      assert.equal(JSON.parse(b.node('item.mjs', ['mail:18a0000000000001']).stdout).threadId, '18a0000000000001');
      assert.equal(b.node('wait.mjs', ['set', 'mail:18a0000000000002', '--at', '2020-01-01T09:00', '--task', '催促する']).status, 0);
      const l = b.node('wait.mjs', ['list']).stdout.trim().split('\n').map(x => JSON.parse(x));
      assert.deepEqual(l.map(x => x.id).sort(), ['mail:18a0000000000002', 'mail:18a0000000000005']);
      b.node('wait.mjs', ['tick']);                 // notify goes to 127.0.0.1:9 and fails; only logged
      const w = b.items().items.find(i => i.id === 'mail:18a0000000000002').wait;
      assert.ok(w.fired); assert.match(w.why, /2020-01-01 09:00 になりました/);
      assert.match(fs.readFileSync(path.join(b.code, 'wait.log'), 'utf8'), /notify mail:18a0000000000002 → ERR/);
      assert.equal(b.node('wait.mjs', ['fire', 'mail:18a0000000000005', '届いた']).status, 0);
      assert.equal(b.items().items.find(i => i.id === 'mail:18a0000000000005').status, '未決');
      b.node('wait.mjs', ['clear', 'mail:18a0000000000005']);
      assert.equal(b.items().items.find(i => i.id === 'mail:18a0000000000005').wait, undefined);
    } finally { b.cleanup(); }
  });

  test(`${label}: quick-raw.mjs turns the mail list into the flash rows`, opts, () => {
    const b = mk();
    try {
      const q = path.join(b.root, 'quick'); fs.mkdirSync(q);
      fs.writeFileSync(path.join(q, 'q-mail.jsonl'), [
        { id: 'm1', threadId: '18a0000000000011', date: 'Wed, 05 Nov 2026 09:00:00 +0900', from: '"佐藤" <sato@example.com>', subject: '急ぎの件', snippet: '本日中に' },
        { id: 'm2', threadId: '18a0000000000012', date: 'Wed, 05 Nov 2026 10:00:00 +0900', from: 'info@example.org', subject: 'お知らせ', snippet: '' },
      ].map(x => JSON.stringify(x)).join('\n') + '\n');
      const r = b.node('quick-raw.mjs', [q]);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(fs.readFileSync(path.join(q, 'quick-raw.json'), 'utf8'));
      assert.deepEqual(out.map(x => [x.source, x.time, x.from, x.title]), [['mail', '2026-11-05T10:00', 'info@example.org', 'お知らせ'], ['mail', '2026-11-05T09:00', '佐藤', '急ぎの件']]);
      assert.ok(out[1].link.endsWith('#all/FAKE18a0000000000011'));
    } finally { b.cleanup(); }
  });
}
