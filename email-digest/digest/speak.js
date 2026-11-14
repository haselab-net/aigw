// 読み上げ(2026-10-25 ユーザー依頼)。
// 端末の音声(ブラウザの speechSynthesis。Android は Google の音声)で読む。サーバー側には何も無い。
// 読むのは未決・未読の欄の項目だけ(画面の並び順。成立したばかりの待ちは未決の先頭にある)。待ち・既読・既決・速報は読まない。
// 文は画面からでなく ITEMS から組み立てる: 種類・差出人・件名・要約・対応・締切。時刻・ボタン・URL・メモ・待ちの条件は読まない。
// 読み終えても状態は変えない(既読へは自分で移す)。
const SAY_OK = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
const SAY_SRC = /*DIGEST_SAY_SRC*/{ mail: 'メール' };
let sayGen = 0, sayList = [], sayIdx = -1, sayPaused = false;
// 速さ・声(2026-10-25 ユーザー依頼。Windows の「音声の速度」は一部のブラウザに効かない)。🔊 の長押し(PC は右クリック)で出す。
// aigw のチャットの読み上げと同じオリジンなので、同じ localStorage のキーで設定を共有する(the deployment notes)
const SAY_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
const sayPref = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
// 言語ごとの速さ・声(2026-11-03 ユーザー依頼)。
// the deployment notes と同じ決め方: かな・漢字を含む文は日本語、含まずに英字があれば英語の声で読む。
// キーは aigw と同じ: aigw の表示言語(aigw-lang)のものが素のキー、もう一方は "-en"/"-ja" 付き(未設定なら素の速さ)。
// localStorage はブラウザごとなので、設定はその機械(ブラウザ)ごと。
const SAY_JA_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
const sayLangOf = t => SAY_JA_RE.test(t) ? 'ja-JP' : /[A-Za-z]{2,}/.test(t) ? 'en-US' : 'ja-JP';
const sayPlain = () => { const l = sayPref('aigw-lang'); return l.startsWith('en') ? 'en' : l.startsWith('zh') ? 'zh' : 'ja'; };
const sayKeys = lang => { const x = lang.slice(0, 2); return x === sayPlain() ? ['aigw-speak-rate', 'aigw-speak-voice'] : [`aigw-speak-rate-${x}`, `aigw-speak-voice-${x}`]; };
const sayVoices = lang => speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2)));
// 既定の声: Google の声があればそれ(Windows の Microsoft の声より聞きやすい、2026-11-03 ユーザー)、無ければ端末の既定
function sayBest(lang) {
  const vs = sayVoices(lang), exact = vs.filter(v => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  return exact.find(v => /Google/.test(v.name)) || vs.find(v => /Google/.test(v.name)) || vs.find(v => v.default) || exact[0] || vs[0] || null;
}
function sayUtter(text) {
  const u = new SpeechSynthesisUtterance(text), lang = sayLangOf(text), [rk, vk] = sayKeys(lang);
  u.lang = lang; u.rate = Number(sayPref(rk)) || Number(sayPref('aigw-speak-rate')) || 1;
  const name = sayPref(vk) || sayPref('aigw-speak-voice'), c = name && speechSynthesis.getVoices().find(x => x.voiceURI === name);
  const v = c && c.lang.slice(0, 2).toLowerCase() === lang.slice(0, 2) ? c : sayBest(lang);
  if (v) { u.voice = v; u.lang = v.lang; }
  return u;
}
function sayPopup(btn) {
  document.querySelectorAll('.saypop').forEach(x => x.remove());
  const pop = document.createElement('div'); pop.className = 'saypop';
  for (const [lang, head] of [['ja-JP', '日本語'], ['en-US', '英語']]) {
    const [rk, vk] = sayKeys(lang), rate = Number(sayPref(rk)) || Number(sayPref('aigw-speak-rate')) || 1, cur = sayPref(vk);
    const g = document.createElement('div');
    g.innerHTML = `<div class="sl">${head}</div><label>速さ <select class="r"></select></label><label>声 <select class="v"></select></label>`;
    g.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    const rs = g.querySelector('.r'), vs = g.querySelector('.v');
    for (const r of SAY_RATES) rs.add(new Option('×' + r, String(r), false, r === rate));
    const fill = () => { vs.innerHTML = ''; vs.add(new Option('既定', ''));
      for (const v of sayVoices(lang)) vs.add(new Option(v.name + (v.localService ? '' : ' (オンライン)'), v.voiceURI, false, v.voiceURI === cur)); };
    fill(); speechSynthesis.addEventListener('voiceschanged', fill, { once: true }); // 一部のブラウザは声の一覧をあとから埋める
    const save = () => { try { localStorage.setItem(rk, rs.value); localStorage.setItem(vk, vs.value); } catch {} };
    rs.onchange = vs.onchange = save;
    pop.appendChild(g);
  }
  const b = document.createElement('button'); b.textContent = '試す'; pop.appendChild(b);
  b.onclick = () => { speechSynthesis.cancel(); speechSynthesis.speak(sayUtter('この速さと声で読み上げます。')); speechSynthesis.speak(sayUtter('This is how English will be read.')); };
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.top = Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 8) + 'px'; pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px';
  setTimeout(() => { const close = e => { if (pop.contains(e.target)) return; pop.remove(); document.removeEventListener('pointerdown', close, true); };
    document.addEventListener('pointerdown', close, true); }, 0);
}
// 長押し: 500ms で開き、その押下の終わりのクリック(onclick の読み上げ)は捕捉段階で止める
let sayPressT = null, sayLong = false;
const sayBtnOf = e => e.target.closest && e.target.closest('#sp, .bt .say');
document.addEventListener('pointerdown', e => { const b = sayBtnOf(e); if (!b) return; sayLong = false; clearTimeout(sayPressT); sayPressT = setTimeout(() => { sayLong = true; sayPopup(b); }, 500); });
for (const ty of ['pointerup', 'pointercancel']) document.addEventListener(ty, () => clearTimeout(sayPressT));
document.addEventListener('pointerout', e => { if (sayBtnOf(e)) clearTimeout(sayPressT); });
document.addEventListener('contextmenu', e => { const b = sayBtnOf(e); if (!b) return; e.preventDefault(); clearTimeout(sayPressT); if (!sayLong) sayPopup(b); sayLong = true; });
document.addEventListener('click', e => { if (sayLong && sayBtnOf(e)) { sayLong = false; e.stopPropagation(); e.preventDefault(); } }, true);
const sayClean = t => String(t || '').replace(/\[([^\]\n]+)\]\((?:mail:[0-9a-f]+|https?:\/\/[^\s)]+)(?:\s+(?:mail:[0-9a-f]+|https?:\/\/[^\s)]+))*\)/g, '$1').replace(/https?:\/\/\S+/g, 'リンク').replace(/[*_`#>|]+/g, ' ').replace(/\s+/g, ' ').trim();
const sayDate = t => t.replace(/(\d{1,2})\/(\d{1,2})/, (m, a, b) => `${a}月${b}日`);
function sayText(el) {
  const i = ITEMS[el.dataset.id]; if (!i) return '';
  const due = el.querySelector('.due'), fired = i.wait && i.wait.fired && !i.wait.told;
  return [fired ? '待ちが成立しました。' + sayClean(i.wait.why) : '',
    `${SAY_SRC[i.source] || i.source}、${sayClean(i.from)}から。`, sayClean(i.title) + '。', sayClean(i.summary),
    i.action ? '対応: ' + sayClean(i.action) : '', due ? sayDate(due.textContent.trim()) : ''].filter(Boolean).join('\n');
}
// 長い発話は一部のブラウザで途中で止まる(パソコン約15秒、Android 約4000字)ので、文ごと・200字までに切って続けて出す
function sayChunks(t) {
  const out = [];
  for (let p of t.split(/(?<=[。！？!?\n])/)) { p = p.trim(); while (p.length > 200) { out.push(p.slice(0, 200)); p = p.slice(200); } if (p) out.push(p); }
  return out;
}
function sayMark(el) { document.querySelectorAll('.it.saying').forEach(x => x.classList.remove('saying')); if (el) { el.classList.add('saying'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
function sayUi() {
  const on = sayIdx >= 0;
  document.getElementById('sp').style.display = on ? 'none' : '';
  document.getElementById('spn').style.display = document.getElementById('sps').style.display = on ? '' : 'none';
  document.getElementById('spi').textContent = (on && sayList.length > 1 ? `${sayIdx + 1}/${sayList.length}` : '') + (sayPaused ? ' ⏸ 一時停止中(項目をタップでそこから)' : '');
}
function sayStop() { sayGen++; sayIdx = -1; sayPaused = false; if (SAY_OK) speechSynthesis.cancel(); sayMark(null); sayUi(); }
// 1件を読み、読み終えたら次へ。cancel() は待っていた発話の onend も呼ぶので、世代(sayGen)で古い続きを捨てる
function sayAt(k, from = 0) {
  const g = ++sayGen; speechSynthesis.cancel(); sayPaused = false;
  while (k < sayList.length && !sayList[k].isConnected) k++; // 読んでいる間に既読などへ移したもの
  if (k >= sayList.length) { sayIdx = -1; sayMark(null); sayUi(); return; }
  sayIdx = k; sayMark(sayList[k]); sayUi();
  const cs = sayChunks(sayText(sayList[k])).slice(from);
  cs.forEach((c, j) => { const u = sayUtter(c);
    if (j === cs.length - 1) u.onend = () => { if (g === sayGen) setTimeout(() => { if (g === sayGen) sayAt(k + 1); }, 400); };
    speechSynthesis.speak(u); });
}
function sayAll() {
  sayList = [...document.querySelectorAll('#g-未決 .rows>.it, #g-未読 .rows>.it')];
  if (!sayList.length) { speechSynthesis.cancel(); speechSynthesis.speak(sayUtter('未決と未読はありません')); return; }
  sayAt(0);
}
function sayOne(btn) { sayList = [btn.closest('.it')]; sayAt(0); }
if (SAY_OK) document.getElementById('spbar').style.display = '';
else document.querySelectorAll('.bt .say').forEach(b => b.remove());
// 読み上げ中に項目をタップで一時停止、次のタップでその項目のタップした文から続きを読む(2026-10-26 ユーザー依頼)。
// 一時停止は cancel()(Android の一部のブラウザは pause() を止めとして扱う)。ボタン・リンク・入力欄・文字の選択は除く
const sayKey = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function sayTapped(el, cs, x, y) { // 画面の文字のタップ位置を、各文の頭の文字が画面のどこにあるかと照らして文の番号にする
  let node = null, off = 0;
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
  else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  if (!node || !el.contains(node)) return 0;
  const r = document.createRange(); r.setStart(el, 0); r.setEnd(node, off);
  const at = sayKey(r.toString()).length, shown = sayKey(el.textContent);
  let from = 0, best = 0;
  cs.forEach((c, i) => { const k = sayKey(c).slice(0, 8), p = k ? shown.indexOf(k, from) : -1; if (p < 0) return; from = p + 1; if (p <= at) best = i; });
  return best;
}
document.addEventListener('click', e => {
  if (sayIdx < 0) return;
  const el = e.target.closest && e.target.closest('.it[data-id]');
  if (!el || e.target.closest('a, button, input, textarea, select, summary, label')) return;
  if (String(getSelection() || '').trim()) return;
  if (!sayPaused) { sayGen++; speechSynthesis.cancel(); sayPaused = true; sayUi(); return; }
  let k = sayList.indexOf(el);
  if (k < 0) { const all = [...document.querySelectorAll('#g-未決 .rows>.it, #g-未読 .rows>.it')]; k = all.indexOf(el); sayList = k < 0 ? [el] : all; k = Math.max(k, 0); }
  sayAt(k, sayTapped(el, sayChunks(sayText(el)), e.clientX, e.clientY));
});
