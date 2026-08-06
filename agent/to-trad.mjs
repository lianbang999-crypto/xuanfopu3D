#!/usr/bin/env node
// 白話簡→繁（全庫統一底本形）
//
// 緣起：白話簡體、引文繁體，兩形硬湊，核驗只能退為寬校（「逐字皆在乾草堆中」），
// 且 Worker 得多背一份簡體歸一串。統一到繁體之後——
//   · 核驗可在同一把尺上嚴格逐字比，真問題（引號內冒充原文）立刻現形
//   · canon.js 可去掉 CITE_S／POS_S_CMP，體積回落
//   · 前臺繁簡仍由用戶一鍵切換（game.js 之 zh() 本就雙向，數據存繁存簡皆可）
//
// 兩條分寸：
//   ① **引號內之直引**按**底本用字**——底本作「眾」不作「衆」、作「然」不作「燃」、
//      作「徧」不作「遍」。直引本就該逐字同底本，此處校正非改義，是歸位。
//   ② 白話正文用通用繁體即可，不必強從底本異體（否則「遍照十方」寫成「徧照」，讀之古怪）。
//
// 用法：node agent/to-trad.mjs [--write]　（不帶 --write 只報告不落盤）

import { readFileSync, writeFileSync } from 'node:fs';

const SHI = '/Users/bincai/Downloads/十法界须弥山世界';
const WRITE = process.argv.includes('--write');

const { ZH_S2T, ZH_T2S } = await import(`${SHI}/src/zh-conv.js`);
const ML = { t: Math.max(...Object.keys(ZH_S2T).map((k) => k.length)), s: Math.max(...Object.keys(ZH_T2S).map((k) => k.length)) };
const conv = (s, d, ml) => {
  let r = '', i = 0;
  while (i < s.length) {
    let h = '';
    for (let L = Math.min(ml, s.length - i); L >= 1; L--) {
      const g = s.substr(i, L);
      if (d[g] !== undefined) { r += d[g]; i += L; h = g; break; }
    }
    if (!h) { r += s[i]; i++; }
  }
  return r;
};

// 輪相名（那謨阿彌陀佛之二字組）恆繁，本已是繁體，轉換時佔位保護免被詞組表誤動
const SENT = '';
const mask = (x) => { const box = []; return [String(x).replace(/[那謨阿彌陀佛]{2}/g, (m) => { box.push(m); return SENT + (box.length - 1) + SENT; }), box]; };
const unmask = (x, box) => x.replace(new RegExp(SENT + '(\\d+)' + SENT, 'g'), (_, i) => box[+i]);

// 通用表誤轉：佛典用字與現代漢語有別
const FIX = [
  [/慾/g, '欲'],     // 五欲、貪欲——佛典作「欲」，通用表之「貪慾」非是
  [/儘/g, '盡'],     // 盡想（十想之一）、盡淨——非「儘管」之儘
  [/彌彌/g, '彌彌'], // 通用表有「弥弥」→「瀰瀰」（水盛貌），輪相名不可轉
  [/瀰/g, '彌'],
];
function s2t(x) {
  const [m, box] = mask(x);
  let r = conv(m, ZH_S2T, ML.t);
  for (const [re, to] of FIX) r = r.replace(re, to);
  return unmask(r, box);
}

// 底本用字：直引歸位之所依（統計自繁体版六卷，右者底本 0 例）
const CANON_GLYPH = [['衆', '眾'], ['燃', '然'], ['遍', '徧'], ['琉', '璢'], ['廻', '迴'], ['回', '迴']];

const ORIG = [1, 2, 3, 4, 5, 6].map((i) => readFileSync(new URL(`../繁体版/B0136_00${i}.txt`, import.meta.url), 'utf8')).join('\n');
const bare = (t) => String(t).replace(/[\s\[\]A-Za-z0-9。，、；：？！「」『』（）()…—·]/g, '');
const OB = bare(ORIG);

/** 直引歸位：轉繁後若底本無之，試以底本異體替換再尋；仍無者原樣返回並記錄 */
function alignQuote(q) {
  if (OB.includes(bare(q))) return { text: q, ok: true };
  // 逐一試底本異體（可疊加）
  let cur = q;
  for (const [from, to] of CANON_GLYPH) {
    if (!cur.includes(from)) continue;
    const cand = cur.replaceAll(from, to);
    if (OB.includes(bare(cand))) return { text: cand, ok: true, fixed: `${from}→${to}` };
    cur = cand;
  }
  return { text: q, ok: OB.includes(bare(cur)), unresolved: true };
}

