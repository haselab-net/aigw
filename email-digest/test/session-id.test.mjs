// The regular check gives its Claude a session id and hands the same id to check-denials, even in a box
// without uuidgen (the real box has none: the id came out empty and check-denials found no log, 2026-11-14).
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path';
import { makeBox, PRIVATE } from './helpers.mjs';

test('regular: without uuidgen the session id is still a uuid, and check-denials gets the same one', () => {
  const b = makeBox({ drop: PRIVATE, publicOnly: true, items: { items: [], runs: [] } });
  try {
    fs.writeFileSync(path.join(b.bin, 'uuidgen'), '#!/bin/sh\nexit 127\n');   // as if not installed
    fs.writeFileSync(path.join(b.code, 'cursor.json'), '{"last": 1700000000}');
    const r = b.run('sh', [path.join(b.code, 'run-check.sh')]);
    assert.equal(r.status, 0, r.stderr);
    const c = b.calls().find(a => a[0] === 'claude');
    const sid = c[c.indexOf('--session-id') + 1];
    assert.match(sid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const log = fs.readFileSync(path.join(b.code, 'run.log'), 'utf8');
    assert.ok(log.includes(`check-denials: 会話の記録が見つからない (${sid})`), log);   // no real log in the test box
  } finally { b.cleanup(); }
});
