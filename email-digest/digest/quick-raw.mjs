// node ~/digest/quick-raw.mjs <dir>  → <dir>/quick-raw.json
// 「今すぐチェック」の1段目: 取ってきたばかりのメール一覧(q-mail.jsonl)と拡張の読む先の取り込み(拡張の quickRaw)を、要約せずにページの「速報」用にまとめる。
// 要約して項目にするのは2段目の claude -p(quick-check.sh)。2026-10-16 ユーザー依頼
import fs from 'fs'; import { execFileSync } from 'child_process'; import { GMAIL } from './conf.mjs'; import { sources } from './ext.mjs';
const D = process.argv[2], rd = f => { try { return fs.readFileSync(`${D}/${f}`, 'utf8'); } catch { return ''; } };
const jst = t => new Date(t + 9 * 3600e3).toISOString().slice(0, 16);
const out = [];
const mails = rd('q-mail.jsonl').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(m => m.threadId);
const links = {};
if (mails.length) {
  const ids = [...new Set(mails.map(m => m.threadId))];
  const ls = execFileSync(GMAIL, ['link', ...ids], { encoding: 'utf8' }).trim().split('\n');
  ids.forEach((id, i) => links[id] = ls[i]);
}
for (const m of mails) out.push({ source: 'mail', time: jst(Date.parse(m.date)), from: (m.from || '').replace(/<.*>/, '').replace(/"/g, '').trim(), title: m.subject || '', text: m.snippet || '', link: links[m.threadId] || '' });
for (const s of sources) if (s.quickRaw) out.push(...s.quickRaw(rd));
out.sort((a, b) => b.time.localeCompare(a.time));
fs.writeFileSync(`${D}/quick-raw.json`, JSON.stringify(out.slice(0, 80)));
console.log('raw', out.length);
