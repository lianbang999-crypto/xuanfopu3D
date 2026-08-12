// 十五門門義白話手譯本核驗 · 誠實閘門
// 與位注白話（check-pos-baihua.mjs）同構，惟多守一條界線：
//   原譜門1/2/15 無總說，此三門的白話係本項目自撰導語——src 絕不得寫成「《選佛譜》…總說」。
//   譯得順口不等於谱主說過；自撰之為自撰，此闸專為守住這一點。
// 運行：node scripts/check-door-baihua.mjs
import { SFP_DOORS } from '../src/sfp-data.js';
import { SFP_CANON_DOORS } from '../src/sfp-canon.js';
import { SFP_DOOR_BAIHUA } from '../src/sfp-door-baihua.js';
import { SFP_GLOSS } from '../src/sfp-gloss.js';
import { ZH_T2S, ZH_S2T } from '../src/zh-conv.js';

const CN = '一二三四五六七八九十'.split('').concat(['十一', '十二', '十三', '十四', '十五']);
const conv = (s, d) => [...String(s)].map((c) => d[c] || c).join('');
const SELF = new Set([1, 2, 15]); // 原譜無此三門總說（與 game.js 的 DOOR_HINT_SELF 同源）
const CARD_ROW_MAX = 7;

const BY = Object.fromEntries(SFP_DOORS.map((d) => [d.no, d]));
const GLS_TRAD = SFP_GLOSS.map((g) => g[0]).filter((k) => conv(k, ZH_T2S) !== k);
const norm = (s) => conv(s, ZH_T2S).replace(/[，。、；：（）「」〈〉·—…\s]/g, '');
const overlap = (a, b) => { const B = new Set(norm(b)); const A = norm(a); return A.length ? [...A].filter((c) => B.has(c)).length / A.length : 0; };

const err = [], warn = [], stats = [];

// ① 十五門須齊
for (let n = 1; n <= 15; n++) if (!SFP_DOOR_BAIHUA[n]) err.push(`門${n}：缺門義白話`);
Object.keys(SFP_DOOR_BAIHUA).forEach((k) => { if (!BY[+k]) err.push(`未知門：${k}`); });

for (let n = 1; n <= 15; n++) {
  const e = SFP_DOOR_BAIHUA[n]; if (!e) continue;
  const d = BY[n];
  const intro = String(d.intro || '');   // 門1/2/15 在 sfp-data.js 中為空串，導語在 game.js 補
  const v = String(e.v || '');
  const rows = e.rows || [];
  const full = v + rows.map((r) => String(r.k || '') + String(r.v || '')).join('');

  if (!full) { err.push(`門${n}：白話為空`); continue; }
  if (!v) err.push(`門${n}：只有 rows 而無領起句`);
  if (!e.src) err.push(`門${n}：缺 src 出處`);

  // ② self 界線：原譜無總說者，出處不得冒「《選佛譜》」
  const isSelf = SELF.has(n);
  if (isSelf !== !!e.self) err.push(`門${n}：self 標記與原譜實況不符（原譜${isSelf ? '無' : '有'}此門總說，而 self=${!!e.self}）`);
  if (e.self) {
    if (/《選佛譜》/.test(String(e.src))) err.push(`門${n}：self 門的出處冒用了《選佛譜》——「${e.src}」；原譜無此門總說，須標為本項目自撰導語`);
    if (!/自撰|本項目/.test(String(e.src))) err.push(`門${n}：self 門的出處未標明係自撰導語——「${e.src}」`);
  } else {
    // ③ 非 self：出處須含書名與正確卷次
    if (!/《選佛譜》/.test(String(e.src))) err.push(`門${n}：出處未標《選佛譜》——「${e.src}」`);
    const cn = SFP_CANON_DOORS[n];
    if (cn) {
      const want = `卷第${CN[cn.juan - 1]}`;
      if (!String(e.src).includes(want)) err.push(`門${n}：出處卷次不符，應為 ${want}，實為「${e.src}」`);
    }
    if (!intro) err.push(`門${n}：標為譜文總說，而 sfp-data.js 中該門 intro 為空`);
  }

  // ④ 明細行
  rows.forEach((r, i) => {
    if (!r.k) err.push(`門${n}：第 ${i + 1} 行缺行標 k`);
    else if ([...String(r.k)].length > 4) err.push(`門${n}：行標「${r.k}」超四字——卡上行標欄僅 3.6em`);
    if (!r.v) err.push(`門${n}：行標「${r.k}」無正文`);
  });
  if (rows.length > CARD_ROW_MAX) warn.push(`門${n}：${rows.length} 行，超 CARD_ROW_MAX=${CARD_ROW_MAX}，餘行會被折疊`);

  // ⑤ 字形須繁體——名相浮標只認繁體鍵，簡體正文一個也標不上（此本重譯的頭一條緣由）
  const toTrad = conv(full, ZH_S2T);
  if (toTrad !== full) {
    const bad = [...full].filter((ch, i) => toTrad[i] !== ch);
    err.push(`門${n}：混入簡體字 ${[...new Set(bad)].join('')} —— 名相浮標只認繁體鍵，會漏標`);
  }

  // ⑥ partial 須名副其實；長篇已用 rows 分段覆譯者，不因原文超 400 字就強制 partial。
  if (e.partial && intro && intro.length < full.length * 1.6) warn.push(`門${n}：標了 partial，但原文總說僅 ${intro.length} 字（白話合計 ${full.length} 字）`);
  if (!e.partial && intro.length > 400 && full.length < intro.length * 0.45)
    warn.push(`門${n}：原文總說 ${intro.length} 字，白話僅 ${full.length} 字且未標 partial，恐有漏譯`);
  if (v.length > 160) warn.push(`門${n}：領起句 ${v.length} 字，太長，宜收束或拆入 rows`);

  const hits = GLS_TRAD.filter((t) => full.includes(t)).length;
  stats.push({ n, len: full.length, lead: v.length, nRows: rows.length, hits,
    intro: intro.length, ov: intro ? Math.round(overlap(full, intro) * 100) : 0, self: !!e.self });
}

console.log('── 十五門門義白話 ──');
stats.forEach((s) => {
  console.log(`  門${String(s.n).padStart(2)} ${BY[s.n].title}　白話 ${String(s.len).padStart(3)} 字`
    + `（領起 ${String(s.lead).padStart(3)}／明細 ${s.nRows} 行）　原文 ${String(s.intro).padStart(3)} 字`
    + `　浮標 ${String(s.hits).padStart(2)} 處${s.self ? '　※自撰導語' : ''}`);
});
if (stats.length) {
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  console.log(`\n  白話字數中位 ${med(stats.map((s) => s.len))}　浮標命中中位 ${med(stats.map((s) => s.hits))} 處/門　零命中 ${stats.filter((s) => !s.hits).length} 門`);
  console.log(`  舊本 SFP_DOOR_PLAIN 係簡體，浮標對門義全失效；本表「浮標」列即重譯所得。`);
}
if (warn.length) console.log(`\n── 提醒 ${warn.length} 條 ──\n  ${warn.join('\n  ')}`);
if (err.length) { console.log(`\n── 錯 ${err.length} 條 ──\n  ${err.join('\n  ')}`); process.exit(1); }
console.log(`\n✓ 十五門門義白話無硬錯`);
