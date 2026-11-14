// 「AIで対応」のセッションが自分で項目を既決にしたとき、返答を終えたところでそのセッションを止めてアーカイブする(2026-10-21 ユーザー依頼)。
// 待ちを付けたときも同じく止めてアーカイブする(2026-10-25 ユーザー依頼。成立したら「AIで続きから」で同じ会話を再開する)。
// ページから既決にしたときは client.js が aigw API の stop・archive を叩くが、箱の中からは aigw のログインもパスキーも無いので、こちらは
//   アーカイブ: ~/.aigw/<自分の aigw id>/archive-on-exit に空のファイルを置く。aigw が終了を記録するときにアーカイブして印を消す(サーバー文書 the deployment notes)。
//               meta.json は aigw が書くので触らない(最初は直接書く作りだったが、root 側が印の口を足した)
//   止める  : Claude Code に SIGINT を送る(aigw の停止と同じく Claude が会話のログを書き終えて自分で終わる。灰色のドットになり、続きから再開できる)
// 返答の途中で止めないよう、Claude Code の Stop フック(~/digest/.claude/settings.json)が返答の終わりに run を起こす。
//   request <item id>  set-status.mjs が既決にしたとき・wait.mjs set が待ちを付けたときに呼ぶ。今のセッションがその項目の会話なら、終了の依頼を置く
//   hook               Stop フック。依頼があれば run を切り離して起動する(フックが返ってから止めるため)
//   run <依頼ファイル> items.json の session に deleted・archived を付け(ページが二度片付けない・続きからが replace_session になる)、印を置いて止める
import fs from 'fs'; import os from 'os'; import { spawn } from 'child_process';
import { DATA } from './conf.mjs';
const HOME = os.homedir(), DIR = `${DATA}/end-requests`, DB = `${DATA}/items.json`, LOG = `${DATA}/session-end.log`;
const log = m => fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);
const load = () => { if (!fs.existsSync(DB)) return { items: [], runs: [] }; return JSON.parse(fs.readFileSync(DB, 'utf8')); }; // 初めての箱では items.json がまだ無い
const sleep = ms => new Promise(r => setTimeout(r, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'request') {
  const csid = process.env.CLAUDE_CODE_SESSION_ID, pid = Number(process.env.CLAUDE_PID);
  const it = load().items.find(x => x.id === arg);
  // 定期チェックやほかの作業フォルダの Claude、ターミナルから set-status したときは何もしない
  // aigw の id は今のセッションのもの(灰色のドットから続きで開くと id が変わり、items.json は古い id のまま)
  const aigw = /\/\.aigw\/([\w-]+)\/outbox$/.exec(process.env.AIGW_OUTBOX || '')?.[1];
  if (!csid || !pid || !aigw || !it || !it.session || it.session.claude_session_id !== csid) process.exit(0);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(`${DIR}/${csid}.json`, JSON.stringify({ item: arg, csid, pid, aigw, at: new Date().toISOString() }));
  console.log('このセッションは返答を終えたあと停止・アーカイブします(続きはまとめページの「AIで続きから」)');
}
else if (cmd === 'hook') {
  let input = ''; for await (const c of process.stdin) input += c;
  const csid = (() => { try { return JSON.parse(input).session_id; } catch { return ''; } })();
  const f = `${DIR}/${csid}.json`;
  if (csid && fs.existsSync(f)) spawn(process.execPath, [process.argv[1], 'run', f], { detached: true, stdio: 'ignore' }).unref();
}
else if (cmd === 'run') {
  const req = JSON.parse(fs.readFileSync(arg, 'utf8')); fs.unlinkSync(arg);
  const d = load(), it = d.items.find(x => x.id === req.item);
  // 返答を待つあいだに本人が既決を外した・待ちを外したら止めない
  if (!it || !(it.status === '既決' || (it.wait && !it.wait.fired))) { log(`${req.item}: 既決でも待ちでもなくなったので止めない`); process.exit(0); }
  // pid の使い回しに備えて、その pid が同じ会話の claude かを確かめる
  // ps -o args= はフックが受け継いだ COLUMNS の幅で切るので、末尾の --resume <会話id> が落ちる。/proc の cmdline を読む
  let args = ''; try { args = fs.readFileSync(`/proc/${req.pid}/cmdline`, 'utf8').split('\0').join(' '); } catch {}
  if (!/claude/.test(args) || !args.includes(req.csid)) { log(`${req.item}: pid ${req.pid} が会話 ${req.csid} の claude ではない`); process.exit(0); }
  const dir = `${HOME}/.aigw/${req.aigw}`;
  if (!fs.existsSync(`${dir}/meta.json`)) { log(`${req.item}: ${dir} が aigw のセッションではない`); process.exit(0); }
  // Claude と一緒にこのプロセスも終わることがあるので、書くものは止める前に全部書く
  it.session = { ...it.session, id: req.aigw, deleted: new Date().toISOString(), archived: true };
  fs.writeFileSync(DB + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(DB + '.tmp', DB);
  fs.writeFileSync(`${dir}/archive-on-exit`, '');
  log(`${req.item}: aigw ${req.aigw} に archive-on-exit を置いて pid ${req.pid} を止める`);
  await sleep(2000);
  for (let k = 0; k < 2 && alive(req.pid); k++) { process.kill(req.pid, 'SIGINT'); for (let i = 0; i < 20 && alive(req.pid); i++) await sleep(500); }
  if (alive(req.pid)) { log(`${req.item}: SIGINT で終わらないので SIGTERM`); process.kill(req.pid, 'SIGTERM'); }
}
else { console.error('usage: session-end.mjs request <item id> | hook | run <file>'); process.exit(2); }
