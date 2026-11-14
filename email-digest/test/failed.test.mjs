// A source that cannot be read (its tool fails) is told to the user, and the check does not move
// cursor.json's last past it: the next check reads from the same time again.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path';
import { makeBox, PRIVATE } from './helpers.mjs';

function fakeExt(b, cmd) {
  const ext = path.join(b.root, 'ext');
  fs.mkdirSync(path.join(ext, 'ext'), { recursive: true });
  fs.writeFileSync(path.join(ext, 'ext', 'fake.mjs'),
    `export default { name: 'fake', order: 50, label: 'Fake', quick: [{ out: 'q-fake.json', cmd: ${JSON.stringify(cmd)} }] };\n`);
  return { DIGEST_EXT: ext };
}
const box = () => makeBox({ drop: PRIVATE, publicOnly: true, items: { items: [], runs: [] } });
const last = b => JSON.parse(fs.readFileSync(path.join(b.code, 'cursor.json'), 'utf8')).last;
const log = b => fs.readFileSync(path.join(b.code, 'run.log'), 'utf8');

test('quick: a failing source is told and last stays', () => {
  const b = box();
  try {
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000}');
    const r = b.run('sh', [path.join(b.code, 'quick-check.sh')], { env: fakeExt(b, 'echo broken >&2; exit 3') });
    assert.equal(r.status, 0, r.stderr);
    assert.match(log(b), /quick failed: q-fake\.json rc=3/);
    assert.match(log(b), /notify 今すぐチェックで読めなかった読む先/);
    assert.equal(last(b), 1700000000);
  } finally { b.cleanup(); }
});

test('quick: a source with nothing new is not a failure, and last moves on', () => {
  const b = box();
  try {
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000}');
    const r = b.run('sh', [path.join(b.code, 'quick-check.sh')], { env: fakeExt(b, 'true') });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(log(b), /読めなかった/);
    assert.ok(last(b) > 1700000000);
  } finally { b.cleanup(); }
});

const cursor = b => JSON.parse(fs.readFileSync(path.join(b.code, 'cursor.json'), 'utf8'));
// the check's Claude: maybe notes a failed source (as the procedure says), and moves every time on as usual
const fakeClaude = (b, fail) => fs.writeFileSync(path.join(b.bin, 'claude'), `#!/bin/sh
${fail ? `echo 'fake: rc=1' >> "$DATA/.failed-sources"` : ''}
python3 -c "import json;p='$DATA/cursor.json';d=json.load(open(p));d['last']=1800000000;d['other_last']=1800000000;json.dump(d,open(p,'w'))"
`);

test('regular: a source the check could not read is told, and cursor.json goes back to before the run (every key)', () => {
  const b = box();
  try {
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000, "other_last": 1600000000}');
    fakeClaude(b, true);
    const r = b.run('sh', [path.join(b.code, 'run-check.sh')]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(log(b), /notify 定期チェックで読めなかった読む先/);
    const c = cursor(b);
    assert.equal(c.last, 1700000000); assert.equal(c.other_last, 1600000000);
    assert.ok(c.held && c.held.at > 1700000000);
    for (const f of ['.failed-sources', '.cursor-before']) assert.ok(!fs.existsSync(path.join(b.code, f)), f);
  } finally { b.cleanup(); }
});

test('regular: the next run that reads everything clears held', () => {
  const b = box();
  try {
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000, "held": {"at": 1700000500}}');
    fakeClaude(b, false);
    assert.equal(b.run('sh', [path.join(b.code, 'run-check.sh')]).status, 0);
    const c = cursor(b);
    assert.equal(c.last, 1800000000); assert.equal('held' in c, false);
    assert.doesNotMatch(log(b), /読めなかった/);
  } finally { b.cleanup(); }
});

test('quick: a failing source sets held; a later clean quick run clears it', () => {
  const b = box();
  try {
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000}');
    b.run('sh', [path.join(b.code, 'quick-check.sh')], { env: fakeExt(b, 'exit 3') });
    assert.ok(cursor(b).held);
    b.run('sh', [path.join(b.code, 'quick-check.sh')], { env: fakeExt(b, 'true') });
    assert.equal('held' in cursor(b), false);
    assert.ok(cursor(b).last > 1700000000);
  } finally { b.cleanup(); }
});

test('the procedure tells the check what to do when a source cannot be read', () => {
  const t = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'digest', 'PROCEDURE.in.md'), 'utf8');
  assert.match(t, /\.failed-sources/);
});

test('entries: a reader tool\'s entry point notes its failure in DATA/.failed-sources', async () => {
  const { wrapper } = await import('../digest/entries.mjs');
  const b = box();
  try {
    const real = path.join(b.root, 'reader.mjs'); fs.writeFileSync(real, 'process.exit(4)\n');
    const ok = path.join(b.root, 'ok.mjs'); fs.writeFileSync(ok, 'console.log("[]")\n');
    const data = path.join(b.root, 'data'); fs.mkdirSync(data);
    for (const [r, name] of [[real, 'bad.mjs'], [ok, 'good.mjs']]) fs.writeFileSync(path.join(b.root, name), wrapper(r, { data, home: b.home, reader: 'fake' }));
    const run = n => b.run(process.execPath, [path.join(b.root, n)], { env: { DIGEST_DATA: data } });
    assert.equal(run('bad.mjs').status, 4);
    assert.equal(run('good.mjs').status, 0);
    assert.equal(fs.readFileSync(path.join(data, '.failed-sources'), 'utf8'), 'fake: reader.mjs rc=4\n');
  } finally { b.cleanup(); }
});

test('add: the noaction summary does not take the same line twice (a re-read after a held run)', () => {
  const b = box();
  try {
    const it = { id: 'misc:noaction', source: 'mail', time: '2026-11-14T09:00', title: '対応不要', summary: 'A社の配信 2件\nB社の配信 1件', status: '未読' };
    for (const s of [it.summary, 'B社の配信 1件\nC社の配信 1件']) {
      const f = path.join(b.root, 'n.json'); fs.writeFileSync(f, JSON.stringify([{ ...it, summary: s }]));
      assert.equal(b.node('add.mjs', [f, 'x']).status, 0);
    }
    const lines = b.items().items.find(i => i.id === 'misc:noaction').summary.split('\n');
    assert.deepEqual(lines.sort(), ['A社の配信 2件', 'B社の配信 1件', 'C社の配信 1件']);
  } finally { b.cleanup(); }
});
