// compose.mjs rules (ARCHITECTURE.md 4) with fake templates and fake fragments.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path';
import { makeBox } from './helpers.mjs';

const PENDING = {};
const TEMPLATE = [
  '# 手順', '', '読む先: メール{{labels}}。', '', '{{extra}}', '', '{{#quick}}メールだけを見る。{{/quick}}', '', 'コード {{code}}、データ {{data}}', '',
].join('\n');
function box(frags) {
  const b = makeBox({ drop: ['digest/private'] });
  const ext = path.join(b.root, 'ext'); fs.mkdirSync(path.join(ext, 'text'), { recursive: true });
  for (const [n, t] of Object.entries(frags)) fs.writeFileSync(path.join(ext, 'text', n), t);
  fs.writeFileSync(path.join(b.code, 'TEST.in.md'), TEMPLATE);
  return { b, env: { DIGEST_EXT: ext } };
}
const render = ({ b, env }) => { const r = b.node('compose.mjs', ['render', path.join(b.code, 'TEST.in.md')], { env }); assert.equal(r.status, 0, r.stderr); return r.stdout; };

test('compose: no fragments → inline slots vanish, block lines vanish, defaults stay', PENDING, () => {
  const x = box({});
  try { assert.equal(render(x), ['# 手順', '', '読む先: メール。', '', '', 'メールだけを見る。', '', 'コード ~/digest、データ ~/digest', ''].join('\n')); }
  finally { x.b.cleanup(); }
});

test('compose: fragments in file-name order; inline joins, block joins with newlines, replace replaces', PENDING, () => {
  const x = box({
    '20-b.md': '<!-- slot: labels -->\n・B\n<!-- slot: extra -->\nB の段落\n',
    '10-a.md': '<!-- slot: labels -->\n・A\n<!-- slot: extra -->\nA の段落\n2行目\n<!-- slot: quick -->\nA と B も見る。\n',
  });
  try { assert.equal(render(x), ['# 手順', '', '読む先: メール・A・B。', '', 'A の段落', '2行目', 'B の段落', '', 'A と B も見る。', '', 'コード ~/digest、データ ~/digest', ''].join('\n')); }
  finally { x.b.cleanup(); }
});

test('compose: expansion happens once: slot-like text inside a fragment stays as written, values are still filled', PENDING, () => {
  const x = box({ '10-a.md': '<!-- slot: extra -->\n断片の中の {{labels}} と {{#quick}}x{{/quick}} はそのまま、{{bin}} は埋まる\n' });
  try { assert.match(render(x), /断片の中の \{\{labels\}\} と \{\{#quick\}\}x\{\{\/quick\}\} はそのまま、~\/digest は埋まる/); }
  finally { x.b.cleanup(); }
});

test('compose: a fragment naming a slot no template has makes composing fail (no silent drop)', PENDING, () => {
  const x = box({ '10-a.md': '<!-- slot: extra -->\nよい\n<!-- slot: no-such-slot -->\n置き間違い\n' });
  try {
    const r = x.b.node('compose.mjs', [], { env: x.env });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no-such-slot/);
    assert.match(r.stderr, /10-a\.md/);
  } finally { x.b.cleanup(); }
});

test('compose: composed documents carry the generated note on line 1 and are replaced atomically', PENDING, () => {
  const b = makeBox({ drop: ['digest/private'] });
  try {
    assert.equal(b.node('compose.mjs', []).status, 0);
    for (const f of ['PROCEDURE.md', 'CLAUDE.md']) {
      const t = fs.readFileSync(path.join(b.code, f), 'utf8');
      assert.match(t.split('\n')[0], /^<!-- 組み立てた文書.*(型|in\.md).*local/, f);
    }
    // no temp files left behind; unchanged content is not rewritten
    assert.deepEqual(fs.readdirSync(b.code).filter(n => /\.tmp|~$/.test(n)), []);
    const m = fs.statSync(path.join(b.code, 'PROCEDURE.md')).mtimeMs;
    assert.equal(b.node('compose.mjs', []).status, 0);
    assert.equal(fs.statSync(path.join(b.code, 'PROCEDURE.md')).mtimeMs, m);
  } finally { b.cleanup(); }
});

test('compose: writes PROCEDURE.md / CLAUDE.md into DATA, code and data paths follow DIGEST_DATA', PENDING, () => {
  const b = makeBox();
  try {
    const data = path.join(b.home, 'data'); fs.mkdirSync(data);
    const r = b.node('compose.mjs', [], { env: { DIGEST_DATA: data } });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(data, 'PROCEDURE.md')));
    assert.ok(fs.existsSync(path.join(data, 'CLAUDE.md')));
    assert.match(fs.readFileSync(path.join(data, '.claude', 'settings.json'), 'utf8'), new RegExp(b.code.replace(/[/.]/g, '\\$&') + '/session-end\\.mjs'));
  } finally { b.cleanup(); }
});
