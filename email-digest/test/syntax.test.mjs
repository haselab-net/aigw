// Every module, script and Python tool in this copy at least parses (the
// tools started only by a check, never by another test, would fail late).
import { test } from 'node:test'; import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process'; import { fileURLToPath } from 'url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__pycache__' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const check = (f) => f.endsWith('.mjs') ? [process.execPath, ['--check', f]]
  : f.endsWith('.sh') ? ['sh', ['-n', f]]
  : f.endsWith('.py') ? ['python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])', f]] : null;
test('every .mjs, .sh and .py parses', () => {
  const bad = [];
  for (const f of files) {
    const c = check(f); if (!c) continue;
    const r = spawnSync(c[0], c[1], { encoding: 'utf8' });
    if (r.status !== 0) bad.push(`${path.relative(ROOT, f)}: ${(r.stderr || '').split('\n').find((l) => /Error/.test(l)) || r.stderr}`);
  }
  assert.deepEqual(bad, []);
});
