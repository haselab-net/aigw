// 使い方: node ~/digest/item.mjs <item id>
// まとめページの項目を1件出す(「AIで対応」で起動された Claude が最初に読む。~/digest/CLAUDE.md)
import fs from 'fs'; import { threadOf } from './lib.mjs'; import { DATA } from './conf.mjs';
const id = process.argv[2];
const it = JSON.parse(fs.readFileSync(`${DATA}/items.json`, 'utf8')).items.find(x => x.id === id);
if (!it) { console.error('no such item: ' + id); process.exit(1); }
const { session, ...rest } = it;
if (it.source === 'mail') rest.threadId = threadOf(it);
console.log(JSON.stringify(rest, null, 1));
