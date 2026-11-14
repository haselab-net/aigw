// Entry points for the shared-copy install (ARCHITECTURE.md 2): ~/gmail.py, ~/gcal.py and ~/digest/<tool> stay callable
// by their old paths and run the shared code with the box's DATA and MAILBOX_DIR.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process';
import { makeBox, FIX } from './helpers.mjs';

const PENDING = {};
// shared layout: code in <root>/shared/digest (+ gmail.py), the box home has only data and local/
function shared() {
  const b = makeBox({ items: JSON.parse(fs.readFileSync(path.join(FIX, 'items-mail.json'), 'utf8')) });
  const sh = path.join(b.root, 'shared'); fs.mkdirSync(sh);
  fs.renameSync(b.code, path.join(sh, 'digest'));
  for (const n of ['gmail.py', 'gcal.py']) { fs.copyFileSync(path.join(b.home, n), path.join(sh, n)); fs.rmSync(path.join(b.home, n)); }
  const data = path.join(b.home, 'digest'); fs.mkdirSync(data);
  fs.renameSync(path.join(sh, 'digest', 'local'), path.join(data, 'local'));
  fs.renameSync(path.join(sh, 'digest', 'items.json'), path.join(data, 'items.json'));
  return { b, sh, data, install: () => spawnSync(process.execPath, [path.join(sh, 'digest', 'entries.mjs'), 'install'], { env: b.env, encoding: 'utf8' }) };
}

test('entries: install writes wrappers, marked as generated; running twice gives the same files', PENDING, () => {
  const x = shared();
  try {
    assert.equal(x.install().status, 0);
    for (const f of ['gmail.py', 'gcal.py', 'digest/item.mjs', 'digest/set-status.mjs', 'digest/run-check.sh', 'digest/conf.mjs'])
      assert.match(fs.readFileSync(path.join(x.b.home, f), 'utf8').split('\n').slice(0, 2).join('\n'), /entries\.mjs/, f);
    assert.equal(fs.lstatSync(path.join(x.b.home, 'gmail.py')).isSymbolicLink(), false);
    const before = fs.readFileSync(path.join(x.data, 'item.mjs'), 'utf8');
    assert.equal(x.install().status, 0);
    assert.equal(fs.readFileSync(path.join(x.data, 'item.mjs'), 'utf8'), before);
  } finally { x.b.cleanup(); }
});

test('entries: node ~/digest/item.mjs runs the shared code against the box data', PENDING, () => {
  const x = shared();
  try {
    x.install();
    const r = spawnSync(process.execPath, [path.join(x.data, 'item.mjs'), 'mail:18a0000000000001'], { env: x.b.env, encoding: 'utf8', cwd: x.b.home });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).threadId, '18a0000000000001');
    assert.equal(spawnSync(process.execPath, [path.join(x.data, 'conf.mjs'), 'get', 'me.name'], { env: x.b.env, encoding: 'utf8' }).stdout, '田中\n');
  } finally { x.b.cleanup(); }
});

test('entries: ~/gmail.py passes MAILBOX_DIR=<home> to the shared gmail.py (token next to the home, not the shared copy)', PENDING, () => {
  const x = shared();
  try {
    x.install();
    const r = spawnSync(path.join(x.b.home, 'gmail.py'), ['link', '18a0000000000001'], { env: x.b.env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /#all\/FAKE18a0000000000001/);
    // the fake gmail.py logs its argv; the wrapper must have set MAILBOX_DIR
    const env = spawnSync(path.join(x.b.home, 'gmail.py'), ['env-mailbox-dir'], { env: x.b.env, encoding: 'utf8' });
    assert.equal(env.stdout.trim(), x.b.home);
  } finally { x.b.cleanup(); }
});

test('entries: a real (non-wrapper) file is never overwritten', PENDING, () => {
  const x = shared();
  try {
    fs.writeFileSync(path.join(x.data, 'item.mjs'), '// my own file\n');
    const r = x.install();
    assert.equal(fs.readFileSync(path.join(x.data, 'item.mjs'), 'utf8'), '// my own file\n');
    assert.match(r.stdout + r.stderr, /item\.mjs/);
  } finally { x.b.cleanup(); }
});

test('entries: an edited entry is put back to its canonical form on every install (the mail entry is also the send path)', PENDING, () => {
  const x = shared();
  try {
    x.install();
    const f = path.join(x.b.home, 'gmail.py'), good = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, good.replace(/os\.execv[^\n]*/, 'print("changed by hand")'));
    assert.notEqual(fs.readFileSync(f, 'utf8'), good);
    assert.equal(x.install().status, 0);
    assert.equal(fs.readFileSync(f, 'utf8'), good);
  } finally { x.b.cleanup(); }
});
