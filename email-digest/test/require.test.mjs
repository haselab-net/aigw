// ext.require (ARCHITECTURE.md 3): a box can declare which extensions/fragments it must have; missing ones stop the check
// loudly instead of being skipped. A box that does not declare it behaves as before.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path';
import { makeBox, PRIVATE } from './helpers.mjs';

const PENDING = {};
// a fake extension tree: one module, one fragment
function fakeExt(b, { broken = false } = {}) {
  const ext = path.join(b.root, 'ext');
  fs.mkdirSync(path.join(ext, 'ext'), { recursive: true }); fs.mkdirSync(path.join(ext, 'text'), { recursive: true });
  fs.writeFileSync(path.join(ext, 'ext', 'fake.mjs'), broken ? 'export default {{{' : "export default { name: 'fake', order: 50, label: 'Fake' };\n");
  fs.writeFileSync(path.join(ext, 'text', '80-guard.md'), '<!-- slot: guard -->\n偽の守りの文\n');
  return { DIGEST_EXT: ext };
}
const box = conf => makeBox({ drop: PRIVATE, publicOnly: true, conf, items: { items: [], runs: [] } });

test('require: not declared → conf check passes as today, with or without extensions', PENDING, () => {
  const b = box();
  try { assert.equal(b.node('conf.mjs', ['check']).status, 0); assert.equal(b.node('conf.mjs', ['check'], { env: fakeExt(b) }).status, 0); }
  finally { b.cleanup(); }
});

test('require: all present → conf check passes', PENDING, () => {
  const b = box({ ext: { require: ['ext/fake', 'text/80-guard'] } });
  try { const r = b.node('conf.mjs', ['check'], { env: fakeExt(b) }); assert.equal(r.status, 0, r.stdout + r.stderr); }
  finally { b.cleanup(); }
});

test('require: missing → conf check names it and exits 1', PENDING, () => {
  const b = box({ ext: { require: ['ext/fake', 'text/80-guard', 'text/81-other'] } });
  try { const r = b.node('conf.mjs', ['check'], { env: fakeExt(b) }); assert.equal(r.status, 1); assert.match(r.stdout + r.stderr, /text\/81-other/); }
  finally { b.cleanup(); }
});

test('require: missing → run-check.sh stops before claude and notifies', PENDING, () => {
  const b = box({ ext: { require: ['text/80-guard'] } });
  try {
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000}');
    b.run('sh', [path.join(b.code, 'run-check.sh')]);          // no DIGEST_EXT: the fragment is missing
    assert.equal(b.calls().filter(c => c[0] === 'claude').length, 0);
    assert.match(fs.readFileSync(path.join(b.code, 'run.log'), 'utf8'), /text\/80-guard/);
    assert.match(fs.readFileSync(path.join(b.code, 'run.log'), 'utf8'), /notify/);
  } finally { b.cleanup(); }
});

test('require: missing → quick-check.sh does not ask claude and ends in state error', PENDING, () => {
  const b = box({ ext: { require: ['text/80-guard'] } });
  try {
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000}');
    b.run('sh', [path.join(b.code, 'quick-check.sh')]);
    assert.equal(b.calls().filter(c => c[0] === 'claude').length, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(b.code, 'quick.json'), 'utf8')).state, 'error');
  } finally { b.cleanup(); }
});

test('require: a present but broken extension is an error, not a silent skip', PENDING, () => {
  const b = box();
  try {
    const env = fakeExt(b, { broken: true });
    assert.notEqual(b.node('conf.mjs', ['check'], { env }).status, 0);
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000}');
    b.run('sh', [path.join(b.code, 'run-check.sh')], { env });
    assert.equal(b.calls().filter(c => c[0] === 'claude').length, 0);
  } finally { b.cleanup(); }
});

test('require: a required fragment that is empty or only headings counts as missing', PENDING, () => {
  const b = box({ ext: { require: ['text/80-guard'] } });
  try {
    const env = fakeExt(b);
    for (const t of ['', '<!-- slot: guard -->\n', '<!-- slot: guard -->\n## 見出しだけ\n\n']) {
      fs.writeFileSync(path.join(env.DIGEST_EXT, 'text', '80-guard.md'), t);
      const r = b.node('conf.mjs', ['check'], { env });
      assert.equal(r.status, 1, JSON.stringify(t)); assert.match(r.stdout + r.stderr, /text\/80-guard/);
    }
  } finally { b.cleanup(); }
});
