// The public shape: a copy of email-digest/ with the private paths deleted (what publish-snapshot leaves) must still
// load, start and handle mail (and calendar-rule) items, with no reference errors. ARCHITECTURE.md 6.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path';
import { coreTests } from './core-cases.mjs'; import { makeBox, startServer, PRIVATE, FIX, denyHits } from './helpers.mjs';

const PENDING = {};
const pub = (o = {}) => makeBox({ ...o, drop: PRIVATE, publicOnly: true });
// errors that mean "the core named something that is not there"
const REFERR = /not found|No such file|Cannot find|ERR_MODULE_NOT_FOUND|ENOENT|ReferenceError|SyntaxError|Traceback/;

coreTests('public', pub, PENDING);

test('public: the private paths are really gone from the copy', () => {
  const b = pub();
  try { for (const p of PRIVATE) assert.equal(fs.existsSync(path.join(b.src, p)), false, p); assert.equal(fs.existsSync(path.join(b.code, 'private')), false); }
  finally { b.cleanup(); }
});

test('public: page and counts show mail only, with no private names', PENDING, async () => {
  const b = pub({ items: JSON.parse(fs.readFileSync(path.join(FIX, 'items-mail.json'), 'utf8')) });
  const s = await startServer(b);
  try {
    const p = await s.get('/email/');
    assert.equal(p.status, 200);
    assert.match(p.text, /<h1>新着まとめ\(メール\)<\/h1>/);
    assert.deepEqual(denyHits(p.text), []);
    assert.doesNotMatch(s.output(), REFERR);
  } finally { await s.stop(); b.cleanup(); }
});

test('public: conf.mjs example / check, compose', PENDING, () => {
  const b = pub();
  try {
    assert.deepEqual(JSON.parse(b.node('conf.mjs', ['example']).stdout), JSON.parse(fs.readFileSync(path.join(b.code, 'config.example.json'), 'utf8')));
    const c = b.node('compose.mjs', []);
    assert.equal(c.status, 0, c.stderr);
    for (const f of ['PROCEDURE.md', 'CLAUDE.md']) {
      const t = fs.readFileSync(path.join(b.code, f), 'utf8');
      assert.doesNotMatch(t, /\{\{|\}\}|<!-- slot/, f);
      assert.deepEqual(denyHits(t), [], f);
    }
  } finally { b.cleanup(); }
});

test('public: run-check.sh reaches claude with a mail-only request and no missing commands', PENDING, () => {
  const b = pub({ items: { items: [], runs: [] } });
  try {
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000}');
    const r = b.run('sh', [path.join(b.code, 'run-check.sh')]);
    assert.equal(r.status, 0, r.stderr);
    const log = fs.readFileSync(path.join(b.code, 'run.log'), 'utf8');
    assert.doesNotMatch(log + r.stderr, REFERR);
    const cl = b.calls().filter(c => c[0] === 'claude');
    assert.equal(cl.length, 1);
    const prompt = cl[0][cl[0].indexOf('-p') + 1];
    assert.match(prompt, /PROCEDURE\.md/);
    assert.deepEqual(denyHits(prompt), []);
    assert.deepEqual([...new Set(b.calls().map(c => c[0]))].sort(), ['claude', 'curl', 'uuidgen']);
  } finally { b.cleanup(); }
});

test('public: quick-check.sh fetches the mail list, shows the flash, asks claude, ends done', PENDING, () => {
  const b = pub({ items: { items: [], runs: [] } });
  try {
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000}');
    const list = path.join(b.root, 'list.jsonl');
    fs.writeFileSync(list, JSON.stringify({ id: 'm1', threadId: '18a0000000000021', date: 'Wed, 05 Nov 2026 09:00:00 +0900', from: 'a@example.com', subject: '急ぎ', snippet: '' }) + '\n');
    const r = b.run('sh', [path.join(b.code, 'quick-check.sh')], { env: { FAKE_GMAIL_LIST: list } });
    assert.equal(r.status, 0, r.stderr);
    const log = fs.readFileSync(path.join(b.code, 'run.log'), 'utf8');
    assert.doesNotMatch(log, REFERR);
    assert.equal(JSON.parse(fs.readFileSync(path.join(b.code, 'quick.json'), 'utf8')).state, 'done');
    assert.equal(JSON.parse(fs.readFileSync(path.join(b.code, 'quick', 'quick-raw.json'), 'utf8')).length, 1);
    const cl = b.calls().filter(c => c[0] === 'claude');
    assert.equal(cl.length, 1);
    assert.deepEqual(denyHits(cl[0].join(' ')), []);
  } finally { b.cleanup(); }
});
