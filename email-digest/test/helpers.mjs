// Test helpers: build a throw-away box (HOME with digest/, fake gmail.py, fake aigw key, fake local config, stub tools)
// and talk to it. Only fake data. Nothing leaves 127.0.0.1.
import fs from 'fs'; import os from 'os'; import path from 'path'; import crypto from 'crypto';
import { spawn, spawnSync } from 'child_process'; import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // email-digest/
export const SRC = path.join(ROOT, 'digest');
export const FIX = path.join(ROOT, 'test', 'fixtures');
// The two private paths (ARCHITECTURE.md 1). Relative to email-digest/
export const PRIVATE = ['digest/private', 'tools'];
// Tools the scripts call by name; each becomes a logging stub. The private side adds its tools' names
// (digest/private/test/stubs.txt) unless the box is built in the public shape
export const STUBS = ['claude', 'uuidgen', 'curl'];
const privateStubs = () => { try { return fs.readFileSync(path.join(SRC, 'private', 'test', 'stubs.txt'), 'utf8').split(/\s+/).filter(Boolean); } catch { return []; } };

// Fake member values (no real names): the box owner is "Tanaka", account test@example.com
export const FAKE_CONF = {
  account: 'test@example.com', pageUrl: '/email/', notifyUrl: 'http://127.0.0.1:9/notify',
  me: { name: '田中', profile: 'テスト用の本人', role: '会社員', mentions: ['@田中'], nameRe: '田中|tanaka', nameHint: '田中・Tanaka' },
};

// opts.drop: paths relative to email-digest/ to delete from the copy (the public shape drops PRIVATE); opts.publicOnly: no private stubs
// opts.conf: extra keys merged into local/config.json; opts.items: items.json content
export function makeBox(opts = {}) {
  const root = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'digest-test-'));
  const home = path.join(root, 'home'), code = path.join(home, 'digest'), bin = path.join(root, 'bin');
  const src = path.join(root, 'src');                          // a copy of email-digest/ (so drop works the way publish-snapshot does)
  fs.cpSync(ROOT, src, { recursive: true, filter: s => !/\/(node_modules|__pycache__|\.git)(\/|$)/.test(s) });
  for (const p of opts.drop || []) fs.rmSync(path.join(src, p), { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });
  fs.cpSync(path.join(src, 'digest'), code, { recursive: true });
  fs.copyFileSync(path.join(FIX, 'fake-gmail.py'), path.join(home, 'gmail.py')); fs.chmodSync(path.join(home, 'gmail.py'), 0o755);
  if (fs.existsSync(path.join(src, 'gcal.py'))) fs.copyFileSync(path.join(src, 'gcal.py'), path.join(home, 'gcal.py'));
  fs.mkdirSync(path.join(home, '.gmail'), { recursive: true });
  fs.writeFileSync(path.join(home, '.gmail', 'account'), 'test@example.com\n');
  fs.writeFileSync(path.join(home, '.gmail', 'token.json'), JSON.stringify({ scopes: ['https://www.googleapis.com/auth/gmail.modify'] }));
  fs.mkdirSync(path.join(home, '.aigw'), { recursive: true });
  fs.writeFileSync(path.join(home, '.aigw', 'viewer.key'), 'fake-viewer-key\n');
  fs.mkdirSync(path.join(code, 'local'), { recursive: true });
  fs.writeFileSync(path.join(code, 'local', 'config.json'), JSON.stringify(merge(FAKE_CONF, opts.conf || {}), null, 1));
  if (opts.items) fs.writeFileSync(path.join(code, 'items.json'), JSON.stringify(opts.items, null, 1));
  fs.mkdirSync(bin);
  for (const s of [...STUBS, ...(opts.publicOnly ? [] : privateStubs())]) { fs.copyFileSync(path.join(FIX, 'stub.sh'), path.join(bin, s)); fs.chmodSync(path.join(bin, s), 0o755); }
  const log = path.join(root, 'calls.log'); fs.writeFileSync(log, '');
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: log, TZ: 'Asia/Tokyo', LANG: 'C.UTF-8' };
  for (const k of ['DIGEST_DATA', 'DIGEST_LOCAL', 'DIGEST_EXT', 'MAILBOX_HOME', 'MAILBOX_DIR', 'AIGW_BOX_TAG', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID', 'AIGW_OUTBOX']) delete env[k];
  return { root, home, code, bin, src, log, env,
    run: (cmd, args, o = {}) => spawnSync(cmd, args, { cwd: code, env: { ...env, ...(o.env || {}) }, encoding: 'utf8', timeout: o.timeout || 60e3, input: o.input }),
    node: (file, args = [], o = {}) => spawnSync(process.execPath, [path.join(code, file), ...args], { cwd: code, env: { ...env, ...(o.env || {}) }, encoding: 'utf8', timeout: o.timeout || 60e3 }),
    items: () => JSON.parse(fs.readFileSync(path.join(code, 'items.json'), 'utf8')),
    calls: () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)),
    norm: s => String(s).split(root).join('<ROOT>'),
    cleanup: () => { if (!process.env.KEEP_TMP) fs.rmSync(root, { recursive: true, force: true }); },
  };
}

