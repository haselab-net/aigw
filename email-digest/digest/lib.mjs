// digest の小道具が共有する関数
// メールの threadId: id が mail:<16進> ならそれ、そうでなければリンクのトークンから復元
const RED = 'BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz', FULL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function threadOf(i) {
  // threadId: Gmail が別スレッドに分けた同じ話を add.mjs が前の項目にまとめたとき、いちばん新しいスレッド(前のスレッドは refs)
  if (/^[0-9a-f]{16}$/.test(i.threadId || '')) return i.threadId;
  const m = /^mail:([0-9a-f]{16})$/.exec(i.id); if (m) return m[1];
  const t = /#all\/([B-Zb-z]{20,})/.exec(i.link || ''); if (!t) return null;
  let n = 0n; for (const c of t[1]) n = n * 40n + BigInt(RED.indexOf(c));
  let s = ''; while (n) { s = FULL[Number(n % 64n)] + s; n /= 64n; }
  const f = /^f:(\d+)$/.exec(Buffer.from(s, 'base64').toString()); return f ? BigInt(f[1]).toString(16) : null;
}

import fs from 'fs'; import { DATA, conf } from './conf.mjs';
const DB = `${DATA}/items.json`;
export const loadItems = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return { items: [], runs: [] }; } };
export const saveItems = d => { fs.writeFileSync(DB + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(DB + '.tmp', DB); };
export const nowJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
// 待ちが成立した項目をスマホに知らせる。aigw の notify 専用リスナー(docker0、172.17.0.1:23000+(uid-1000))に、
// セッションに依らない通知(タップでまとめページを開く)を頼む。届かなくても待ちの成立は済んでいるので、失敗は wait.log に残すだけ
// 送り先は設定の notifyUrl(local/config.json。無ければ uid から決まる aigw の notify 専用リスナー。conf.mjs)
export function notifyUrl() {
  if (!conf.notifyUrl) throw new Error('設定の notifyUrl が空');
  return conf.notifyUrl;
}
// aigw の上限(title 60字・message 300字、超えると 400)に合わせて切る。10分に12件を超えると 429
const cut = (t, n) => [...t].length > n ? [...t].slice(0, n - 1).join('') + '…' : t;
async function post(title, message) {
  const body = { title: cut(title, 60), message: cut(message, 300), url: conf.pageUrl.replace(/^https?:\/\/[^/]+/, '') };
  let r; try { const res = await fetch(notifyUrl(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }); r = `${res.status} ${(await res.text()).slice(0, 200)}`; }
  catch (e) { r = 'ERR ' + e.message; console.error('notify: ' + r); }
  return r;
}
export async function notify(it) {
  const r = await post('待ち成立: ' + it.title, `${it.wait.why}\n${it.wait.task}`);
  fs.appendFileSync(`${DATA}/wait.log`, `${new Date().toISOString()} notify ${it.id} → ${r}\n`);
}
// 項目に依らない知らせ(チェックを止めたときなど)。結果は標準出力(run.log)に
export async function notifyText(title, message) { console.log(`notify ${title} → ${await post(title, message)}`); }
// 待ちに時限を付けて例外にする(固まった相手で止まらないように)
export const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))]);
