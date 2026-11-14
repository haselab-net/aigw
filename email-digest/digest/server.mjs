// 新着まとめビューア。Email の箱の中で動き、aigw 経由で本人だけが開ける
// URL: 設定の pageUrl(aigw の /email/ か /sandbox-box/mail/port9100/)
// 認証: nginx が付ける X-Aigw-User/-Exp/-Sig を ~/.aigw/viewer.key で検算(aigw の箱の画面と同じ方式)
import http from 'http'; import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import crypto from 'crypto';
import { CODE, DATA, conf, get as confGet } from './conf.mjs';
// 拡張の読む先(ext.mjs。無ければメールだけ)
import { sources, sourceOfUrl } from './ext.mjs';
const PORT = Number(process.env.DIGEST_PORT || 9100), HOME = os.homedir(), ME = os.userInfo().username;
const DB = `${DATA}/items.json`;
const KEY = fs.readFileSync(`${HOME}/.aigw/viewer.key`, 'utf8').trim();
const ST = ['未決', '未読', '既読', '既決'];
const CLIENT = fs.readFileSync(`${CODE}/client.js`, 'utf8').replace(/\/\*DIGEST_SESSION\*\/\{[^}]*\}/, JSON.stringify(conf.session));
// 読み上げ(2026-10-25)。種類名は芯のメールと拡張の label
const SPEAK = fs.readFileSync(`${CODE}/speak.js`, 'utf8').replace(/\/\*DIGEST_SAY_SRC\*\/\{[^}]*\}/, `{ ${[['mail', 'メール'], ...sources.map(s => [s.name, s.label])].map(([k, v]) => `${k}: ${JSON.stringify(v).replace(/^"|"$/g, "'")}`).join(', ')} }`);
// 見出し・ボタン・速報の文字(芯はメール。拡張の読む先を後ろに足す)
const LABELS = ['メール', ...sources.map(s => s.label)];
const quickExt = sources.filter(s => s.quick && s.quick.length);
const FAST = ['メール', ...quickExt.filter(s => s.quick.some(q => !q.slow)).map(s => s.label)].join('・');
const SLOW = quickExt.filter(s => s.quick.some(q => q.slow)).map(s => s.label).join('・');
function isOwner(req) {
  const u = req.headers['x-aigw-user'], exp = Number(req.headers['x-aigw-exp']), sig = String(req.headers['x-aigw-sig'] || '');
  if (u !== ME || !(exp > Date.now() / 1000)) return false;
  const want = crypto.createHmac('sha256', KEY).update(`${u}\n${exp}`).digest('hex');
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return { items: [], runs: [] }; } };
const save = d => { fs.writeFileSync(DB + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(DB + '.tmp', DB); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// スマホのブラウザだと Gmail はスマホ版(/mail/mu/mp/)へ転送し、パソコン版の #all/FMfcgz… を捨てて受信箱を出す。
// スマホ版はスレッド ID(16進)を #cv/all/<id> で受け付けるので(2026-10-09 ユーザーが実機で確認)、その URL も持たせておき、ページ側で切り替える。
const mobileAttr = i => { const m = /^mail:([0-9a-f]{16})$/.exec(i.id); return m && i.link && i.link.includes('mail.google.com') ? ` data-mobile="https://mail.google.com/mail/mu/mp/39/#cv/all/${/^[0-9a-f]{16}$/.test(i.threadId || '') ? i.threadId : m[1]}"` : ''; };
// 「続きから」は aigw が作業フォルダ(digest)の会話一覧から探すので、別のフォルダ(cwd が ~/mailbox だった 10/9 以前など)で
// 始まった会話は見つからずにエラーになる(2026-10-11)。ページを出すときに、その会話ログを digest のフォルダへ写しておく
const PROJ = `${HOME}/.claude/projects`, DIGEST_PROJ = `${PROJ}/${`${HOME}/${conf.session.cwd}`.replace(/[^A-Za-z0-9]/g, '-')}`;
function adoptConversations(d) {
  for (const i of d.items) {
    const c = i.session && i.session.claude_session_id; if (!c || !/^[0-9a-f-]{36}$/.test(c) || fs.existsSync(`${DIGEST_PROJ}/${c}.jsonl`)) continue;
    try { const src = fs.readdirSync(PROJ).map(x => `${PROJ}/${x}/${c}.jsonl`).find(f => fs.existsSync(f));
      if (src) { fs.mkdirSync(DIGEST_PROJ, { recursive: true }); fs.copyFileSync(src, `${DIGEST_PROJ}/${c}.jsonl`); console.log('adopted', c, 'from', src); } } catch (e) { console.warn('adopt', c, e.message); }
  }
}
// 「今すぐチェック」の1段目の速報(要約前)。2段目が終わるまでだけ出す
function quickRaw() {
  try { const q = JSON.parse(fs.readFileSync(`${DATA}/quick.json`, 'utf8')); if (q.state !== 'raw') return '';
    const r = JSON.parse(fs.readFileSync(`${DATA}/quick/quick-raw.json`, 'utf8'));
    return `<h2>速報 <small>${r.length}件、要約中${SLOW ? `(${SLOW} もこのあと)` : ''}</small></h2>` + (r.map(i => `<div class="it ${esc(i.source)}"><div class="hd">${srcBadge(i.source)} <span class="tm">${esc((i.time || '').replace('T', ' '))}</span> <b>${esc(i.from)}</b></div><div class="tt">${i.link ? `<a href="${esc(i.link)}" target="_blank">${esc(i.title)}</a>` : esc(i.title)}</div><div class="sm">${linkify(i.text)}</div></div>`).join('') || '<p class="none">新着なし</p>');
  } catch { return ''; }
}
// 要約の中の長い URL を短いリンク(読む先の名前・「メール」やドメイン名)にする(2026-10-16 ユーザー依頼)
const linkLabel = u => sourceOfUrl(u)?.label || (/mail\.google\.com/.test(u) ? 'メール' : (/^https?:\/\/([^/]+)/.exec(u) || [, 'リンク'])[1].replace(/^www\./, ''));
const linkifyBare = t => esc(t).replace(/https?:\/\/[^\s<>"'）)]+/g, u => `<a href="${u}" target="_blank">${linkLabel(u)}↗</a>`)
  // 元の種類はアイコンで出す(2026-11-04 ユーザー依頼)。要約の行頭の [メール] や [<読む先の名前>] も同じ
  .replace(KINDMARK, (m, k) => `<span class="ic" title="${k}">${SRC_ICON[KIND[k]]}</span>`);
const SRC_ICON = { mail: '📫', ...Object.fromEntries(sources.map(s => [s.name, s.icon || '🔗'])) };
const KIND = { メール: 'mail', ...Object.fromEntries(sources.map(s => [s.label, s.name])) };
const KINDMARK = new RegExp(`\\[(${Object.keys(KIND).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\]`, 'g');
// 要約の中の [表示](ref) を、その語をアンカーにしたリンクにする(2026-11-05 ユーザー依頼)。
// ref は mail:<threadId> か URL。空白区切りで複数書くと、2つ目からは語の後ろに ²³… の小さなリンクを付ける。info(項目の refInfo)があれば件名をツールチップに出す
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', RED = 'BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz';
const threadToken = hex => { let n = 0n; for (const c of Buffer.from(`f:${BigInt('0x' + hex)}`).toString('base64').replace(/=+$/, '')) n = n * 64n + BigInt(B64.indexOf(c)); let o = ''; while (n) { o = RED[Number(n % 40n)] + o; n /= 40n; } return o; }; // gmail.py の thread_token と同じ
const refHref = r => { const m = /^mail:([0-9a-f]+)$/.exec(r); return m ? [`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(conf.account)}#all/${threadToken(m[1])}`, `https://mail.google.com/mail/mu/mp/39/#cv/all/${m[1]}`] : [r, '']; };
const refA = (r, text, info) => { const [h, mob] = refHref(r), t = (info || {})[r] && info[r].label; return `<a href="${esc(h)}"${mob ? ` data-mobile="${esc(mob)}"` : ''}${t ? ` title="${esc(t)}"` : ''} target="_blank">${text}</a>`; };
const SUP = '¹²³⁴⁵⁶⁷⁸⁹';
const REFMARK = /\[([^\]\n]+)\]\(((?:mail:[0-9a-f]+|https?:\/\/[^\s)]+)(?:\s+(?:mail:[0-9a-f]+|https?:\/\/[^\s)]+))*)\)/g;
const linkify = (t, info) => { t = String(t || ''); let out = '', at = 0;
  for (const m of t.matchAll(REFMARK)) { const rs = m[2].split(/\s+/);
    out += linkifyBare(t.slice(at, m.index)) + refA(rs[0], esc(m[1]), info) + rs.slice(1).map((r, k) => refA(r, `<sup>${SUP[k + 1] || k + 2}</sup>`, info)).join(''); at = m.index + m[0].length; }
  return out + linkifyBare(t.slice(at)); };
const refsInText = t => new Set([...String(t || '').matchAll(REFMARK)].flatMap(m => m[2].split(/\s+/)));
const srcBadge = s => SRC_ICON[s] ? `<span class="src ic" title="${esc(s)}">${SRC_ICON[s]}</span>` : `<span class="src">${esc(s)}</span>`;
// 締切(項目の due、"YYYY-MM-DD" か "YYYY-MM-DDTHH:MM"、JST)。未決・未読のときだけ、残り日数つきで出す(2026-10-17 ユーザー依頼)
function dueBadge(i) {
  if (!i.due || !/^(未決|未読)$/.test(i.status)) return '';
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), day = i.due.slice(0, 10);
  const days = Math.round((Date.parse(day) - Date.parse(today)) / 86400e3);
  const wd = '日月火水木金土'[new Date(day + 'T00:00:00Z').getUTCDay()];
  const rest = days < 0 ? `${-days}日過ぎ` : days === 0 ? '今日' : days === 1 ? '明日' : `あと${days}日`;
  return ` <span class="due${days <= 2 ? ' soon' : ''}">締切 ${+day.slice(5, 7)}/${+day.slice(8, 10)}(${wd})${i.due.length > 10 ? ' ' + i.due.slice(11, 16) : ''} ${rest}</span>`;
}
// 待ち(wait.mjs。条件・日時のリマインダー、2026-10-23 ユーザー依頼): 成立前は状態の欄から外して「待ち」の欄に置き、成立したら未決の先頭に出す
const waiting = i => i.wait && !i.wait.fired && i.status !== '既決';
const firedNew = i => i.wait && i.wait.fired && !i.wait.told;
const sorted = (d, s) => d.items.filter(i => s === '待ち' ? waiting(i) : i.status === s && !waiting(i))
  // 対応不要のまとめは大事でないので、どの欄でも一番下(2026-10-30 ユーザー依頼)
  .sort((a, b) => (a.id === 'misc:noaction') - (b.id === 'misc:noaction') || firedNew(b) - firedNew(a) || (s === '待ち' ? (a.wait.at || '9').localeCompare(b.wait.at || '9') : (b.time || '').localeCompare(a.time || '')));
