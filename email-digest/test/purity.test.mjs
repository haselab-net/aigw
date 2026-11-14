// Purity: no public file (everything in email-digest/ outside the private paths) contains a deny word
// (case-insensitive substring). The list is digest/private/deny-words.txt; without it (in the public copy) this is skipped.
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path';
import { ROOT, publicFiles, denyWords } from './helpers.mjs';

const words = denyWords();

test('purity: public files name nothing private', words ? {} : { skip: '拒否語の一覧が無い(公開の写し)' }, () => {
  const hits = [];
  for (const f of publicFiles()) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8').toLowerCase();
    if (t.includes('\0')) continue;
    const lines = t.split('\n');
    for (const w of words) lines.forEach((l, i) => { if (l.includes(w)) hits.push(`${f}:${i + 1}: ${w}`); });
  }
  assert.deepEqual(hits, [], `${hits.length} hits:\n` + hits.slice(0, 80).join('\n'));
});

test('purity: the deny list itself is sane', { skip: !words && '拒否語の一覧が無い' }, () => {
  assert.ok(words.length >= 10);
  for (const w of words) assert.ok(w.length >= 2 && !/\s$/.test(w), w);
});
