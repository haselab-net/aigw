// 使い方: node ~/digest/set-status.mjs <item id> <未決|未読|既読|既決> ["メモ"]
// まとめページから起動した Claude セッションが、作業を終えたときに項目の状態を変えるためのもの
import fs from 'fs'; import { execFileSync } from 'child_process'; import { DATA, CODE } from './conf.mjs';
const DB = `${DATA}/items.json`, ST = ['未決', '未読', '既読', '既決'];
const [id, status, note] = process.argv.slice(2);
if (!id || !ST.includes(status)) { console.error('usage: set-status.mjs <id> <' + ST.join('|') + '> [memo]'); process.exit(2); }
const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
const it = d.items.find(x => x.id === id);
if (!it) { console.error('no such item: ' + id); process.exit(1); }
it.status = status; it.changed = new Date().toISOString(); it.byUser = true;
delete it.doneAsk; // ページで既決にされた後の Claude の判断(既決で確定・未決で戻す)
if (note) it.note = note;
fs.writeFileSync(DB + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(DB + '.tmp', DB);
console.log(`${id}: ${status}`);
// その項目の「AIで対応」のセッションから既決にしたら、返答を終えたところでセッションを止めてアーカイブする(session-end.mjs)
if (status === '既決') execFileSync(process.execPath, [`${CODE}/session-end.mjs`, 'request', id], { stdio: 'inherit' });
