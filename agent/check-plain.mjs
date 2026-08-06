#!/usr/bin/env node
// 白話校驗器 —— 以承注庫所繫之譜曰原文為尺，校未審之舊白話（SFP_WHY_PLAIN）
//
// 要點：白話是**逐句**的（鍵＝譜曰原文句），一句往往覆蓋數格（「那那等三」一句管三格）。
// 故須按句校，不可按格校——按格校則概括句必大量誤報。
//
// 逐句可機校者五項（皆為「白話與其所譯之原文句」之對照）：
//   ① 專名核：白話所稱位名，須原文句中亦有（或其別名）——防憑空添位
//   ② 輪相核：白話所稱輪相，須原文句中亦有——防張冠李戴
//   ③ 數量核：原文「等三」白話不得作「等五」
//   ④ 行否核：以**格之判定**為準（非原文字面）——諸格皆不行而白話不言不行者報，
//      諸格皆行而白話言不行者報。譜曰多為位義句，未必逐句明言行否，白話據判定補出，正是其用。
//   ⑤ 繁簡核：白話當為簡體，不得整句照抄原文（前案「照抄檢測」之意）
//   ⑥ 跨位核：一句若為數位所共用（承注所繫），白話不得獨稱其中一位——
//      如 R4-02 承注及東洲，白話若曰「西牛貨洲…進東勝神洲」，東洲用之即誤。
//      此為 2026-08-02 手校 118 條時所見之要害，凡三處（西洲／師子奮迅／十向）。
//
// 用法：node agent/check-plain.mjs [--all]

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHI = '/Users/bincai/Downloads/十法界须弥山世界';
const hub = JSON.parse(readFileSync(join(HERE, 'index/hub.json'), 'utf8'));
const showAll = process.argv.includes('--all');

const { SFP_WHY_PLAIN: OLD } = await import(join(SHI, 'src/sfp-why-plain.js'));
const { SFP_WHY_PLAIN_CZ: CZ } = await import(join(SHI, 'src/sfp-why-plain-cz.js')).catch(() => ({ SFP_WHY_PLAIN_CZ: {} }));
const onlyNew = process.argv.includes('--new');            // 只校新譯之 118 條
const SFP_WHY_PLAIN = onlyNew ? CZ : { ...OLD, ...CZ };
const { ZH_T2S } = await import(join(SHI, 'src/zh-conv.js'));

// 繁→簡（依專案 OpenCC 裁剪字典，最長匹配）
const MAXLEN = Math.max(...Object.keys(ZH_T2S).map((k) => k.length));
function t2s(s) {
  let r = '', i = 0;
  while (i < s.length) {
    let hit = '';
    for (let L = Math.min(MAXLEN, s.length - i); L >= 1; L--) {
      const seg = s.substr(i, L);
      if (ZH_T2S[seg] !== undefined) { r += ZH_T2S[seg]; i += L; hit = seg; break; }
    }
    if (!hit) { r += s[i]; i++; }
  }
  return r;
}

