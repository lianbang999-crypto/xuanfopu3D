#!/usr/bin/env node
// 承注展開器 —— 把人工核定的「繼承指令規則表」機械展開為逐格緣由，並反向校驗規則。
//
// 立此器之意：人工核定的是規則（一門十餘條，條條繫原文行號），展開是機械動作。
// 人去手抄 1092 格反而易錯；而機械展開可復算、可回查、可隨規則修訂即時重算。
//
// 校驗（比展開更要緊）：
//   ① 規則說「不行」而判定表列了去向 → 衝突
//   ② 規則說「行」而判定表未列      → 衝突
//   ③ 判定表有格而無任何規則覆蓋      → 漏
//   ④ 答語／引文非底本逐字原文        → 偽文（摘引以「……」標省略）
// 三者皆零，規則表方可入庫。
//
// 用法：node 承注/expand.mjs [門號…]（預設全十五門）
//
// 注意：本檔輸出整份 expanded.json。若只傳部分門號，輸出即只含那幾門——
// 十五門既已定稿，預設改為全跑，免得單門重跑靜默削去其餘十四門
// （2026-08-02 曾以 `node expand.mjs` 重跑，4620 格被覆為 1092 格）。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const POSITIONS = join(ROOT, 'xuanfopu-h5/data/positions.json');

// 底本全文：逐字校驗之所依。答語與引文若非合成句，必須能在此逐字尋得——
// 此防「偽造原文」，是全工程最要緊的一道紀律（門五曾兩處拼接自造之語，賴此逮出）。
const ORIGINAL = [1, 2, 3, 4, 5, 6]
  .map((i) => readFileSync(join(ROOT, `繁体版/B0136_00${i}.txt`), 'utf8')).join('\n');
const bare = (t) => String(t || '').replace(/[\s\[\]A-Za-z0-9]/g, '');
const ORIG_BARE = bare(ORIGINAL);
// 摘引以「……」標省略，逐段校驗
function isVerbatim(text) {
  if (!text) return true;
  return String(text).split('……').every((seg) => !bare(seg) || ORIG_BARE.includes(bare(seg)));
}

const FACES = ['那', '謨', '阿', '彌', '陀', '佛'];
const COMBOS21 = [];
for (let i = 0; i < 6; i++) for (let j = i; j < 6; j++) COMBOS21.push(FACES[i] + FACES[j]);

// 卷一通則：相雜六相並不行。全譜通用，不繫某門。
const MIXED_RULE = {
  id: 'R0-相雜',
  title: '相雜不行通則',
  source: { pos: 'g01-04', name: '見取', juan: 1, line: 57, file: 'B0136_001.txt' },
  quote: '其餘位中。以阿彌陀善。與那謨惡相為對治。二俱無力。所以並不行也。',
};

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

// 全譜位名／卷次表：徵引可跨門（如淨土門引別教門「陀佛歸方便淨。永離退緣」）
const ALLPOS = new Map(load(POSITIONS).positions.map((p) => [p.id, p]));
const JUAN_OF = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 4, 9: 5, 10: 5, 11: 5, 12: 6, 13: 6, 14: 6, 15: 6 };
// 把規則所繫之出處組成可徵引的引文卡
function makeCite(src, text, n) {
  let key = typeof src === 'string' ? src : (typeof src?.pos === 'string' ? src.pos : null);
  if (key && key.includes('/')) key = null;   // 多源規則：pos 形如 g12-06/g12-11/g12-17
  const p = key ? ALLPOS.get(key) : null;
  const gate = p ? p.gate : (src && src.gate) || null;
  return {
    n,
    text,
    pos: key,
    name: p ? p.name : (src && src.name) || null,
    gate,
    juan: gate ? JUAN_OF[gate] : (src && src.juan) || null,
    line: (typeof src === 'object' && src.line) || (p && p.source && p.source.line) || null,
    ref: null, // 由下方補成「《選佛譜》卷第六・初發心住・L57」
  };
}
const CN = ['一', '二', '三', '四', '五', '六'];
function finishCite(c) {
  const parts = ['《選佛譜》'];
  if (c.juan) parts.push(`卷第${CN[c.juan - 1]}`);
  if (c.name) parts.push(`・${c.name}`);
  if (c.line) parts.push(`・L${c.line}`);
  c.ref = parts.join('');
  return c;
}

