// 既決にした項目を元の場所でも片付ける(2026-10-09 ユーザー依頼)
//   メール : ~/gmail.py のトークンが gmail.modify なら `gmail.py archive` で INBOX を外す。無ければ threadId を出すだけで、Claude が Gmail コネクタでアーカイブし、
//            済んだら `node done-sync.mjs --mail-done <threadId>...` で記録する
//   拡張の読む先: 拡張の markRead(ext.mjs)
// 使い方: node ~/digest/done-sync.mjs [--mail-list] [--mail-done id...]
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process';
import { DATA, GMAIL, conf } from './conf.mjs';
import { threadOf, within } from './lib.mjs'; import { sources, byName, sourceOfRef, goodLink } from './ext.mjs';
const DB = `${DATA}/items.json`;
const args = process.argv.slice(2);
const load = () => { if (!fs.existsSync(DB)) return { items: [], runs: [] }; return JSON.parse(fs.readFileSync(DB, 'utf8')); }; // 初めての箱では items.json がまだ無い
const save = d => { fs.writeFileSync(DB + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(DB + '.tmp', DB); };
const mark = (ids, how) => { const d = load(); for (const i of d.items) if (ids.includes(i.id)) i.synced = { at: new Date().toISOString(), how }; save(d); };
// doneAsk(ページで既決にしたが Claude の確認待ち)は、Claude が既決にしてから片付ける
const todo = () => load().items.filter(i => i.status === '既決' && !i.synced && !i.doneAsk);
// まとめ項目(misc:noaction など)は refs に元のメール(mail:<threadId>)と拡張の読む先の URL を持つ。既決にしたらそれも片付ける
const expand = items => items.flatMap(i => [i, ...(i.refs || []).map(r => /^mail:/.test(r) ? { id: i.id, ref: true, source: 'mail', thread: r.slice(5) } : { id: i.id, ref: true, source: sourceOfRef(r)?.name || 'other', link: r })]);
const ctx = { conf, DATA, load, save, mark, within };
if (args[0] === '--mail-done') { const ids = new Set(args.slice(1)); mark(todo().filter(i => i.source === 'mail' && ids.has(threadOf(i))).map(i => i.id), 'gmail archived'); process.exit(0); }
const items = expand(todo()), tid = i => i.thread || threadOf(i);
console.log('#', new Date().toISOString(), 'todo', items.filter(i => !i.ref).length, 'refs', items.filter(i => i.ref).length);
if (!args.includes('--mail-list')) {
  // 拡張の読む先ごとに、別々に失敗させる(一つが固まっても次が動くように)
  for (const s of sources) if (s.markRead) await s.markRead(items.filter(i => i.source === s.name), ctx).catch(e => console.log(`${s.name} FAILED`, e.message));
  for (const i of items.filter(i => !i.ref && byName[i.source] && byName[i.source].urlRe && !/misc/.test(i.id) && !goodLink(i.link)))
    console.log(i.source, i.id, 'SKIPPED: link が無い(元の URL を link に入れる)');
}
const mails = items.filter(i => i.source === 'mail' && tid(i));
// gmail.py のトークン(MAILBOX_DIR、無ければ gmail.py の隣の .gmail/)
const canModify = () => { try { return JSON.parse(fs.readFileSync(path.join(process.env.MAILBOX_DIR || path.dirname(GMAIL), '.gmail', 'token.json'), 'utf8')).scopes.includes('https://www.googleapis.com/auth/gmail.modify'); } catch { return false; } };
if (mails.length && canModify() && !args.includes('--mail-list')) {
  const out = execFileSync(GMAIL, ['archive', ...new Set(mails.map(tid))], { encoding: 'utf8' });
  const ok = new Set(out.trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return {}; } }).filter(r => r.ok).map(r => r.thread));
  for (const i of mails) console.log('mail', tid(i), ok.has(tid(i)) ? 'archived' : 'FAILED', i.ref ? `(${i.id} の refs)` : i.title);
  mark(mails.filter(i => ok.has(tid(i))).map(i => i.id), 'gmail.py archive');
} else for (const i of mails) console.log('mail', tid(i), i.title);
// refs を持つまとめ項目は、一部が失敗しても(ログに出る)片付け済みにする。次の回に同じものを何度も試さない
mark(todo().filter(i => i.refs && i.refs.length).map(i => i.id), 'refs');
process.exit(0);
