// 利用者ごとの設定(local/config.json)を読む。コードには個人の値(アカウント・ID・名前・URL)を書かない。
//   置き場所: $DIGEST_LOCAL、無ければデータのフォルダ(DATA)の local/(HOME はホストと箱で違うので HOME からは探さない)
//   書き方: config.example.json(拡張があれば `node conf.mjs example` が拡張の見本も重ねて出す)。無いキーは下の既定(と拡張の既定)になる
// 使い方(シェルから): node conf.mjs get <キー(a.b.c)> [既定]     値を1行で(配列は , でつなぐ)
//                     node conf.mjs hooks <名前>                  hooks.<名前> を「秒<TAB>コマンド」の行で
//                     node conf.mjs check                         設定を読めるか・足りないものを表示(要る拡張が欠けていれば 1 で終わる)
//                     node conf.mjs example                       設定の見本(芯 + 拡張の断片)
import fs from 'fs'; import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url'; import { execFileSync } from 'child_process';
export const CODE = path.dirname(fileURLToPath(import.meta.url));
// 項目・カーソル・ログ(items.json など)。既定はコードと同じフォルダ(写し方式)。共用方式では DIGEST_DATA=~/digest(ARCHITECTURE.md 2)
export const DATA = process.env.DIGEST_DATA || CODE;
export const LOCAL = process.env.DIGEST_LOCAL || path.join(DATA, 'local');
// 本人の HOME(gmail.py のアカウントの控え .gmail/ のある場所)
export const MAILBOX_HOME = process.env.MAILBOX_HOME || path.dirname(DATA);
const EXT = process.env.DIGEST_EXT || path.join(CODE, 'private');
const uid = os.userInfo().uid;
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw new Error(`${f}: ${e.message}`); } };
const DEFAULTS = {
  account: '',            // Gmail のアドレス(メールのリンクの authuser)。空なら ~/.gmail/account(gmail.py が書く)
  pageUrl: '/email/',     // まとめページの URL(表示用)
  // 通知とセッション起動の送り先。aigw の notify 専用リスナーは docker0 の 23000+(uid-1000)
  notifyUrl: `http://172.17.0.1:${23000 + uid - 1000}/notify`,
  gmail: '',              // gmail.py のパス(空ならコードの1つ上)
  me: { name: '', profile: '', mentions: [], nameRe: '' },
  session: { preset: 'mail-tui', cwd: 'digest', group: 'digest' },
  hooks: { preCheck: [], hourly: [] },
};
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k], v) : v; return o; };
export function loadConf() {
  let c = {}; const f = path.join(LOCAL, 'config.json');
  try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error(`${f}: ${e.message}`); }
  // 芯の既定 ← 拡張の既定(private/defaults.json。無ければ何も足さない)← 本人の設定
  c = merge(merge(DEFAULTS, readJson(path.join(EXT, 'defaults.json'))), c);
  if (!c.account) try { c.account = fs.readFileSync(path.join(MAILBOX_HOME, '.gmail', 'account'), 'utf8').trim(); } catch {}
  return c;
}
export const conf = loadConf();
// gmail.py の場所(既定はコードの1つ上。設定の gmail で変えられる)
export const GMAIL = conf.gmail || path.join(CODE, '..', 'gmail.py');
export const get = (key, c = conf) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), c);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, key, dflt] = process.argv.slice(2);
  if (cmd === 'get' && key) { const v = get(key); console.log(v == null || v === '' || (Array.isArray(v) && !v.length) ? (dflt ?? '') : Array.isArray(v) ? v.join(',') : typeof v === 'object' ? JSON.stringify(v) : String(v)); }
  else if (cmd === 'json') console.log(JSON.stringify(conf));
  else if (cmd === 'hooks' && key) { for (const h of conf.hooks[key] || []) { const o = typeof h === 'string' ? { cmd: h } : h; if (o.cmd) console.log(`${Number(o.timeout) || 300}\t${o.cmd}`); } }
  else if (cmd === 'check') {
    const f = path.join(LOCAL, 'config.json'), miss = [];
    console.log(fs.existsSync(f) ? `設定: ${f}` : `設定が無い(既定で動く): ${f}`);
    if (!conf.account) miss.push('account(gmail.py login をすると ~/.gmail/account に入る)');
    if (!conf.me.name) miss.push('me.name(手順の中で本人を指す名前)');
    for (const n of ['PROCEDURE.md', 'RULES.md']) if (!fs.existsSync(path.join(LOCAL, n))) miss.push(n === 'RULES.md' ? 'local/RULES.md(無くても動く。RULES.example.md を写して書く)' : 'local/PROCEDURE.md(無くても動く。この利用者だけの手順の追記)');
    console.log(miss.length ? '足りないもの:\n' + miss.map(m => '  - ' + m).join('\n') : '足りないものは無い');
    // 拡張を読めるか・設定の ext.require が揃っているか(ext.mjs に聞く。読めない拡張・足りないものがあれば 1)
    try { process.stdout.write(execFileSync(process.execPath, [path.join(CODE, 'ext.mjs'), 'verify'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
    catch (e) { process.stdout.write(e.stdout || ''); console.log('拡張に問題: ' + String(e.stderr || e.message).trim().split('\n').slice(-3).join(' / ')); process.exit(1); }
  } else if (cmd === 'example') {
    console.log(JSON.stringify(merge(readJson(path.join(CODE, 'config.example.json')), readJson(path.join(EXT, 'config.example.json'))), null, 2));
  } else { console.error('usage: conf.mjs get <key> [default] | hooks <name> | json | check | example'); process.exit(2); }
}