export const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k], v) : v; return o; };

// Start server.mjs in the box on a free port; returns {get, post, stop}. Requests carry valid aigw signature headers
export async function startServer(box) {
  const port = await freePort();
  const p = spawn(process.execPath, [path.join(box.code, 'server.mjs')], { cwd: box.code, env: { ...box.env, DIGEST_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', c => out += c); p.stderr.on('data', c => out += c);
  const exited = new Promise(r => p.on('exit', code => r(code)));
  for (let i = 0; i < 100 && !/digest: /.test(out); i++) {
    if (p.exitCode !== null) throw new Error('server exited: ' + out);
    await new Promise(r => setTimeout(r, 50));
  }
  if (!/digest: /.test(out)) { p.kill(); throw new Error('server did not start: ' + out); }
  const key = fs.readFileSync(path.join(box.home, '.aigw', 'viewer.key'), 'utf8').trim();
  const user = os.userInfo().username, exp = Math.floor(Date.now() / 1000) + 3600;
  const headers = { 'x-aigw-user': user, 'x-aigw-exp': String(exp), 'x-aigw-sig': crypto.createHmac('sha256', key).update(`${user}\n${exp}`).digest('hex') };
  const base = `http://127.0.0.1:${port}`;
  return {
    port, output: () => out,
    get: async (u, h = headers) => { const r = await fetch(base + u, { headers: h }); return { status: r.status, text: await r.text() }; },
    post: async (u, body) => { const r = await fetch(base + u, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, text: await r.text() }; },
    stop: async () => { p.kill(); await exited; },
  };
}

function freePort() {
  return new Promise((res, rej) => { import('net').then(({ default: net }) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); s.on('error', rej); }); });
}

// Files of email-digest/ that will be published (everything outside PRIVATE), relative paths
export function publicFiles(root = ROOT) {
  const out = [];
  const walk = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    const rel = d ? `${d}/${e.name}` : e.name;
    if (PRIVATE.includes(rel) || /(^|\/)(\.git|node_modules|__pycache__)$/.test(rel)) continue;
    if (e.isDirectory()) walk(rel); else out.push(rel);
  } };
  walk('');
  return out.sort();
}

// The deny list (digest/private/deny-words.txt of the full repo): one word per line, # comments. null when absent (public copy)
export const DENY_FILE = path.join(ROOT, 'digest', 'private', 'deny-words.txt');
export function denyWords() {
  try { return fs.readFileSync(DENY_FILE, 'utf8').split('\n').map(s => s.trim().toLowerCase()).filter(s => s && !s.startsWith('#')); } catch { return null; }
}
export const denyHits = t => { const l = String(t).toLowerCase(); return (denyWords() || []).filter(w => l.includes(w)); };

// Golden files: compare, or write them when UPDATE_GOLDEN=1
export function golden(dir, name, actual) {
  const f = path.join(dir, name);
  if (process.env.UPDATE_GOLDEN === '1') { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, actual); return actual; }
  if (!fs.existsSync(f)) throw new Error(`golden ${name} が無い(今のコードで UPDATE_GOLDEN=1 sh test.sh を1回)`);
  return fs.readFileSync(f, 'utf8');
}
