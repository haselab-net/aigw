// 使い方: 項目に「待ち」(条件・日時のリマインダー)を付け、成立したら未決に戻して通知する(2026-10-23 ユーザー依頼)
//   node ~/digest/wait.mjs set <id> [--at 2026-11-16T09:00] [--cond "条件"] --task "成立したら Claude に頼むこと"
//   node ~/digest/wait.mjs fire <id> "成立の理由(元のメッセージのリンクなど)"   定期チェックの Claude が条件の成立を判定したとき
//   node ~/digest/wait.mjs clear <id>                                            待ちを外す
//   node ~/digest/wait.mjs list                                                   成立前の待ち(定期チェックが条件を照らす)
//   node ~/digest/wait.mjs tick                                                   日時を過ぎた待ちを成立させる(server.mjs が1分ごとに呼ぶ)
// --at は JST。--cond と --at は少なくとも一方。両方なら先に来た方で成立する
// 成立すると status を未決にし、wait.fired・wait.why を付けて通知する。続きから開くと client.js が「待っていた条件が成立しました」を送り、wait.told を付ける
import { loadItems, saveItems, nowJst, notify } from './lib.mjs'; import { CODE } from './conf.mjs';
import { execFileSync } from 'child_process'; import os from 'os';
const [cmd, id, ...rest] = process.argv.slice(2);
const usage = () => { console.error('usage: wait.mjs set <id> [--at YYYY-MM-DDTHH:MM] [--cond 条件] --task 頼むこと | fire <id> 理由 | clear <id> | list | tick'); process.exit(2); };
const d = loadItems();
const find = () => { const it = d.items.find(x => x.id === id); if (!it) { console.error('no such item: ' + id); process.exit(1); } return it; };
function fire(it, why) {
  it.wait.fired = nowJst(); it.wait.why = why; it.status = '未決'; it.byUser = true; it.changed = new Date().toISOString();
}
if (cmd === 'set') {
  const it = find(), o = {};
  for (let i = 0; i < rest.length; i += 2) { const k = rest[i].replace(/^--/, ''); if (!['at', 'cond', 'task'].includes(k)) usage(); o[k] = rest[i + 1]; }
  if (!o.task || !(o.at || o.cond)) usage();
  if (o.at && !/^\d{4}-\d\d-\d\d(T\d\d:\d\d)?$/.test(o.at)) { console.error('--at は 2026-11-16 か 2026-11-16T09:00(JST)'); process.exit(2); }
  if (o.at && o.at.length === 10) o.at += 'T09:00';
  it.wait = { ...o, set: nowJst() };
  saveItems(d); console.log(`${id}: 待ち ${o.at ? o.at.replace('T', ' ') + ' ' : ''}${o.cond ? '条件: ' + o.cond : ''}`);
  // その項目の「AIで対応」のセッションから待ちを付けたら、既決と同じく返答を終えたところで止めてアーカイブする(session-end.mjs)
  execFileSync(process.execPath, [`${CODE}/session-end.mjs`, 'request', id], { stdio: 'inherit' });
} else if (cmd === 'fire') {
  const it = find(); if (!it.wait) { console.error('待ちが付いていない: ' + id); process.exit(1); }
  if (it.wait.fired) { console.log(`${id}: 既に成立(${it.wait.fired})`); process.exit(0); }
  fire(it, rest.join(' ') || '条件が成立');
  saveItems(d); console.log(`${id}: 成立 → 未決`); await notify(it);
} else if (cmd === 'clear') {
  const it = find(); delete it.wait; saveItems(d); console.log(`${id}: 待ちを外した`);
} else if (cmd === 'list') {
  for (const it of d.items.filter(x => x.wait && !x.wait.fired && x.status !== '既決'))
    console.log(JSON.stringify({ id: it.id, title: it.title, at: it.wait.at, cond: it.wait.cond, task: it.wait.task, set: it.wait.set }));
} else if (cmd === 'tick') {
  const now = nowJst(), due = d.items.filter(x => x.wait && !x.wait.fired && x.status !== '既決' && x.wait.at && x.wait.at <= now);
  if (!due.length) process.exit(0);
  for (const it of due) fire(it, `${it.wait.at.replace('T', ' ')} になりました`);
  saveItems(d);
  for (const it of due) { console.log(`${it.id}: 日時で成立`); await notify(it); }
} else usage();
