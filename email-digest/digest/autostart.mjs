// 未決の項目に、クリックを待たずに Claude セッションを起動する(2026-11-07 ユーザー依頼)。
// aigw の notify リスナーの POST /sessions(箱からだけ通る。preset・cwd・group は固定、生きている箱発のセッション 8 件・1時間 10 件まで。サーバー文書 aigw)を使う。
// 1通目はページの「AIで対応」と同じ「新着まとめの項目 <id>「<題>」に対応したいです。」で、aigw が入力欄を待って送る。
// 対象: 未決・本人が画面で触っていない(byUser なし)・成立前の待ちなし、で、session なし・まだ試していない(autoStart なし、429 と通信の失敗は次の回に再試行)か、
//       session があってそれより新しい返信が来た(下の「続き」)もの。
// 使い方: node ~/digest/autostart.mjs [--max N] [--dry] [--id <項目id>]   run-check.sh・quick-check.sh が add の後に呼ぶ
import fs from 'fs'; import { notifyUrl } from './lib.mjs'; import { DATA, conf } from './conf.mjs';
const DB = `${DATA}/items.json`;
const load = () => { if (!fs.existsSync(DB)) return { items: [], runs: [] }; return JSON.parse(fs.readFileSync(DB, 'utf8')); }; // 初めての箱では items.json がまだ無い
const save = d => { fs.writeFileSync(DB + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(DB + '.tmp', DB); };
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const MAX = Number(arg('--max') || 5), DRY = process.argv.includes('--dry'), ONLY = arg('--id');
// client.js と同じもの(1通目・seen の印)
const context = it => `新着まとめの項目 ${it.id}「${it.title}」に対応したいです。`;
const sig = it => { let h = 0; for (const c of `${it.summary || ''}|${it.action || ''}`) h = (h * 31 + c.charCodeAt(0)) | 0; return `${it.time || ''}|${(h >>> 0).toString(36)}`; };
const updateNote = it => `この項目(${it.id})は前回から更新されています(最新 ${it.time || '?'} ${it.from || ''})。node item.mjs ${it.id} と元のメッセージを読み直して、新しい返信などで変わった点と対応案を教えてください。`;
const retryable = a => !a || a.retry;
// 続き(2026-11-10 ユーザー依頼):
// 前のセッションがある項目に、それより新しい返信が来たら(add.mjs の開き直し・同じ話のまとめ)、aigw に continue で前のセッションを渡す。
// 動いていればそこへ知らせを送り、終わって(アーカイブされて)いれば同じ id・同じ会話で再開して知らせを送る(the deployment notes)
const newer = i => i.session && (i.time || '') > String(i.session.seen || '').split('|')[0];
const tried = i => i.autoStart && i.autoStart.sig === sig(i) && !i.autoStart.retry;
const want = load().items.filter(i => ONLY ? i.id === ONLY : (i.status === '未決' && !i.byUser && !(i.wait && !i.wait.fired) && i.id !== 'misc:noaction'
  && (i.session ? newer(i) && !tried(i) : retryable(i.autoStart))));
const url = (notifyUrl() || '').replace(/\/notify$/, '/sessions');
if (!/\/sessions$/.test(url)) { console.error('autostart: 設定の notifyUrl から送り先が分からない'); process.exit(1); }
const ts = () => new Date().toISOString();
const post = async body => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
for (const it0 of want.slice(0, MAX)) {
  const cont = it0.session && it0.session.id;
  const body = { preset: conf.session.preset, cwd: conf.session.cwd, group: conf.session.group, label: ('digest: ' + it0.title).slice(0, 40), cols: 100, rows: 40,
    initial_message: (cont ? updateNote(it0) : context(it0)).slice(0, 500), ...(cont ? { continue: cont } : {}) };
  if (DRY) { console.log('dry', it0.id, cont ? 'continue ' + cont : 'new', body.label); continue; }
  let rec;
  try {
    let { status, j } = await post(body);
    if (status === 404 && cont) { // 前のセッションが aigw に残っていない: 新しく始める
      ({ status, j } = await post({ ...body, continue: undefined, initial_message: context(it0).slice(0, 500) }));
      if (status === 201) j.continued = 'lost';
    }
    if ((status === 201 || status === 200) && j.id) rec = { ok: true, how: j.continued || 'started', session: { id: j.id, claude_session_id: j.claude_session_id || '', created: ts(), seen: sig(it0), auto: true } };
    else rec = { ok: false, error: `${status} ${j.error || ''}`.trim(), retry: status === 429 || status >= 500 };
  } catch (e) { rec = { ok: false, error: e.message, retry: true }; }
  const d = load(), it = d.items.find(x => x.id === it0.id);
  if (!it) continue;
  if (rec.ok && (!it.session || cont)) it.session = rec.how === 'running' || rec.how === 'resumed' ? { ...it.session, ...rec.session, created: it.session.created || rec.session.created, resumed: ts(), deleted: undefined, archived: undefined } : rec.session;
  it.autoStart = { at: ts(), sig: sig(it0), ...(rec.ok ? { id: rec.session.id, how: rec.how } : { error: rec.error, retry: rec.retry }) };
  save(d);
  console.log(`autostart ${it0.id}: ${rec.ok ? rec.how + ' ' + rec.session.id : 'FAILED ' + rec.error}`);
  if (!rec.ok && rec.error.startsWith('429')) break; // 上限。残りは次の回に
}
