// 共用方式の入口を箱に作る(ARCHITECTURE.md 2)。共用のコピーから利用者として動かす:
//   node <共用のコピー>/digest/entries.mjs install [--dry]
// 作るもの: ~/gmail.py・~/gcal.py(MAILBOX_DIR=<HOME> を渡して共用の gmail.py・gcal.py を起動する)と、
//          <DATA>/<道具>・<DATA>/private/<拡張の道具>(DIGEST_DATA・MAILBOX_DIR を渡して共用のコピーの同じ名前を起動する)。
// 入口は2行目に印がある。印のあるファイルは毎回あるべき中身に書き直し(手で変えられても戻す。~/gmail.py は送信の道でもある)、
// 印の無いファイル(写し方式の本物のコードや本人のファイル)は決して上書きしない。何度動かしても同じ結果。
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const CODE = path.dirname(fileURLToPath(import.meta.url));
const MARK = 'entries.mjs が作った入口。直さない';
export const PUBLIC = ['add.mjs', 'set-status.mjs', 'item.mjs', 'wait.mjs', 'done-sync.mjs', 'autostart.mjs', 'conf.mjs', 'session-end.mjs', 'quick-raw.mjs',
  'compose.mjs', 'backfill.py', 'ref-info.py', 'gmail-link.py', 'check-denials.py', 'run-check.sh', 'quick-check.sh', 'start.sh'];
const q = JSON.stringify;
// reader: 読む先の道具(拡張の readers)の入口は、0 以外で終わったら <DATA>/.failed-sources に「<拡張の名前>: <道具> rc=<n>」を足す
// (定期チェックが知らせて時刻を進めない。Claude が書き忘れても、落ちたことが残る)
export function wrapper(real, { data, home, reader }) {
  if (reader && real.endsWith('.mjs'))
    return `#!/usr/bin/env node\n// ${MARK}(${real} を、この箱のデータで動かす)\nimport { spawnSync } from 'child_process'; import fs from 'fs';\n` +
      `const env = { ...process.env, DIGEST_DATA: process.env.DIGEST_DATA || ${q(data)}, MAILBOX_DIR: process.env.MAILBOX_DIR || ${q(home)} };\n` +
      `const r = spawnSync(process.execPath, [${q(real)}, ...process.argv.slice(2)], { stdio: 'inherit', env });\n` +
      `if (r.status !== 0) try { fs.appendFileSync(env.DIGEST_DATA + '/.failed-sources', ${q(reader + ': ' + real.split('/').pop())} + ' rc=' + (r.status ?? r.signal) + '\\n'); } catch {}\n` +
      `process.exit(r.status ?? 1);\n`;
  if (real.endsWith('.mjs') || real.endsWith('.js'))
    return `#!/usr/bin/env node\n// ${MARK}(${real} を、この箱のデータで動かす)\nimport { spawnSync } from 'child_process';\n` +
      `const r = spawnSync(process.execPath, [${q(real)}, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, DIGEST_DATA: process.env.DIGEST_DATA || ${q(data)}, MAILBOX_DIR: process.env.MAILBOX_DIR || ${q(home)} } });\n` +
      `process.exit(r.status ?? 1);\n`;
  if (real.endsWith('.py'))
    return `#!/usr/bin/env python3\n# ${MARK}(${real} を、この箱のデータで動かす)\nimport os, sys\n` +
      (data ? `os.environ.setdefault("DIGEST_DATA", ${q(data)})\n` : '') + `os.environ["MAILBOX_DIR"] = os.environ.get("MAILBOX_DIR") or ${q(home)}\n` +
      `os.execv(sys.executable, [sys.executable, ${q(real)}, *sys.argv[1:]])\n`;
  if (real.endsWith('.sh'))
    return `#!/bin/sh\n# ${MARK}(${real} を、この箱のデータで動かす)\nexport DIGEST_DATA="\${DIGEST_DATA:-${data}}" MAILBOX_DIR="\${MAILBOX_DIR:-${home}}"\nexec sh ${q(real)} "$@"\n`;
  throw new Error('入口の形が分からない: ' + real);
}
// 作るべき入口の一覧 [{at, real, text}]
export async function plan({ home, data }) {
  const ext = process.env.DIGEST_EXT || path.join(CODE, 'private'), share = path.dirname(CODE), out = [];
  for (const n of ['gmail.py', 'gcal.py']) if (fs.existsSync(path.join(share, n))) out.push({ at: path.join(home, n), real: path.join(share, n), text: wrapper(path.join(share, n), { home }) });
  for (const n of PUBLIC) out.push({ at: path.join(data, n), real: path.join(CODE, n), text: wrapper(path.join(CODE, n), { data, home }) });
  // 拡張の道具(拡張の entries)。ext.mjs は設定を読むので DIGEST_DATA を合わせてから読む
  process.env.DIGEST_DATA ||= data;
  const { exts } = await import('./ext.mjs');
  for (const e of exts) for (const n of e.entries || []) out.push({ at: path.join(data, 'private', n), real: path.join(ext, n), text: wrapper(path.join(ext, n), { data, home, reader: (e.readers || []).includes(n) ? e.name : null }) });
  return out;
}
export async function install({ home, data, dry = false }) {
  if (path.resolve(data) === CODE) { console.log('写し方式(DATA がコードと同じ)なので入口は要らない'); return { made: [], kept: [] }; }
  const made = [], kept = [];
  for (const e of await plan({ home, data })) {
    let cur = null; try { cur = fs.readFileSync(e.at, 'utf8'); } catch {}
    if (cur !== null && !cur.split('\n').slice(0, 2).join('\n').includes(MARK)) { kept.push(e.at); console.log(`入口でないファイルがあるので上書きしない: ${e.at}`); continue; }
    if (cur === e.text) { try { fs.chmodSync(e.at, 0o755); } catch {} continue; }
    made.push(e.at); if (dry) continue;
    fs.mkdirSync(path.dirname(e.at), { recursive: true });
    const tmp = `${e.at}.entries-${process.pid}`; fs.writeFileSync(tmp, e.text, { mode: 0o755 }); fs.renameSync(tmp, e.at);
  }
  console.log(`${dry ? '作る予定' : '作った・直した'} ${made.length} 件${made.length ? ':\n  ' + made.join('\n  ') : ''}`);
  return { made, kept };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd] = process.argv.slice(2);
  const home = process.env.MAILBOX_HOME || process.env.HOME, data = process.env.DIGEST_DATA || path.join(home, 'digest');
  if (cmd === 'install') await install({ home, data, dry: process.argv.includes('--dry') });
  else if (cmd === 'list') for (const e of await plan({ home, data })) console.log(`${e.at} -> ${e.real}`);
  else { console.error('usage: entries.mjs install [--dry] | list'); process.exit(2); }
}