// 鍵是譜曰原文，一字不可動——動則白話與承注庫脫鉤。
// 故不以正則掃全文（兩檔格式不一，且鍵值同為雙引號串，難保不誤傷），
// 而是 import 讀入物件、只轉值、保留原檔頭注釋重寫：鍵根本不經手。
const FILES = [
  { f: 'src/sfp-why-plain.js', name: 'SFP_WHY_PLAIN', inline: true },
  { f: 'src/sfp-why-plain-cz.js', name: 'SFP_WHY_PLAIN_CZ', inline: false },
];
// 位義白話（220 位「這是什麼位」）另一體例：鍵為位名、單引號、且夾大量校對史注釋。
// 注釋有存留之值，故不重寫全檔，只按行替換值串。
const LINE_FILES = [{ f: 'src/sfp-pos-plain.js', name: 'SFP_POS_PLAIN' }];
const stat = { n: 0, quotes: 0, qok: 0, qfix: 0, qbad: [] };

for (const { f, name, inline } of FILES) {
  const path = `${SHI}/${f}`;
  const src = readFileSync(path, 'utf8');
  const mod = await import(path);
  const obj = mod[name];
  if (!obj) { console.error(`✗ ${f} 無 ${name}`); continue; }

  const head = src.slice(0, src.indexOf(`export const ${name}`));
  const lines = [head + `export const ${name} = {`];
  for (const [k, v] of Object.entries(obj)) {
    stat.n++;
    let t = s2t(v);
    t = t.replace(/[「『]([^」』]{4,})[」』]/g, (mm, inner) => {
      if (/^[那謨阿彌陀佛]{2,4}$/.test(inner)) return mm;
      stat.quotes++;
      const r = alignQuote(inner);
      if (r.ok) { stat.qok++; if (r.fixed) stat.qfix++; }
      else if (stat.qbad.length < 40) stat.qbad.push(inner);
      return mm[0] + r.text + mm[mm.length - 1];
    });
    lines.push(inline
      ? `  ${JSON.stringify(k)}: ${JSON.stringify(t)},`
      : `  ${JSON.stringify(k)}:\n    ${JSON.stringify(t)},`);
  }
  lines.push('};\n');
  const out = lines.join('\n');

  // 落盤前斷言：鍵集合分毫不變
  if (WRITE) {
    writeFileSync(path, out);
    const after = (await import(`${path}?v=${Date.now()}`))[name];
    const a = Object.keys(obj), b = Object.keys(after);
    if (a.length !== b.length || a.some((k, i) => k !== b[i])) {
      console.error(`✗ ${f} 鍵集合變動——已回寫原檔`);
      writeFileSync(path, src);
      process.exit(1);
    }
    console.log(`✓ ${f}　${a.length} 條，鍵集合不變`);
  }
}

for (const { f, name } of LINE_FILES) {
  const path = `${SHI}/${f}`;
  const src = readFileSync(path, 'utf8');
  const before = (await import(path))[name];
  const out = src.replace(/^(\s*)'([^']*)':\s*'((?:[^'\\]|\\.)*)'/gm, (whole, pad, k, v) => {
    if (!/[一-鿿]/.test(v)) return whole;
    stat.n++;
    let t = s2t(v.replace(/\\'/g, "'"));
    t = t.replace(/[「『]([^」』]{4,})[」』]/g, (mm, inner) => {
      if (/^[那謨阿彌陀佛]{2,4}$/.test(inner)) return mm;
      stat.quotes++;
      const r = alignQuote(inner);
      if (r.ok) { stat.qok++; if (r.fixed) stat.qfix++; }
      else if (stat.qbad.length < 40) stat.qbad.push(inner);
      return mm[0] + r.text + mm[mm.length - 1];
    });
    return `${pad}'${k}': '${t.replace(/'/g, "\\'")}'`;
  });
  if (WRITE) {
    writeFileSync(path, out);
    const after = (await import(`${path}?v=${Date.now()}`))[name];
    const a = Object.keys(before), b = Object.keys(after);
    if (a.length !== b.length || a.some((k, i) => k !== b[i])) {
      console.error(`✗ ${f} 鍵集合變動——已回寫原檔`); writeFileSync(path, src); process.exit(1);
    }
    console.log(`✓ ${f}　${a.length} 條，鍵集合不變`);
  }
}

console.log(`白話字串 ${stat.n} 條${WRITE ? '（已落盤）' : '（試轉，未落盤）'}`);
console.log(`直引 ${stat.quotes} 處：底本可尋 ${stat.qok}（其中經異體歸位 ${stat.qfix}）　仍不可尋 ${stat.quotes - stat.qok}`);
if (stat.qbad.length) {
  console.log('\n仍不可尋者（須人工核：或係引他經，或係改寫而仍用引號）：');
  stat.qbad.forEach((q, i) => console.log(`  ${i + 1}. 「${q}」`));
}