function expandGate(gate) {
  let rulePath = join(HERE, `rules/g${gate}.json`);
  if (!existsSync(rulePath)) rulePath = join(HERE, `rules/g${String(gate).padStart(2, '0')}.json`);
  if (!existsSync(rulePath)) {
    console.error(`　門 ${gate} 尚無規則表（${rulePath}）——該門未核。`);
    return null;
  }
  const R = load(rulePath);
  const all = load(POSITIONS).positions.filter((p) => p.gate === gate);
  const byId = new Map(all.map((p) => [p.id, p]));

  // 逐格結論：cells[posId][combo] = { level, ruleId, quote, verdict }
  const cells = new Map(all.map((p) => [p.id, new Map()]));
  const mixed = new Set(R.mixed6 || []);
  const conflicts = [];
  const pendingCells = new Set();
  const rulingCells = new Set();

  // 待議格先登記，供最後標色（不算覆蓋）
  for (const d of R.pending || []) {
    for (const rid of d.ruleRefs || []) void rid;
  }

  // 統一契約：每格 ＝ { verdict, 答, 引[], level, ruleId }
  //   答  ＝ 直陳緣由之句，內含 [n] 標記；直說格即原文本身
  //   引  ＝ 可點開之引文卡（原文＋《選佛譜》卷次・位名・行號）
  //   level 僅供審計與校驗，不出前臺
  const mkRec = (rule, item, posId) => {
    // 推演＝有合成答語者；僅有引文而無答語者（如跨門明文徵引），仍屬直說／承注
    const inferred = !!(item.引 && item.答);
    let cites;
    if (item.引) cites = item.引.map((x, i) => finishCite(makeCite(x, x.text, i + 1)));
    else cites = [finishCite(makeCite(rule.source, item.quote, 1))];
    return {
      verdict: item.verdict || '行',
      答: item.答 || item.quote,
      引: cites,
      level: inferred ? '推演' : (posId === rule.scope.self ? '直說' : '承注'),
      ruleId: rule.id,
    };
  };

  const put = (posId, combo, rec) => {
    const m = cells.get(posId);
    if (!m) return;
    // 本位專說 > 承注 > 攜帶 > 通則；同級後到者附記，不覆寫
    const cur = m.get(combo);
    const rank = { 直說: 4, 承注: 3, 推演: 3, 攜帶: 2, 通則: 1 };
    if (!cur || rank[rec.level] > rank[cur.level]) m.set(combo, rec);
    else if (cur.ruleId !== rec.ruleId) (cur.also ||= []).push(rec.ruleId);
  };

  // ① 相雜六相：全門一律通則不行
  for (const p of all) {
    for (const c of mixed) {
      put(p.id, c, { level: '通則', ruleId: MIXED_RULE.id, verdict: '不行', 答: MIXED_RULE.quote, 引: [finishCite(makeCite(MIXED_RULE.source, MIXED_RULE.quote, 1))] });
    }
  }

  // ②a 欄位白名單：臆造的欄位會靜默失效（門十四初稿即因 extraByCombo 漏 7 格），故先報警
  const RULE_KEYS = new Set(['id', 'title', 'source', 'authority', 'authorityQuote', 'authorityNote', 'items', 'scope', 'byCombo', 'inheritCombos', 'carryFrom', 'carryCombos', 'carryNote', 'expandCombos', 'expandNote', 'status', 'pendingId']);
  const ITEM_KEYS = new Set(['combos', 'quote', 'verdict', 'kind', 'note', 'gloss', 'from', 'itemScope', 'itemScopeNote', 'pending', '答', '引']);
  const unknown = [];
  for (const rule of R.rules) {
    for (const k of Object.keys(rule)) if (!RULE_KEYS.has(k)) unknown.push(`${rule.id}.${k}`);
    for (const it of rule.items || []) for (const [k, v] of Object.entries(it)) {
      if (!ITEM_KEYS.has(k)) { unknown.push(`${rule.id}.items.${k}`); continue; }
      // 型別校驗：白名單只查鍵名不查型別時，欄位錯位（如 itemScope 傳到 note 上）會靜默失效
      const wantArray = ['combos', 'itemScope', '引'].includes(k);
      if (wantArray !== Array.isArray(v)) unknown.push(`${rule.id}.items.${k}(型別錯：期${wantArray ? '陣列' : '非陣列'})`);
    }
  }

  // ② 逐條規則展開
  for (const rule of R.rules) {
    const targets = [rule.scope.self, ...(rule.scope.inherit || [])].filter(Boolean);
    for (const item of rule.items) {
      // byCombo：逐相各有作用域（如 R12-5 三惡相三道邊界不同）
      if (rule.byCombo) {
        for (const c of item.combos) {
          for (const posId of rule.byCombo[c] || []) {
            const pend = rule.pendingId || item.pending || null;
            put(posId, c, mkRec(rule, item, posId));
            if (pend) pendingCells.add(`${posId}·${c}`);
            if (item.引 && item.答) rulingCells.add(`${posId}·${c}`);
          }
        }
        continue;
      }
      // itemScope：本條目自帶作用域（窄於規則作用域）
      const scope = item.itemScope || targets;
      for (const posId of scope) {
        const isSelf = posId === rule.scope.self;
        // inheritCombos：繼承位只承指定相（如 R12-9 次位僅承那佛）
        const combos = isSelf ? item.combos : (rule.inheritCombos || item.combos);
        for (const c of combos) {
          put(posId, c, mkRec(rule, item, posId));
          if ((rule.pendingId || item.pending)) pendingCells.add(`${posId}·${c}`);
          if (item.引 && item.答) rulingCells.add(`${posId}·${c}`);
        }
      }
    }
    // carryFrom：本組諸相之緣由承他組同名條（如十行位「按位漸進」承十住通則）
    if (rule.carryFrom && rule.carryCombos) {
      const from = R.rules.find((x) => x.id === rule.carryFrom);
      for (const posId of targets) {
        for (const c of rule.carryCombos) {
          const item = from?.items.find((it) => it.combos.includes(c));
          if (item) {
            put(posId, c, { level: '攜帶', ruleId: `${rule.id}←${from.id}`, verdict: item.verdict || '行', 答: item.quote, 引: [finishCite(makeCite(from.source, item.quote, 1))] });
          }
        }
      }
    }
    // expandCombos：義理通於一組相，實際落於哪些相依判定表（如 R12-8 封頂）
    if (rule.expandCombos) {
      const item = rule.items[0];
      for (const posId of targets) {
        const p = byId.get(posId);
        for (const c of rule.expandCombos) {
          const e = p?.table?.[c];
          if (!e || !e.to) continue;
          const dest = e.to;
          if (dest === '十向' || dest === '十法界無量迴向') {
            put(posId, c, { level: '承注', ruleId: rule.id, verdict: '行', 答: item.quote, 引: [finishCite(makeCite(rule.source, item.quote, 1))] });
          }
        }
      }
    }
  }

  // ②b 逐字校驗：非合成句之答語與全部引文，須能在底本中逐字尋得
  for (const rule of R.rules) {
    for (const it of rule.items || []) {
      if (!it.答 && !isVerbatim(it.quote)) conflicts.push(`偽文① ${rule.id}·${(it.combos || []).join('/')}：答語非底本逐字原文「${String(it.quote).slice(0, 30)}…」`);
      for (const c of it.引 || []) {
        if (!isVerbatim(c.text)) conflicts.push(`偽文② ${rule.id}：引文非底本逐字原文「${String(c.text).slice(0, 30)}…」`);
      }
    }
  }

  // ③ 校驗
  let ok = 0, gap = 0;
  const gaps = [];
  for (const p of all) {
    const m = cells.get(p.id);
    for (const c of COMBOS21) {
      const listed = !!p.table?.[c];               // 判定表列了＝行（或贈掷）
      const rec = m.get(c);
      if (!rec) { gap++; gaps.push(`${p.id} ${p.name} · ${c} · ${listed ? '行' : '不行'}`); continue; }
      ok++;
      if (rec.verdict === '不行' && listed) conflicts.push(`衝突① ${p.id} ${p.name}·${c}：規則 ${rec.ruleId} 判「不行」，判定表卻列去向「${p.table[c].to || '贈' + p.table[c].grant}」`);
      if (rec.verdict === '行' && !listed) conflicts.push(`衝突② ${p.id} ${p.name}·${c}：規則 ${rec.ruleId} 判「行」，判定表未列`);
    }
  }

  const total = all.length * 21;
  const byLevel = {};
  for (const p of all) for (const c of COMBOS21) {
    const r = cells.get(p.id).get(c);
    if (r) byLevel[r.level] = (byLevel[r.level] || 0) + 1;
  }

  return { gate, R, all, cells, total, ok, gap, gaps, conflicts, byLevel, pendingCells, rulingCells, unknown };
}

