// 使い方: node ~/digest/add.mjs new_items.json ["チェックのメモ"]
// new_items.json = [{id, source:"mail" か拡張の読む先の名前, time:"2026-10-09T09:00", from, title, summary, action, status, link, due?:"2026-10-30" か "2026-10-30T17:00", refs?:["mail:<threadId>", "<拡張の読む先の URL>"]}]
// refs はまとめ項目が含む元のメッセージ。既決にすると done-sync がメールはアーカイブ、拡張の読む先は既読にする
// 同じ id があれば、本人が画面で変えた status は保ったまま内容だけ更新する
import fs from 'fs'; import os from 'os'; import { execFileSync } from 'child_process'; import { threadOf } from './lib.mjs'; import { DATA, CODE } from './conf.mjs'; import { byName, sourceOfRef, goodLink } from './ext.mjs';
const DB = `${DATA}/items.json`;
const add = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// まとめ項目(id が misc:…)の要約の [表示](mail:<threadId> …) / [表示](<拡張の refRe に当たる URL>) は refs にも入れる(既決で片付くように。refRe の無い読む先は入れない)
for (const it of add) if (/^misc:/.test(it.id || '')) for (const m of String(it.summary || '').matchAll(/\]\(((?:mail:[0-9a-f]+|https?:\/\/[^\s)]+)(?:\s+(?:mail:[0-9a-f]+|https?:\/\/[^\s)]+))*)\)/g))
  for (const r of m[1].split(/\s+/)) if ((/^mail:/.test(r) || sourceOfRef(r)) && !(it.refs ||= []).includes(r)) it.refs.push(r);
