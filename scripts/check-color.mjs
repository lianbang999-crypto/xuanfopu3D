// 色彩护栏（v393 壁画光第三期）：扫 src 各文件的 CSS 字面 hex，与基线比对——
// 新增未入宪之色即报错（棘轮制：想加新色先过「入宪」，跑 --update 重写基线并在色彩立宪注释登记）。
// three.js 侧 0x 色值属数据层豁免（见 game.js 色彩立宪注），不入扫描。
// 另附关键文字对的 WCAG 对比度抽查：正文/注脚/金字/警红在夜底与卡底上的可读性下限。
import fs from 'node:fs';

const SRC = ['src/game.js', 'src/net.js', 'src/plaza.js', 'src/chalou.js', 'src/icons.js', 'src/reader-page.css', 'index.html', 'read.html'];
const BASE = 'scripts/color-baseline.json';

const found = new Set();
for (const f of SRC) {
  if (!fs.existsSync(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/#[0-9a-fA-F]{6}\b/g)) found.add(m[0].toLowerCase());
}

if (process.argv.includes('--update') || !fs.existsSync(BASE)) {
  fs.writeFileSync(BASE, JSON.stringify([...found].sort(), null, 1));
  console.log(`色彩基线已写：${found.size} 色 → ${BASE}`);
  process.exit(0);
}

const base = new Set(JSON.parse(fs.readFileSync(BASE, 'utf8')));
const fresh = [...found].filter(c => !base.has(c)).sort();
const gone = [...base].filter(c => !found.has(c)).sort();

// —— 对比度抽查（WCAG 相对亮度） ——
const lum = (h) => {
  const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PAIRS = [
  ['#efe0b4', '#201b2f', '正文纸金/夜底', 4.5],
  ['#9d9170', '#1a1830', '注脚灰金/卡底', 4.5],
  ['#e8c766', '#201b2f', '亮金字/夜底', 4.5],
  ['#f0af9e', '#1a1830', '警红字/卡底', 4.5],
  ['#96e1d6', '#1a1830', '联机teal/卡底', 4.5],
];
let contrastBad = 0;
console.log('【对比度抽查】');
for (const [fg, bg, label, min] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) contrastBad++;
  console.log(`  ${ok ? '✓' : '✗'} ${label} ${fg}/${bg} = ${r.toFixed(2)}:1（下限 ${min}:1）`);
}

console.log('【色彩棘轮】');
if (gone.length) console.log(`  （基线中 ${gone.length} 色已不再使用，可择期 --update 收编）`);
if (fresh.length) {
  console.log(`  ✗ 新增未入宪之色 ${fresh.length}：${fresh.join(' ')}`);
  console.log('    请先在 game.js 色彩立宪注释登记（明度分层用透明度档，能归族则归族），再 node scripts/check-color.mjs --update');
} else console.log(`  ✓ 无新增色（在用 ${found.size} · 基线 ${base.size}）`);

if (fresh.length || contrastBad) process.exit(1);
console.log('✓ 色彩护栏俱过');
