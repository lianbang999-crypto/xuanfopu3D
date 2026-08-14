#!/usr/bin/env node
// 外典補充語料生成器（2026-08-14 發起人定：蕅益大師論著入問譜知識庫）
//
// 取哪幾部，設計書 §三之二（2026-08-01）早有其位，此處只是兌現：
//   《教觀綱宗》T46n1939 —— 譜之教理底座（門十至十三藏通別圓位次即出其綱）
//   《彌陀要解》T37n1762 —— 門十四淨土橫超之底座（信願行・九品・四土）
//   《靈峰宗論》J36nB348 107 萬字，設計書判「全系統唯一真需向量檢索者」——本輪不整部入庫；
//     唯〈閱藏知津自序〉棋喻一段（「善奕者著著皆活」）大師親口以棋喻法，設計書云
//     「此語宜置於顯處」，故逐字取此一段入庫，餘俟向量層另期。
//
// 底本取徑與《選佛譜》同源：CBETA XML-P5（scripts/cbeta-fetch.mjs，逐字帶行號，緩存後離線可重跑）。
// 斷塊為機切（260–420 字依句斷），非人工分塊——故塊型獨立作 shizhu（大師他著），
// 檢索權重低於譜內人工塊，呈現時 ref 帶書名與「大師他著」之標（紀律三：分級標示不混同）。
//
// 用法：node agent/gen-aux-corpus.mjs　→ agent/index/aux-corpus.json，再跑 gen-corpus.mjs 併入 corpus.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getXml, flatten } from '../scripts/cbeta-fetch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const WORKS = [
  { cb: 'T46n1939', src: '教觀綱宗' },
  { cb: 'T37n1762', src: '彌陀要解' },
];

// 依句號斷開、聚為約 300–420 字一塊：太碎則命中即殘句，太長則長塊恆勝（見 search.js 頭注）。
// 塊首行號即塊之 CBETA 出處（頁·欄·行），與本項目引文體例同。
function chunk(flat, work) {
  const raw = [];
  let buf = '', startRef = '';
  for (let i = 0; i < flat.text.length; i++) {
    if (!buf) startRef = flat.refs[i] || '';
    const ch = flat.text[i];
    buf += ch;
    if (buf.length >= 300 && '。？！'.includes(ch)) { raw.push({ t: buf, ref: startRef }); buf = ''; }
  }
  if (buf.trim()) {
    if (buf.length < 60 && raw.length) raw[raw.length - 1].t += buf;   // 殘尾併入前塊，不出孤句塊
    else raw.push({ t: buf, ref: startRef });
  }
  return raw.map((b, n) => ({
    id: `${work.cb}-${String(n + 1).padStart(3, '0')}`,
    src: work.src,
    cb: `${work.cb}_p${b.ref}`,
    i: b.t.slice(0, 16),          // 機切塊無人工提要，以句首字面代——檢索主靠正文與 bigram
    t: b.t,
  }));
}

// 宗論棋喻：逐字定位取段，取不著寧缺（不得憑記憶寫經文）
async function zonglunQiyu() {
  try {
    const flat = flatten('J36nB348', await getXml('J36nB348'));
    for (const probe of ['善奕者著著皆活', '善弈者著著皆活']) {
      const at = flat.text.indexOf(probe);
      if (at < 0) continue;
      const sp = flat.text.lastIndexOf('禪宗有三藏', at);
      const from = sp >= 0 && at - sp < 200 ? sp : Math.max(0, flat.text.lastIndexOf('。', at - 1) + 1);
      const endMark = flat.text.indexOf('皆死。', at);
      const to = endMark > 0 ? endMark + 3 : at + probe.length;
      return [{
        id: 'J36nB348-qiyu', src: '靈峰宗論',
        cb: `J36nB348_p${flat.refs[at] || ''}`,
        i: '閱藏知津自序 · 以棋喻法',
        t: flat.text.slice(from, to),
      }];
    }
    console.log('  宗論棋喻：底本中未檢得「善奕者著著皆活」——本塊暫缺，不編造');
  } catch (e) { console.log(`  宗論棋喻取用未成（${e.message}）——先出二部，此塊後補`); }
  return [];
}

const blocks = [];
for (const w of WORKS) {
  const flat = flatten(w.cb, await getXml(w.cb));
  const bs = chunk(flat, w);
  console.log(`  《${w.src}》${w.cb}　正文 ${flat.text.length} 字 → ${bs.length} 塊`);
  blocks.push(...bs);
}
blocks.push(...await zonglunQiyu());

mkdirSync(join(HERE, 'index'), { recursive: true });
const file = join(HERE, 'index/aux-corpus.json');
writeFileSync(file, JSON.stringify({
  builtAt: new Date().toISOString().slice(0, 10),
  note: '外典補充：蕅益大師論著（CBETA 底本機切斷塊）——塊型 shizhu，標「大師他著」，不與譜文混同',
  blocks,
}, null, 1));
console.log(`已生成 ${file}　共 ${blocks.length} 塊 · ${blocks.reduce((a, b) => a + b.t.length, 0)} 字`);