// refs の元の一覧(ページの「元のメッセージ」、2026-11-05 ユーザー依頼)。
// refInfo = {ref: {label, time, url, mobile?}}。メールは ref-info.py が Gmail から差出人・件名を取る。ほかは定期チェックが refInfo を渡す(無ければ URL だけ出る)
// Gmail に聞くのに数秒かかるので、items.json を読む前に済ませる(その間にページで変えた状態を上書きしない)
let refGot = {};
try {
  const pre = (() => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')).items; } catch { return []; } })();
  const miss = [...pre.filter(i => i.refs && i.status !== '既決'), ...add].flatMap(i => (i.refs || []).filter(r => /^mail:[0-9a-f]+$/.test(r) && !(i.refInfo || {})[r]).map(r => r.slice(5)));
  if (miss.length) refGot = JSON.parse(execFileSync(`${CODE}/ref-info.py`, [...new Set(miss)], { encoding: 'utf8', timeout: 120e3 }));
} catch (e) { console.error('WARN ref-info:', e.message.split('\n')[0]); }
// 同じ話のメールは1つの項目に(2026-11-10 ユーザー依頼)。Gmail は In-Reply-To の無い返信(一部の会社のサポートなど)を
// 別スレッドにするので、新しいスレッドの件名が Re:/Fwd: 付きで、Re: を除いた件名と本人以外の差出人が前の項目と同じなら、前の項目の id で出し直す
// (下の「開き直す」と同じ扱いになり、前の Claude セッションが続きを受ける。autostart.mjs)。mkey = 項目のスレッドの {subj, addrs}(ref-info.py --keys)を覚えておく
const MAIL_ID = /^mail:[0-9a-f]{16}$/, mkeyOf = {};
try {
  const pre = (() => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')).items; } catch { return []; } })();
  const known = new Set(pre.map(i => i.id)), since = new Date(Date.now() - 120 * 86400e3).toISOString().slice(0, 10);
  const ask = [...add.filter(i => MAIL_ID.test(i.id || '') && !known.has(i.id)).map(i => i.id.slice(5)),
    ...pre.filter(i => i.source === 'mail' && !i.mkey && threadOf(i) && (i.time || '') >= since).map(threadOf)];
  if (ask.length) Object.assign(mkeyOf, JSON.parse(execFileSync(`${CODE}/ref-info.py`, ['--keys', ...new Set(ask)], { encoding: 'utf8', timeout: 300e3 })));
} catch (e) { console.error('WARN ref-info --keys:', e.message.split('\n')[0]); }
let d; try { d = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { d = { items: [], runs: [] }; }
let n = 0;
for (const i of d.items) if (i.source === 'mail' && !i.mkey && mkeyOf[threadOf(i)]) { const { reply, ...k } = mkeyOf[threadOf(i)]; i.mkey = k; }
const sameTalk = k => d.items.filter(o => o.source === 'mail' && !/^misc:/.test(o.id) && o.mkey && o.mkey.subj === k.subj && o.mkey.addrs.some(a => k.addrs.includes(a)))
  .sort((a, b) => (b.time || '').localeCompare(a.time || ''))[0];
for (const it of add) {
  const k = MAIL_ID.test(it.id || '') && !d.items.some(x => x.id === it.id) && mkeyOf[it.id.slice(5)];
  if (k) {
    const { reply, ...key } = k, prev = reply && key.subj.length >= 8 && key.addrs.length ? sameTalk(key) : null;
    it.mkey = key;
    if (prev) {
      const tid = it.id.slice(5);
      it.refs = [...new Set([...(prev.refs || []), ...(it.refs || []), 'mail:' + threadOf(prev)])].filter(r => r !== 'mail:' + tid);
      console.error(`SAME-TALK ${it.id} → ${prev.id}(同じ件名・相手の前の項目にまとめる)`);
      Object.assign(it, { id: prev.id, threadId: tid });
    }
  }
  // 既決の片付け(done-sync)は link の元を既読にするので、拡張の読む先(urlRe のあるもの)の個別項目には元の URL が要る(まとめ項目 misc は除く)
  if (byName[it.source] && byName[it.source].urlRe && !/misc/.test(it.id) && !goodLink(it.link))
    console.error(`WARN ${it.id}: link が無い。既決にしても ${it.source} 側は既読にならない(メッセージの URL を入れる)`);
  const old = d.items.find(x => x.id === it.id);
  // 対応不要のまとめ(id misc:noaction、2026-10-14 ユーザー依頼): 巡回ごとに項目を立てず、1つの項目に行を足す。
  // まだ見ていなければ(既決でなければ)前の行の上に足し、既決にした後なら新しい行だけで未読に戻す
  if (it.id === 'misc:noaction') {
    if (old && old.status !== '既決') { old.refInfo = { ...(old.refInfo || {}), ...(it.refInfo || {}) }; old.summary = [...new Set((it.summary + '\n' + (old.summary || '')).split('\n'))].slice(0, 80).join('\n'); old.time = it.time; old.title = it.title; old.refs = [...new Set([...(old.refs || []), ...(it.refs || [])])]; }
    else if (old) { const refs = old.synced ? it.refs : [...new Set([...(old.refs || []), ...(it.refs || [])])]; const refInfo = old.synced ? (it.refInfo || {}) : { ...(old.refInfo || {}), ...(it.refInfo || {}) }; Object.assign(old, it, { status: '未読', byUser: false, session: undefined, refs, refInfo }); delete old.synced; n++; }
    else { d.items.push({ ...it, status: '未読' }); n++; }
    continue;
  }
  // 既決の後に同じスレッドへ返信が来たら(time が新しくなったら)、既決のままにせず開き直す。session は残して「続きから」で前の経緯を引き継ぐ(2026-10-14 ユーザー指摘)
  if (old && old.status === '既決' && it.time && it.time > (old.time || '')) {
    Object.assign(old, it, { status: it.status || '未決', byUser: false, reopened: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16) }); delete old.synced; n++;
    console.error(`REOPEN ${it.id}: 既決の後に新着(${it.time})`);
  } else if (old) { const keep = old.byUser ? old.status : (it.status || old.status); Object.assign(old, it, { status: keep, byUser: old.byUser }); }
  else { d.items.push({ status: '未読', ...it }); n++; }
}
for (const i of d.items) if (i.refs && i.status !== '既決') for (const r of i.refs) if (refGot[r] && !(i.refInfo || {})[r]) (i.refInfo ??= {})[r] = refGot[r];
const jst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
d.runs.push({ at: jst, added: n, note: process.argv[3] || '' }); d.runs = d.runs.slice(-200);
fs.writeFileSync(DB + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(DB + '.tmp', DB);
console.log(`added ${n}, total ${d.items.length}`);