function report(res) {
  const { gate, R, total, ok, gap, gaps, conflicts, byLevel, pendingCells, rulingCells, unknown } = res;
  const reviews = R.pending || [];
  const openReviews = reviews.filter((item) => !item.ruling);
  const ruledReviews = reviews.filter((item) => item.ruling);
  if (unknown?.length) console.log(`\n⚠️  規則表有未知欄位（將靜默失效，須改）：${[...new Set(unknown)].join('、')}`);
  console.log(`\n════ 門${gate} ${R.meta.gateName}　${R.meta.positions} 位 × 21 相 ＝ ${total} 格 ════`);
  console.log(`規則 ${R.rules.length} 條（待議 ${openReviews.length} 項，已裁定複核 ${ruledReviews.length} 項）\n`);
  console.log('覆蓋：');
  for (const [k, v] of Object.entries(byLevel).sort((a, b) => b[1] - a[1])) {
    console.log(`　${k.padEnd(4, '　')} ${String(v).padStart(5)}　${(100 * v / total).toFixed(1)}%`);
  }
  console.log(`　${'合計'.padEnd(4, '　')} ${String(ok).padStart(5)}　${(100 * ok / total).toFixed(1)}%`);
  console.log(`　${'未覆蓋'.padEnd(3, '　')} ${String(gap).padStart(5)}　${(100 * gap / total).toFixed(1)}%`);
  if (pendingCells.size) console.log(`　（其中體例推定待審 ${pendingCells.size} 格）`);
  if (rulingCells.size) console.log(`　（其中推演 ${rulingCells.size} 格——答語為合成句，所繫引文逐條可點開核對）`);

  if (conflicts.length) {
    console.log(`\n⚠️  規則與判定表衝突 ${conflicts.length} 處——規則有誤，須回原文重核：`);
    conflicts.forEach((x) => console.log('　' + x));
  } else {
    console.log('\n✓ 規則與判定表零衝突');
  }
  if (gaps.length) {
    console.log(`\n未覆蓋 ${gaps.length} 格：`);
    gaps.slice(0, 40).forEach((x) => console.log('　' + x));
    if (gaps.length > 40) console.log(`　…另 ${gaps.length - 40} 格`);
  }
  for (const d of reviews) {
    console.log(`\n【${d.id}${d.ruling ? '·已裁定' : '·待議'}】${d.title}　${d.cells}`);
    if (d.ruling?.判) console.log(`　判：${d.ruling.判}`);
    if (d.結) console.log(`　結：${d.結}`);
  }
}

const ALL_GATES = Array.from({ length: 15 }, (_, i) => i + 1);
const argGates = process.argv.slice(2).map(Number).filter(Boolean);
const gates = argGates.length ? argGates : ALL_GATES;
if (argGates.length && argGates.length < 15) {
  console.warn(`⚠ 只展開門 ${argGates.join('、')}——expanded.json 將只含這 ${argGates.length} 門，其餘門之資料會被覆去。`);
  console.warn('  若非有意如此，請不帶參數重跑（預設全十五門）。\n');
}
const list = gates.length ? gates : [12];
const out = { meta: { builtAt: new Date().toISOString().slice(0, 10), note: '由 承注/expand.mjs 依人工核定規則表機械展開；勿手改。' }, gates: {} };
for (const g of list) {
  const res = expandGate(g);
  if (!res) continue;
  report(res);
  const flat = {};
  for (const [pid, m] of res.cells) {
    flat[pid] = {};
    for (const [c, r] of m) flat[pid][c] = r;
  }
  out.gates[g] = flat;
}
writeFileSync(join(HERE, 'expanded.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`\n已寫出 承注/expanded.json`);