const NAMES = [...new Set(Object.values(hub.positions).map((p) => p.name))].sort((a, b) => b.length - a.length);
const ALIAS = JSON.parse(readFileSync(join(HERE, '../xuanfopu-h5/data/aliases.json'), 'utf8')).aliases;
const aliasOf = {};                       // 位名 → 其一切別名（簡體）
for (const [a, v] of Object.entries(ALIAS)) {
  const p = hub.positions[v.id]; if (!p) continue;
  (aliasOf[p.name] ||= new Set()).add(t2s(a));
}
const COMBOS = Object.keys(hub.positions['g01-01'].cells);
const NUM = { 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

// 承注庫所繫：原文句 → 覆蓋哪些格（連同各格之去向、輪相、本位、引文所出位）
const useOf = new Map();
for (const p of Object.values(hub.positions)) {
  for (const [c, cl] of Object.entries(p.cells)) {
    if (!cl.白話) continue;
    if (!useOf.has(cl.答)) useOf.set(cl.答, { cells: [], combos: new Set(), dests: new Set(), homes: new Set() });
    const u = useOf.get(cl.答);
    u.cells.push(`${p.name}|${c}`);
    (u.selves ||= new Set()).add(p.name);
    u.combos.add(c);
    u.homes.add(p.name);
    if (cl.to) u.dests.add(hub.positions[cl.to].name);
    (u.verdicts ||= new Set()).add(cl.verdict);
    (cl.引 || []).forEach((x) => { if (x.name) u.homes.add(x.name); });
  }
}

const bad = { 專名: [], 輪相: [], 數量: [], 行否: [], 繁簡: [], 跨位: [] };
let checked = 0;

for (const src of useOf.keys()) {
  const plain = SFP_WHY_PLAIN[src];
  if (!plain) continue;
  checked++;
  const S = t2s(src), Pn = String(plain);
  const u = useOf.get(src);
  const cells = u.cells;
  const row = (why) => ({ src, plain, why, n: cells.length, at: cells.slice(0, 3).join('、') });

  // ① 專名核：白話展簡稱為全名，是正譯；但所展之位名須為本句諸格之去向、或本位、或引文所出位。
  //    憑空指向他位者，即誤導用戶——此為要害。
  const allowed = new Set();
  [...u.dests, ...u.homes].forEach((n) => { allowed.add(t2s(n)); (aliasOf[n] || []).forEach((a) => allowed.add(a)); });
  const inPlain = NAMES.filter((n) => n.length >= 3 && Pn.includes(t2s(n)));
  const extra = inPlain.filter((n) => {
    if (allowed.has(t2s(n))) return false;
    if (S.includes(t2s(n))) return false;                       // 原文本有者不論
    // 原文多用簡稱（「無財」「中畜」「畜脩」），白話展為全名是正譯——去趣類後綴再比
    const stem = t2s(n).replace(/(鬼|天|位|生|洲|王|地|土|观|心|戒|禅|忏|羅|罗|果|土)+$/u, '');
    if (stem.length >= 2 && S.includes(stem)) return false;
    // 原文亦有省前綴者（「寂光」之於「常寂光淨土」）——取末三字再比
    const tail = t2s(n).replace(/(淨土|净土|位|天)$/u, '').slice(-2);
    if (tail.length === 2 && S.includes(tail) && t2s(n).length > 4) return false;
    for (const a of aliasOf[n] || []) if (S.includes(a) || allowed.has(a)) return false;
    // 被更長之合法位名所含者（如「初果」含於「初果須陀洹」）不報
    for (const a of allowed) if (a.includes(t2s(n))) return false;
    return true;
  });
  if (extra.length) bad.專名.push(row(`白話指向本句諸格所無之位「${extra.join('、')}」（本句諸格實往：${[...u.dests].join('、') || '不行'}）`));

  // ② 輪相核：白話展「等N」為逐相，是正譯；但所展之輪相須在本句所覆蓋之格內。
  //    以「」引號括者方計，免「彌陀佛力」誤配「陀佛」。
  const quoted = [...Pn.matchAll(/[「『]([那謨阿彌陀佛]{2})[」』]/g)].map((m) => m[1]);
  const sameHome = new Set();
  for (const cellKey of cells) { const hp = Object.values(hub.positions).find((z) => z.name === cellKey.split('|')[0]); if (hp) Object.keys(hp.cells).forEach((x) => sameHome.add(x)); }
  // 承上文而及同位他相者（如「自阿阿登已辦地後從此增進」）不報
  const cExtra = [...new Set(quoted)].filter((x) => !u.combos.has(x) && !src.includes(x) && !sameHome.has(x));
  if (cExtra.length) bad.輪相.push(row(`白話稱輪相「${cExtra.join('、')}」，本句實覆蓋「${[...u.combos].join('、')}」`));

  // ⑥ 跨位核：本句若通數位，白話獨稱其一即誤導他位之用戶
  if (u.selves.size > 1) {
    const solo = [...u.selves].filter((n) => {
      const sn = t2s(n);
      if (!Pn.includes(sn)) return false;
      if (S.includes(sn)) return false;
      const stem = sn.replace(/(天|位|地|土|心|住|行|果)$/u, '');   // 原文多用簡稱
      if (stem.length >= 2 && S.includes(stem)) return false;
      if (new RegExp(`(自|從|由)${sn}(起|以上|已上|而上)`).test(Pn)) return false;  // 範圍起點，非獨稱
      return true;
    });
    if (solo.length && solo.length < u.selves.size) {
      bad.跨位.push(row(`本句通 ${u.selves.size} 位而白話獨稱「${solo.join('、')}」（通：${[...u.selves].slice(0, 4).join('、')}${u.selves.size > 4 ? '…' : ''}）`));
    }
  }

  // ③ 數量核
  const ms = [...src.matchAll(/等([二三四五六七八九十])/g)].map((m) => NUM[m[1]]);
  const mp = [...Pn.matchAll(/等([二三四五六七八九十])/g)].map((m) => NUM[m[1]]);
  if (ms.length && mp.length && ms[0] !== mp[0]) bad.數量.push(row(`原文「等${Object.keys(NUM)[ms[0] - 2]}」白話作「等${Object.keys(NUM)[mp[0] - 2]}」`));

  // ④ 行否核
  const isTerminal = [...u.verdicts].every((v) => v === '無行法');   // 終局：本無行法，非此路不通
  const allUnfit = !isTerminal && [...u.verdicts].every((v) => v === '不行');
  const allFit = [...u.verdicts].every((v) => v === '行');
  const pUnfit = /不行(?![大小之])|不复行|不再行|皆不行|都不行|一概不行|皆不|俱不/.test(Pn.replace(/不能行[大小]/g, ''));
  if (isTerminal && !/無行法|本不列行法|更無所往/.test(Pn)) bad.行否.push(row('本句諸格判「無行法」，白話當明其為終局而非不通'));
  if (allUnfit && !pUnfit) bad.行否.push(row('本句諸格皆判不行，而白話未言不行'));
  if (allFit && pUnfit) bad.行否.push(row('本句諸格皆判行，而白話言不行'));

  // ⑤ 繁簡核：白話當為簡體；與原文去標點後全同即是照抄
  const bare = (t) => t.replace(/[\s。，、；：？！「」『』（）()【】\[\]．·—\-…]/g, '');
  if (bare(Pn) === bare(src)) bad.繁簡.push(row('白話與原文全同（照抄未譯）'));
  else {
    // 輪相名（那謨阿彌陀佛之二字組）為專名，保留繁體是體例；餘處不當有繁體
    // 「乾慧地」之「乾」為術語正字（簡體亦作乾慧，非干慧）；引號內引譜注原文者亦保繁
    const stripCombo = Pn.replace(/[「『][^」』]{1,12}[」』]/g, '').replace(/[那謨阿彌陀佛]/g, '').replace(/乾/g, '');   // 六輪相字本身即專名
    if (t2s(stripCombo) !== stripCombo) {
      const diff = [...stripCombo].filter((ch, i) => t2s(ch) !== ch).slice(0, 6).join('');
      bad.繁簡.push(row(`白話含未轉之繁體字「${diff}」`));
    }
  }
}

console.log(`\n白話校驗（按句）：承注庫所繫且有白話之原文句 ${checked} 條\n`);
let total = 0;
for (const [name, list] of Object.entries(bad)) {
  total += list.length;
  console.log(`【${name}核】可疑 ${list.length} 條`);
  (showAll ? list : list.slice(0, 6)).forEach((x) => {
    console.log(`  ${x.why}　（涉 ${x.n} 格：${x.at}${x.n > 3 ? '…' : ''}）`);
    console.log(`    原文：${x.src.slice(0, 54)}`);
    console.log(`    白話：${x.plain.slice(0, 54)}`);
  });
  if (!showAll && list.length > 6) console.log(`  …另 ${list.length - 6} 條（--all 全列）`);
  console.log();
}
console.log(`合計可疑 ${total} 條（占 ${(100 * total / Math.max(checked, 1)).toFixed(1)}%）`);
