// 手順書・項目のセッションへの指示・claude -p への依頼文を、型 + 拡張の断片から組み立てる(ARCHITECTURE.md 4)
//   node compose.mjs                       PROCEDURE.md・CLAUDE.md(と共用方式では .claude/settings.json)を DATA に書く
//   node compose.mjs prompt regular|quick  依頼文を標準出力へ(環境変数 LAST・START・Q を値に使う)
//   node compose.mjs render <型のファイル>   1つの型を組み立てて標準出力へ(テスト用)
// 型: {{名前}} は足す口(行にそれだけなら段落、文の中なら語)、{{#名前}}既定{{/名前}} は置き換える口。展開は1回だけで、
//     そのあと値({{bin}} {{code}} {{data}} {{local}} {{gmail}} {{gcal}} {{last}} {{start}} {{q}})を埋める。
// 断片: EXT/text/*.md を名前の順に。<!-- slot: 名前 --> の行で区切る。どの型にも無い口の名前があれば失敗する
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { CODE, DATA, LOCAL, MAILBOX_HOME } from './conf.mjs';
const EXT = process.env.DIGEST_EXT || path.join(CODE, 'private');
export const TEMPLATES = { 'PROCEDURE.md': 'PROCEDURE.in.md', 'CLAUDE.md': 'CLAUDE.in.md' };
const PROMPTS = ['prompts/regular.md', 'prompts/quick.md'];
const VALUES = new Set(['bin', 'code', 'data', 'local', 'gmail', 'gcal', 'last', 'start', 'q']);
export const NOTE = '<!-- 組み立てた文書(compose.mjs が書く)。直すときは型(digest/*.in.md)・拡張の断片・local/ を直す -->';

// 入口のあるフォルダ: 写し方式はコードそのもの、共用方式は DATA に置いた入口(どちらも ~/digest)
const BIN = DATA === CODE ? CODE : DATA;
export function values(abs = false) {
  const home = process.env.HOME || MAILBOX_HOME, t = p => !abs && (p === home || p.startsWith(home + '/')) ? '~' + p.slice(home.length) : p;
  return { bin: t(BIN), code: t(CODE), data: t(DATA), local: t(LOCAL), gmail: t(path.join(MAILBOX_HOME, 'gmail.py')), gcal: t(path.join(MAILBOX_HOME, 'gcal.py')),
    last: process.env.LAST || '', start: process.env.START || '', q: process.env.Q || '' };
}

export function fragments(ext = EXT) {
  const dir = path.join(ext, 'text'), slots = {};
  if (!fs.existsSync(dir)) return slots;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    const parts = t.split(/^<!-- slot: *([\w-]+) *-->\n/m);
    if (parts[0].trim()) throw new Error(`${f}: 最初の <!-- slot: 名前 --> より前に文がある`);
    for (let i = 1; i < parts.length; i += 2) (slots[parts[i]] ||= []).push({ file: f, text: parts[i + 1].replace(/\n$/, '') });
  }
  return slots;
}
const SLOT = /\{\{#([\w-]+)\}\}([\s\S]*?)\{\{\/\1\}\}|^\{\{([\w-]+)\}\}\n|\{\{([\w-]+)\}\}/gm;
export const slotNames = t => new Set([...t.matchAll(SLOT)].map(m => m[1] || m[3] || m[4]).filter(n => !VALUES.has(n)));

export function expand(t, slots, vals) {
  const out = t.replace(SLOT, (m, rn, def, bn, inl, off, all) => {
    const lineStart = off === 0 || all[off - 1] === '\n';
    if (rn) { const fs_ = slots[rn]; return fs_ ? fs_.map(x => x.text).join(lineStart && /\n/.test(def + fs_.map(x => x.text).join('')) ? '\n' : '') : def; }
    if (bn) { if (VALUES.has(bn)) return m; const fs_ = slots[bn]; return fs_ ? fs_.map(x => x.text).join('\n') + '\n' : ''; }
    if (VALUES.has(inl)) return m;
    return (slots[inl] || []).map(x => x.text).join('');
  });
  // 値だけを埋める(断片から入った文の中の {{名前}} は口として読み直さない)
  return out.replace(/\{\{(bin|code|data|local|gmail|gcal|last|start|q)\}\}/g, (m, k) => vals[k]);
}

// どの型にも無い口の名前を断片が書いていたら失敗(置き間違えた断片が黙って落ちないように)
export function checkSlots(slots, templates) {
  const known = new Set(templates.flatMap(f => [...slotNames(fs.readFileSync(f, 'utf8'))]));
  const bad = Object.entries(slots).filter(([n]) => !known.has(n)).flatMap(([n, xs]) => xs.map(x => `${x.file}: ${n}`));
  if (bad.length) throw new Error('どの型にも無い口の名前: ' + bad.join(', '));
}

function writeIfChanged(f, text) {
  try { if (fs.readFileSync(f, 'utf8') === text) return false; } catch {}
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.compose-${process.pid}`;
  fs.writeFileSync(tmp, text); fs.renameSync(tmp, f);
  return true;
}

export function composeAll() {
  const slots = fragments();
  checkSlots(slots, [...Object.values(TEMPLATES), ...PROMPTS].map(f => path.join(CODE, f)));
  const vals = values(), wrote = [];
  for (const [out, tpl] of Object.entries(TEMPLATES))
    if (writeIfChanged(path.join(DATA, out), NOTE + '\n' + expand(fs.readFileSync(path.join(CODE, tpl), 'utf8'), slots, vals))) wrote.push(out);
  // 共用方式: 項目のセッションの作業フォルダ(DATA)に Stop フックを置く。写し方式ではリポジトリの .claude/settings.json がそのまま使われる
  if (DATA !== CODE) {
    const hook = { hooks: { Stop: [{ hooks: [{ type: 'command', command: `DIGEST_DATA=${JSON.stringify(DATA)} node ${JSON.stringify(path.join(CODE, 'session-end.mjs'))} hook` }] }] } };
    if (writeIfChanged(path.join(DATA, '.claude', 'settings.json'), JSON.stringify(hook, null, 2) + '\n')) wrote.push('.claude/settings.json');
  }
  return wrote;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (!cmd) { const w = composeAll(); if (w.length) console.log('compose: ' + w.join(' ')); }
    else if (cmd === 'prompt' && /^(regular|quick)$/.test(arg || '')) {
      const slots = fragments(); checkSlots(slots, [...Object.values(TEMPLATES), ...PROMPTS].map(f => path.join(CODE, f)));
      process.stdout.write(expand(fs.readFileSync(path.join(CODE, 'prompts', arg + '.md'), 'utf8'), slots, values(true)).replace(/\n$/, ''));
    } else if (cmd === 'render' && arg) process.stdout.write(expand(fs.readFileSync(arg, 'utf8'), fragments(), values()));
    else { console.error('usage: compose.mjs [prompt regular|quick | render <file>]'); process.exit(2); }
  } catch (e) { console.error('compose: ' + e.message); process.exit(1); }
}
