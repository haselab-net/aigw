// cursor.json(前回チェック時刻 last など)を台本から書き換える。どれも一時ファイルに書いてから置き換える。
//   node cursor.mjs set-last <秒>                 last を変える
//   node cursor.mjs hold <前の last> <この回の開始> [<回の前の控え>]
//       読めなかった読む先があった回: 控えがあれば中身をそれに戻し(読む先ごとの時刻も)、last を前の値に、
//       held を {at: この回の開始} にする(次の回は同じ時刻から読み直す。held.at より前の分は、読めた読む先では既に項目かまとめの行になっている)
//   node cursor.mjs clear-held                    読み直しが済んだ回: held を消す
import fs from 'fs'; import path from 'path';
const DATA = process.env.DATA || process.env.DIGEST_DATA || path.dirname(new URL(import.meta.url).pathname);
const F = path.join(DATA, 'cursor.json');
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const write = d => { const t = `${F}.tmp-${process.pid}`; fs.writeFileSync(t, JSON.stringify(d), { mode: 0o600 }); fs.renameSync(t, F); };
const num = s => { const n = Number(s); if (!Number.isFinite(n)) { console.error('cursor.mjs: 数でない: ' + s); process.exit(2); } return n; };
const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === 'set-last') write({ ...read(F), last: num(a) });
else if (cmd === 'hold') write({ ...(c ? read(c) : read(F)), last: num(a), held: { at: num(b) } });
else if (cmd === 'clear-held') { const d = read(F); if ('held' in d) { delete d.held; write(d); } }
else { console.error('usage: cursor.mjs set-last <s> | hold <last> <start> [<before>] | clear-held'); process.exit(2); }
