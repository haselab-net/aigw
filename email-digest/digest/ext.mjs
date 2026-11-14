// 拡張の口(ARCHITECTURE.md 3)。EXT($DIGEST_EXT、無ければこのフォルダの private/)の ext/*.mjs を order の順に読む。
//   無ければ黙って空(芯だけで動く)。有って読めない・形が違うときは例外(黙って飛ばさない)。
// 使い方(シェルから): node ext.mjs cmds prepare|quick|after regular|quick    台本が動かすコマンドを行で出す
//                     node ext.mjs verify [--notify]   設定の ext.require を確かめる(足りなければ 1。--notify でスマホに知らせる)
//                     node ext.mjs notify <題> <本文>
//                     node ext.mjs list                読んだ拡張の名前
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
import { CODE, conf } from './conf.mjs'; import { notifyText } from './lib.mjs';
export const EXT = process.env.DIGEST_EXT || path.join(CODE, 'private');
const KEYS = { name: 'string', order: 'number', label: 'string', icon: 'string', color: 'string', quickTag: 'string',
  hostRe: RegExp, urlRe: RegExp, refRe: RegExp, refTime: 'function', refLabel: 'function', markRead: 'function', quickRaw: 'function',
  prepare: Array, quick: Array, after: 'object', entries: Array, readers: Array };
function check(m, file) {
  if (!m || typeof m !== 'object') throw new Error(`${file}: export default が無い`);
  if (typeof m.name !== 'string' || !/^[a-z][\w-]*$/.test(m.name)) throw new Error(`${file}: name が無いか形が違う`);
  for (const [k, v] of Object.entries(m)) {
    const t = KEYS[k];
    if (t === undefined) { if (typeof v === 'function') continue; throw new Error(`${file}: 知らないキー ${k}`); } // 拡張の内部の関数は許す
    const ok = typeof t === 'string' ? typeof v === t : v instanceof t;
    if (!ok) throw new Error(`${file}: ${k} の型が違う`);
  }
  return m;
}
async function load() {
  const dir = path.join(EXT, 'ext');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).sort()) {
    const m = (await import(pathToFileURL(path.join(dir, f)).href)).default;
    out.push({ file: f.replace(/\.mjs$/, ''), ...check(m, `${EXT}/ext/${f}`) });
  }
  return out.sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.name.localeCompare(b.name));
}
export const exts = await load();
// 読む先(表示名のあるもの)
export const sources = exts.filter(e => e.label);
export const byName = Object.fromEntries(sources.map(s => [s.name, s]));
export const sourceOfUrl = u => sources.find(s => s.hostRe && s.hostRe.test(u || ''));
export const sourceOfRef = r => sources.find(s => s.refRe && s.refRe.test(r || ''));
export const goodLink = u => sources.some(s => s.urlRe && s.urlRe.test(u || ''));

// 断片(text/*.md)。中身のある口を1つも埋めない断片(空・見出しだけ)は、要るものとしては足りない扱い
export function fragmentHasContent(file) {
  let t; try { t = fs.readFileSync(file, 'utf8'); } catch { return false; }
  return t.split('\n').some(l => l.trim() && !/^<!-- slot:/.test(l.trim()) && !/^#/.test(l.trim()));
}
export function missingRequired(c = conf) {
  const req = (c.ext && c.ext.require) || [];
  const miss = [];
  for (const r of req) {
    const m = /^(ext|text)\/([\w.-]+)$/.exec(r);
    if (!m) miss.push(`${r}(形が違う。ext/<名前> か text/<断片>)`);
    else if (m[1] === 'ext' ? !exts.some(e => e.file === m[2] || e.name === m[2]) : !fragmentHasContent(path.join(EXT, 'text', m[2] + '.md'))) miss.push(r);
  }
  return miss;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'cmds') {
    for (const e of exts) {
      if (a === 'prepare') for (const p of e.prepare || []) { if ((p.when || 'both') === 'both' || p.when === b) console.log(`${Number(p.timeout) || 0}\t${p.cmd}`); }
      else if (a === 'quick' && b !== 'regular') for (const q of e.quick || []) console.log(`${q.slow ? 1 : 0}\t${q.out}\t${q.cmd}`);
      else if (a === 'after' && e.after && e.after[b]) console.log(e.after[b]);
    }
  } else if (cmd === 'verify') {
    const miss = missingRequired();
    if (miss.length) {
      console.error('拡張か断片が足りない(local/config.json の ext.require): ' + miss.join(', '));
      if (process.argv.includes('--notify')) await notifyText('新着チェックを止めた: 拡張が足りない', miss.join(', '));
      process.exit(1);
    }
    console.log(`拡張: ${exts.map(e => e.name).join(', ') || 'なし'}${((conf.ext && conf.ext.require) || []).length ? '(ext.require は揃っている)' : ''}`);
  } else if (cmd === 'notify') await notifyText(a || '新着チェック', b || '');
  else if (cmd === 'list') console.log(exts.map(e => e.name).join('\n'));
  else { console.error('usage: ext.mjs cmds prepare|quick|after regular|quick | verify [--notify] | notify <title> <message> | list'); process.exit(2); }
}