const md = t => `${+t.slice(5, 7)}/${+t.slice(8, 10)}(${'日月火水木金土'[new Date(t.slice(0, 10) + 'T00:00:00Z').getUTCDay()]})${t.length > 10 ? ' ' + t.slice(11, 16) : ''}`;
function waitBox(i) {
  if (!i.wait || i.status === '既決') return '';
  const w = i.wait, when = [w.at && md(w.at), w.cond && '条件: ' + w.cond].filter(Boolean).join(' または ');
  return w.fired ? (w.told ? '' : `<div class="wt fired">成立 ${esc(md(w.fired))}: ${linkify(w.why)}<br>頼むこと: ${esc(w.task)}</div>`)
    : `<div class="wt">待ち: ${esc(when)}<br>成立したら: ${esc(w.task)}</div>`;
}
const row = (i, s) => `
<div class="it ${i.source}"${i.id === 'misc:noaction' ? ' data-last="1"' : ''} data-id="${esc(i.id)}" data-time="${esc(i.time || '')}"><div class="hd">${srcBadge(i.source)} <span class="tm">${esc((i.time || '').replace('T', ' ').slice(0, 16))}</span> <b>${esc(i.from)}</b>${dueBadge(i)}</div>
<div class="tt">${i.link ? `<a href="${esc(i.link)}"${mobileAttr(i)} target="_blank">${esc(i.title)}</a>` : esc(i.title)}</div>
<div class="sm">${linkify(i.summary, i.refInfo)}</div>${i.action ? `<div class="ac">対応: ${esc(i.action)}</div>` : ''}${i.note ? `<div class="nt">メモ: ${esc(i.note)}</div>` : ''}${refList(i)}${waitBox(i)}${i.doneAsk && i.status === '既決' ? '<div class="wt">Claude が今の作業を終えてから既決にするか決めます(要ると判断したら未決に戻ります)</div>' : ''}
<div class="bt"><button class="say" title="この項目を読み上げる(長押しで速さ・声)" onclick="sayOne(this)">🔊</button><button class="cl" onclick="claude('${esc(i.id)}',this)">${i.session ? (i.session.deleted ? 'AIで続きから' : 'AIを開く') : 'AIで対応'}</button>${waiting(i) ? `<button onclick="unwait('${esc(i.id)}',this)">待ちを外す</button>` : ''}${ST.filter(x => x !== s).map(x => `<button onclick="st('${esc(i.id)}','${x}',this)">${x}へ</button>`).join('')}</div></div>`;
// まとめ項目の元のメッセージ(refs)を開閉できる一覧で出す(2026-11-05 ユーザー依頼)。
// 差出人・件名は refInfo(add.mjs と ref-info.py が付ける)。無いものは URL だけ。新しい順
function refList(i) {
  // 要約の中でリンクにしたものは除き、残り(要約に印の無いもの)だけ出す
  const inText = refsInText(i.summary), rest = (i.refs || []).filter(r => !inText.has(r));
  if (!rest.length) return '';
  const info = i.refInfo || {};
  // 読む先の拡張が URL から時刻を出せれば出す(refInfo に time が無いとき)
  const refTime = r => { const s = sourceOfUrl(r); return s && s.refTime ? s.refTime(r) : ''; };
  const rs = rest.map(r => ({ r, time: refTime(r), ...(info[r] || {}) })).sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  const li = rs.map(x => {
    const mail = /^mail:/.test(x.r), url = x.url || (mail ? '' : x.r);
    const src = mail ? null : sourceOfUrl(x.r);
    const label = x.label || (mail ? 'メール ' + x.r.slice(5) : linkLabel(x.r) + ' ' + (src && src.refLabel ? src.refLabel(x.r) : x.r));
    const tm = x.time ? `<span class="tm">${esc(md(x.time))}</span> ` : '';
    return `<li>${mail ? SRC_ICON.mail : src ? SRC_ICON[src.name] : '🔗'} ${tm}${url ? `<a href="${esc(url)}"${x.mobile ? ` data-mobile="${esc(x.mobile)}"` : ''} target="_blank">${esc(label)}</a>` : esc(label)}</li>`;
  }).join('');
  return `<details class="refs"><summary>${inText.size ? '要約に無い元のメッセージ' : '元のメッセージ'} ${rs.length}件</summary><ul>${li}</ul></details>`;
}
function page(d) {
  adoptConversations(d);
  // 欄の並びは 未読・未決・待ち・既読・既決(2026-11-04 ユーザー依頼)
  const groups = ['未読', '未決', '待ち', '既読', '既決'].map(s => {
    const its = sorted(d, s);
    // どの欄も開閉でき、開閉はブラウザに覚えておく(localStorage、2026-10-23 ユーザー依頼)。既定は既決だけ閉じる。
    // 既決は開いたら、ページ全体のスクロールが下まで来たところで古いものを読み足す(/rows、2026-10-18。枠の中のスクロールは 10-23 にやめた)
    const rows = s === '既決' ? '' : its.slice(0, s === '既読' ? 60 : 500).map(i => row(i, s)).join('') || '<p class="none">なし</p>';
    return `<details id="g-${s}" data-s="${s}"${s === '既決' ? '' : ' open'} ontoggle="tog(this)"><summary><h2>${s} <small class="n">${its.length}</small></h2></summary><div class="rows"${s === '既決' ? ' id="donebox"' : ''}>${rows}</div></details>`;
  }).join('');
  const last = d.runs.at(-1);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>新着まとめ</title><style>
body{font-family:-apple-system,system-ui,sans-serif;margin:0 auto;max-width:760px;padding:12px 16px;background:#0b0f14;color:#e6e6e6;color-scheme:dark}
a{color:#7cb7ff}a:visited{color:#b59cff}
h1{font-size:1.2em}h2{font-size:1.05em;border-bottom:2px solid #3a4654;margin-top:1.4em}small{color:#9aa5b1}
.it{background:#131a22;border-radius:8px;padding:8px 10px;margin:8px 0;border:1px solid #1f2933}
.hd{font-size:.8em;color:#9aa5b1}.src{display:inline-block;padding:0 6px;border-radius:4px;background:#2a3440;color:#e6e6e6}
.mail .src{background:#1f3a5c}${sources.map(s => s.color ? `.${s.name} .src{background:${s.color}}` : '').join('')}.src.ic{background:none;padding:0;font-size:1.2em}
.due{display:inline-block;margin-left:6px;padding:0 6px;border-radius:4px;background:#2a3440;color:#cfd6dd}.due.soon{background:#b3261e;color:#fff}
.tt{font-weight:600;margin:3px 0}.sm{font-size:.92em;white-space:pre-wrap}.ac{font-size:.9em;color:#ffb366;margin-top:3px}
details>summary{cursor:pointer;list-style:none}details>summary h2{display:inline-block;width:calc(100% - 1.4em)}details>summary::before{content:'▶ ';color:#9aa5b1}details[open]>summary::before{content:'▼ '}
button{background:#1f2933;color:#e6e6e6;border:1px solid #3a4654;border-radius:6px;padding:3px 8px;cursor:pointer}button:hover{background:#2a3440}button:disabled{opacity:.5}
.bt button{margin:6px 6px 0 0;font-size:.85em}.bt .cl{font-weight:600;background:#1f3a5c;border-color:#2f5a8c}.nt{font-size:.88em;color:#8fc8ff;margin-top:3px}.none{color:#7d8894}.run{font-size:.8em;color:#9aa5b1;white-space:pre-wrap}
.refs{font-size:.88em;margin-top:4px}.refs summary{color:#9aa5b1}.refs summary::before{content:'▶ '}.refs[open] summary::before{content:'▼ '}.refs ul{margin:4px 0;padding-left:1.2em;list-style:none}.refs li{margin:2px 0;padding-left:0}.refs .tm{color:#9aa5b1}
.wt{font-size:.88em;color:#c9b6ff;margin-top:3px;padding:3px 6px;border-left:3px solid #6b5bb3}.wt.fired{color:#fff;background:#3a2f6b;border-color:#b39cff}
.it.saying{border-color:#7cb7ff;box-shadow:0 0 0 2px #7cb7ff66}#sp,.bt .say{-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.saypop{position:fixed;z-index:9;display:flex;flex-direction:column;gap:8px;padding:10px;background:#1f2933;border:1px solid #3a4654;border-radius:8px;box-shadow:0 4px 14px #0008;font-size:.9em;max-width:calc(100vw - 16px)}
.saypop label{display:flex;align-items:center;gap:8px}.saypop select{flex:1;min-width:0;max-width:16em;background:#131a22;color:#e6e6e6;border:1px solid #3a4654;border-radius:6px;padding:3px}.saypop button{align-self:flex-end}.saypop .sl{font-weight:bold;opacity:.8}#spbar{position:sticky;top:0;z-index:1;background:#0b0f14;padding:4px 0}
.it.busy{opacity:.45;pointer-events:none}.it .mv{font-size:.85em;color:#ffb366;margin-top:4px}
#toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);max-width:calc(100% - 32px);background:#1f2933;color:#e6e6e6;border:1px solid #3a4654;border-radius:8px;padding:8px 14px;font-size:.9em;box-shadow:0 2px 8px #0008;display:none}
</style></head><body><h1>新着まとめ(${LABELS.join('・')})</h1>
<div class="run"><button id="qc" onclick="quick()">今すぐチェック(${['メール', ...sources.map(s => s.quickTag || s.label)].join('・')})</button> <span id="qs"></span></div>
<div class="run" id="spbar" style="display:none"><button id="sp" title="長押しで速さ・声" onclick="sayAll()">🔊 未決・未読を読み上げる</button><button id="spn" style="display:none" onclick="sayAt(sayIdx+1)">⏭ 次へ</button> <button id="sps" style="display:none" onclick="sayStop()">⏹ 停止</button> <span id="spi"></span></div>
<div class="run">最終チェック: ${esc(last ? last.at.replace('T', ' ').slice(0, 16) + ' JST  ' + (last.note || '') : 'まだ')}</div>
${quickRaw()}${groups}<div id="toast"></div><script>
const ITEMS=${JSON.stringify(Object.fromEntries(d.items.map(i => [i.id, i]))).replace(/</g, '\\u003c')};
${CLIENT}
${SPEAK}
if (/Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent)) document.querySelectorAll('a[data-mobile]').forEach(a => a.href = a.dataset.mobile);
// /email/#<項目id> でその項目へ飛ぶ(aigw のやること一覧からのリンク、2026-11-07)。欄に無ければ(既決など)/row でもらって先頭に出す
async function gotoHash(){const id=decodeURIComponent(location.hash.slice(1));if(!id)return;let el=[...document.querySelectorAll('.it[data-id]')].find(x=>x.dataset.id===id);
 if(!el){const h=await fetch(location.pathname.replace(/\\/?$/,'/')+'row?id='+encodeURIComponent(id)).then(r=>r.ok?r.text():'').catch(()=>'');if(!h)return;const w=document.createElement('div');w.innerHTML=h;el=w.querySelector('.it');if(!el)return;document.querySelector('h1').after(el)}
 const g=el.closest('details');if(g)g.open=true;el.scrollIntoView({block:'center'});el.classList.add('saying');setTimeout(()=>el.classList.remove('saying'),3000)}
gotoHash();window.addEventListener('hashchange',gotoHash);
const QB=location.pathname.replace(/\\/?$/,'/');
let doneN=0,doneBusy=false,doneEnd=false;
async function doneMore(){const b=document.getElementById('donebox');if(doneBusy||doneEnd||!document.getElementById('g-既決').open||doneN&&scrollY+innerHeight<document.documentElement.scrollHeight-600)return;doneBusy=true;
 const t=await fetch(QB+'rows?status='+encodeURIComponent('既決')+'&offset='+doneN).then(r=>r.text()).catch(()=>'');doneBusy=false;
 if(!t){doneEnd=true;if(!doneN)b.innerHTML='<p class="none">なし</p>';return}b.insertAdjacentHTML('beforeend',t);doneN+=30;doneMore()}
const OPEN=(()=>{try{return JSON.parse(localStorage.getItem('digest-open'))||{}}catch{return {}}})();
function tog(el){OPEN[el.dataset.s]=el.open;try{localStorage.setItem('digest-open',JSON.stringify(OPEN))}catch{}if(el.dataset.s==='既決')doneMore()}
document.querySelectorAll('details[data-s]').forEach(el=>{const o=OPEN[el.dataset.s];if(o!==undefined&&o!==el.open)el.open=o});
addEventListener('scroll',doneMore,{passive:true});
async function qpoll(prev){const q=await fetch(QB+'quick-status').then(r=>r.json()).catch(()=>({}));const el=document.getElementById('qs'),b=document.getElementById('qc');
 const live=(q.state==='running'||q.state==='raw')&&Date.now()-Date.parse(q.at)<20*60e3, st=live?q.state:'idle';
 if(prev&&prev!==st&&prev!=='start'&&(st==='raw'||st==='idle'))return location.reload();
 if(prev==='start'&&q.state==='busy'){b.disabled=false;el.textContent='定期チェックが動いているので、終わってからもう一度押してください';return}
 if(prev==='start'&&st==='idle'&&q.state==='done'&&Date.now()-Date.parse(q.at)<60e3)return location.reload();
 if(live){b.disabled=true;el.textContent=st==='running'?'チェック中…(${FAST} は10秒ほど)':'速報を表示中。要約${SLOW ? `と ${SLOW} ` : ''}はあと1〜2分';return setTimeout(()=>qpoll(st),3000)}
 if(prev==='start')return setTimeout(()=>qpoll('start'),2000);
 b.disabled=false}
async function quick(){document.getElementById('qc').disabled=true;document.getElementById('qs').textContent='開始…';await fetch(QB+'quick-check',{method:'POST'});setTimeout(()=>qpoll('start'),1500)}
qpoll(null);
// 状態の変更はページを読み直さず、その場で項目を移す。既決のセッションの停止(aigw が Claude の終了を最大10秒待つ)は裏で進め、下に経過を出す(2026-10-22 ユーザー指摘)
function toast(t,ms){const e=document.getElementById('toast');e.textContent=t;e.style.display=t?'block':'none';clearTimeout(e._t);if(ms)e._t=setTimeout(()=>e.style.display='none',ms)}
async function unwait(id,btn){if(!confirm('待ちを外しますか?'))return;const r=await fetch(QB+'wait-clear',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});if(!r.ok)return alert('失敗: '+r.status);location.reload()}
function bump(s,k){const n=document.querySelector('#g-'+s+' .n');if(n)n.textContent=Math.max(0,+n.textContent+k)}
async function st(id,s,btn){
 const el=btn&&btn.closest('.it'),from=ITEMS[id]&&ITEMS[id].status;
 if(el){el.classList.add('busy');el.insertAdjacentHTML('beforeend','<div class="mv">'+s+'へ移しています…</div>')}
 const live=s==='既決'?await liveSession(ITEMS[id]).catch(()=>null):null;
 const r=await fetch(QB+'status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,status:s,ask:!!live})}).catch(e=>({ok:false,status:e.message}));
 if(!r.ok){if(el){el.classList.remove('busy');el.querySelector('.mv').remove()}return alert('失敗: '+r.status)}
 ITEMS[id].status=s;if(live)ITEMS[id].doneAsk=1;else delete ITEMS[id].doneAsk;
 if(live){toast('Claude に、作業を終えたら既決にしてよいか決めるよう伝えています…');
  askDone(id,live.id).then(()=>toast('伝えました。Claude が要ると判断したら未決に戻ります',5000)).catch(async e=>{toast('Claude に伝えられなかったので、セッションを停止・アーカイブします: '+e.message,8000);
   await fetch(QB+'status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,status:'既決'})});delete ITEMS[id].doneAsk;cleanupSessions(null,true)})}
 else if(s==='既決'&&ITEMS[id].session&&!ITEMS[id].session.deleted){toast('Claude セッションを停止・アーカイブしています…');
  cleanupSessions(null,true).then(left=>toast(left?'セッションの停止に解錠が要ります(上のボタンから)':'Claude セッションを停止・アーカイブしました',4000)).catch(e=>toast('セッションの停止に失敗: '+e.message,8000))}
 if(el){const box=el.parentNode;el.remove();if(box&&box.classList.contains('rows')&&!box.querySelector('.it'))box.innerHTML='<p class="none">なし</p>'}
 const wt=ITEMS[id].wait&&!ITEMS[id].wait.fired;if(from)bump(wt&&from!=='既決'?'待ち':from,-1);bump(wt&&s!=='既決'?'待ち':s,1);
 const w=ITEMS[id].wait,dest=s==='既決'?(doneN?document.getElementById('donebox'):null):document.querySelector('#g-'+(w&&!w.fired?'待ち':s)+' .rows');
 if(!dest)return;
 const h=await fetch(QB+'row?id='+encodeURIComponent(id)).then(r=>r.ok?r.text():'').catch(()=>'');if(!h)return;
 const t=document.createElement('div');t.innerHTML=h.trim();const nr=t.firstElementChild;if(!nr)return;
 const nn=dest.querySelector('p.none');if(nn)nn.remove();
 const after=nr.dataset.last?null:[...dest.querySelectorAll(':scope>.it')].find(x=>x.dataset.last||(x.dataset.time||'')<(nr.dataset.time||''));
 dest.insertBefore(nr,after||null);
}
</script></body></html>`;
}
http.createServer((req, res) => {
  if (!isOwner(req)) { res.writeHead(403); return res.end('forbidden'); }
  const path = req.url.split('?')[0].replace(/^\/(sandbox-box\/mail\/port9100|email)(?=\/|$)/, '') || '/';
  // 「今すぐチェック」: quick-check.sh を裏で起動し、状態は quick.json を返す(2026-10-16)
  if (req.method === 'POST' && path === '/quick-check') {
    spawn('sh', [`${CODE}/quick-check.sh`], { detached: true, stdio: 'ignore' }).unref();
    res.writeHead(200); return res.end('started');
  }
  if (path === '/rows') {
    const q = new URL(req.url, 'http://x').searchParams, st = q.get('status'), off = Math.max(0, +q.get('offset') || 0);
    const html = ST.includes(st) ? sorted(load(), st).slice(off, off + 30).map(i => row(i, st)).join('') : '';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html);
  }
  if (path === '/row') {
    const id = new URL(req.url, 'http://x').searchParams.get('id'), it = load().items.find(x => x.id === id);
    res.writeHead(it ? 200 : 404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(it ? row(it, it.status) : '');
  }
  // aigw の backend が「やること」一覧に出す数と、生きている digest セッションの項目の題(2026-11-07、root セッションと決めた)。
  // 題は aigw のログイン済みの一覧にだけ出す約束(通知には出さない)。session は aigw のセッション id、claude は Claude の会話 id
  if (path === '/counts') {
    const d = load(), live = d.items.filter(i => i.session && !i.session.deleted);
    const body = { unread: sorted(d, '未読').filter(i => i.id !== 'misc:noaction').length, undecided: sorted(d, '未決').length,
      fired: d.items.filter(i => i.wait && i.wait.fired && !i.wait.told && i.status !== '既決').length,
      items: Object.fromEntries(live.map(i => [i.id, { title: String(i.title || '').slice(0, 80), url: '/email/#' + encodeURIComponent(i.id), status: i.status, session: i.session.id, claude: i.session.claude_session_id || '' }])) };
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); return res.end(JSON.stringify(body));
  }
  if (path === '/quick-status') {
    let q = '{}'; try { q = fs.readFileSync(`${DATA}/quick.json`, 'utf8'); } catch {}
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(q);
  }
  if (req.method === 'POST' && path === '/status') {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      try { const { id, status, ask } = JSON.parse(b); if (!ST.includes(status)) throw 0;
        const d = load(); const it = d.items.find(x => x.id === id); if (!it) throw 0;
        it.status = status; it.changed = new Date().toISOString(); it.byUser = true;
        // ask: 生きている Claude セッションのある項目を既決にした。Claude が作業を終えて既決にしてよいか決めるまで、元の片付けとセッションの停止を待つ(2026-11-07 ユーザー依頼)
        if (status === '既決' && ask) it.doneAsk = new Date().toISOString(); else delete it.doneAsk;
        save(d); res.writeHead(200); res.end('ok');
        // 既決にしたらすぐ元も片付ける: メールはアーカイブ(gmail.py のトークンが gmail.modify なら)、拡張の読む先は既読
        if (status === '既決' && !ask) spawn('node', [`${CODE}/done-sync.mjs`], { detached: true, stdio: ['ignore', fs.openSync(`${DATA}/done-sync.log`, 'a'), fs.openSync(`${DATA}/done-sync.log`, 'a')] }).unref();
      } catch { res.writeHead(400); res.end('bad'); } });
    return;
  }
  if (req.method === 'POST' && path === '/session') {
    // まとめページが起動した aigw セッションを項目に紐付ける(次からは「開く」になる)
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      try { const { id, session } = JSON.parse(b); if (!session || !/^[\w-]+$/.test(session.id || '')) throw 0;
        const d = load(); const it = d.items.find(x => x.id === id); if (!it) throw 0;
        it.session = { id: session.id, claude_session_id: String(session.claude_session_id || ''), created: String(session.created || ''), seen: String(session.seen || '').slice(0, 64) };
        if (it.status === '未読' || it.status === '既読') { it.status = '未決'; it.byUser = true; }
        save(d); res.writeHead(200); res.end('ok');
      } catch { res.writeHead(400); res.end('bad'); } });
    return;
  }
  // 待ちの成立を Claude に伝えた(told)/待ちを外す(clear)
  if (req.method === 'POST' && (path === '/wait-told' || path === '/wait-clear')) {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      try { const { id } = JSON.parse(b); const d = load(); const it = d.items.find(x => x.id === id); if (!it || !it.wait) throw 0;
        if (path === '/wait-told') it.wait.told = new Date().toISOString(); else delete it.wait;
        save(d); res.writeHead(200); res.end('ok');
      } catch { res.writeHead(400); res.end('bad'); } });
    return;
  }
  if (req.method === 'POST' && path === '/session-deleted') {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      try { const { id, archived } = JSON.parse(b); const d = load(); const it = d.items.find(x => x.id === id); if (!it || !it.session) throw 0;
        // deleted は「既決で片付け済み」の印。2026-10-17 から削除でなくアーカイブなので archived も付ける(続きから開くとき replace_session に使う)
        it.session.deleted = new Date().toISOString(); if (archived) it.session.archived = true; save(d); res.writeHead(200); res.end('ok');
      } catch { res.writeHead(400); res.end('bad'); } });
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(page(load()));
}).listen(PORT, '0.0.0.0', () => console.log('digest: ' + conf.pageUrl));

// 待ちの日時が来たら成立させて通知する(wait.mjs tick、1分ごと)
setInterval(() => { const log = fs.openSync(`${DATA}/wait.log`, 'a'); spawn('node', [`${CODE}/wait.mjs`, 'tick'], { stdio: ['ignore', log, log] }).on('exit', () => fs.closeSync(log)); }, 60e3);
// 1時間おきに動かすもの(設定の hooks.hourly。ログインを保つ keep-login など、2026-10-13)。シェルで $HOME などを展開する
setInterval(() => { for (const h of conf.hooks.hourly || []) { const c = typeof h === 'string' ? h : h.cmd; if (c) spawn('sh', ['-c', c], { detached: true, stdio: 'ignore' }).unref(); } }, 3600e3);
