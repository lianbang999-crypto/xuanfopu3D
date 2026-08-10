#!/usr/bin/env node
// 選佛譜白话正本 · 逐门校验
// 用法：node .claude/skills/sfp-baihua/check.mjs 05      单门
//       node .claude/skills/sfp-baihua/check.mjs all     全部已写之门
// 全零方算过关；有问题时退出码非零。

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// ── 定位项目根（向上找 正本/README.md）─────────────────────────────
function findRoot(start) {
  let d = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, '正本', 'README.md'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error('找不到项目根（须含 正本/README.md）');
}
const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));

// ── 繁→简归一（覆盖谱中位名·去处用字）────────────────────────────
const T2S = {
  亂:'乱',內:'内',別:'别',則:'则',剛:'刚',動:'动',勝:'胜',參:'参',嚴:'严',圓:'圆',
  報:'报',壞:'坏',奮:'奋',學:'学',實:'实',師:'师',廣:'广',彌:'弥',後:'后',徧:'遍',
  惡:'恶',愛:'爱',懺:'忏',捨:'舍',東:'东',棄:'弃',業:'业',樂:'乐',歡:'欢',毀:'毁',
  淨:'净',滅:'灭',滿:'满',漢:'汉',無:'无',煩:'烦',熱:'热',燄:'焰',獄:'狱',現:'现',
  發:'发',盡:'尽',盧:'卢',眾:'众',瞋:'嗔',禪:'禅',種:'种',縛:'缚',總:'总',羅:'罗',
  習:'习',聞:'闻',聲:'声',聽:'听',脩:'修',脫:'脱',莊:'庄',薩:'萨',處:'处',見:'见',
  覺:'觉',觀:'观',請:'请',諍:'诤',識:'识',護:'护',財:'财',貨:'货',貴:'贵',贍:'赡',
  軌:'轨',輔:'辅',輪:'轮',辦:'办',迴:'回',進:'进',遠:'远',邊:'边',鈍:'钝',銀:'银',
  銅:'铜',鐵:'铁',門:'门',間:'间',關:'关',隨:'随',雜:'杂',離:'离',難:'难',雲:'云',
  頂:'顶',順:'顺',須:'须',頓:'顿',願:'愿',餘:'余',饒:'饶',體:'体',齋:'斋',癡:'痴',
  著:'着',專:'专',風:'风',與:'与',當:'当',於:'于',萬:'万',來:'来',時:'时',義:'义',
  養:'养',經:'经',聖:'圣',禮:'礼',變:'变',開:'开',書:'书',為:'为',們:'们',個:'个',
  這:'这',樣:'样',還:'还',麼:'么',過:'过',說:'说',語:'语',讀:'读',寫:'写',現:'现',
};
const norm = s => [...(s || '')].map(c => T2S[c] || c).join('').replace(/\s/g, '');

// 去处别名：白话中可接受的替代写法（key 为归一后的去处全名）
// ★ 只收「同名异写」——读者一眼能认出是同一张卡的。
//   凡实质有别者（如「识无边处定」≠「识无边处天」，定是修法·天是生处）不得入此表，须改白话。
const ALIAS = {
  '他化自在天': ['他化天'],
  '大乘初阿僧祇满': ['初阿僧祇满'],
  '中乘辟支佛果': ['辟支佛果'],
  '别教妙觉佛位': ['妙觉佛位', '别教妙觉'],
  '圆十信位': ['圆教十信'],
  '圆十住位': ['圆教十住'],
  '圆十行位': ['圆教十行'],
  '圆十回向位': ['圆教十回向'],
  '圆十地位': ['圆教十地'],
  '圆五品位': ['圆教五品', '五品弟子位'],
  '圆等觉位': ['圆教等觉'],
  '十一切处观': ['十一切处', '十遍处'],
  '六妙门禅': ['六妙门'],
  '八背舍观': ['八背舍'],
  '八胜处观': ['八胜处'],
  '八念观': ['八念'],
  '九想观': ['九想'],
  '十想观': ['十想'],
  '通明观': ['通明禅'],
  '魔罗天': ['魔天'],
};

// 去处名的可接受变体：全名 → 去序数前缀 → 去「位」尾
// （通教十地·别教十住十行十回向十地，谱主位名皆带序数；白话用通行地名即可）
function variants(nd) {
  const out = new Set([nd]);
  for (const s of [...out]) {
    if (/^[初二三四五六七八九十]/.test(s) && s.length > 2) out.add(s.slice(1));
  }
  for (const s of [...out]) {
    if (s.length > 3 && s.endsWith('位')) out.add(s.slice(0, -1));
  }
  for (const a of (ALIAS[nd] || [])) out.add(a);
  return [...out];
}

// ── 二十一轮相定序 ────────────────────────────────────────────────
const ORD = '那那 那謨 謨謨 阿阿 阿彌 彌彌 阿陀 彌陀 陀陀 那佛 謨佛 阿佛 彌佛 陀佛 佛佛 那阿 謨阿 那彌 謨彌 那陀 謨陀'.split(' ');

// ── 主句禁语 ─────────────────────────────────────────────────────
// 红线：白话层不冠「譜曰」、不署蕅益；不用工程语
const BAN = [
  [/譜曰|谱曰/, '主句冒充原文（「谱曰」只许出现在 ‖ 之后）'],
  [/蕅益|智旭/, '主句署古德名（署名归界面另栏）'],
  [/本位行法|此組|此组|該組|该组|列此|準知|准知|如上所列|本組|本组|詳見上|详见上|同上組|同上组/, '工程语'],
  [/谱主|譜主/, '主句转述说话人（本项目是客观解释，非解读；引文栏已署谱曰）'],
];

// ── 字义标注的标准用词（卷首〈輪相表法第一〉正名）────────────────
// 六字的解释必须前后一致，否则同一个字读者会看成两回事。
// 第②层用「是」，第③④层用「表」；第④层四门名依谱主判语常用形。
// v392 正本字形改繁（用户定：全用繁体，界面另备 OpenCC 一键转换），下列词表随之改繁
const GLYPH_OK = {
  那: ['見煩惱', '法執', '邪見', '意見'],              // 后三者各有本位定诠依据
  謨: ['愛煩惱', '法愛', '煩惱', '愛著'],              // 味禪位「謨表煩惱」是谱主原话
  阿: ['布施', '生滅門', '生滅定門'],
  彌: ['持戒', '無生門', '無生定門'],
  陀: ['禪定', '次第門'],
  佛: ['無漏善慧', '圓頓門', '慧學', '妙慧', '佛慧'],
};
// 明令禁止的旧用词 → 正名
const GLYPH_BAD = [
  [/「那」\s*(?:是|表)\s*見惑/, '「那」应作「見煩惱」（卷首正名）'],
  [/「謨」\s*(?:是|表)\s*愛惑/, '「謨」应作「愛煩惱」（卷首正名）'],
  [/「佛」\s*(?:是|表)\s*智慧/, '「佛」应作「無漏善慧」（「智慧」丢了「無漏」）'],
  [/兩輪都是「佛」——智慧/, '「佛」应作「純是無漏善慧」'],
  [/無生滅門/, '统一作「無生門」（谱主判语常用形）'],
  [/三乘中(?:鈍|利)根|四門裡的第|四門中的第[一二三四]門/, '④层措辞须作「「X」在此位表〇〇門」，不加尾巴'],
];

// ── CSV ──────────────────────────────────────────────────────────
function parseCSV(t) {
  const rows = []; let f = '', r = [], q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { r.push(f); f = ''; }
      else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
      else if (c !== '\r') f += c;
    }
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows;
}

const csvRows = parseCSV(fs.readFileSync(path.join(ROOT, '选佛谱·轮相说明总表.csv'), 'utf8'));
const H = csvRows[0].map(s => s.replace(/^﻿/, ''));
const iM = H.indexOf('门次'), iP = H.indexOf('位次'), iC = H.indexOf('轮相'),
      iJ = H.indexOf('判定'), iQ = H.indexOf('去处'),
      iFA = H.indexOf('首字表义'), iFB = H.indexOf('次字表义'), iLY = H.indexOf('当令层');
const ANNO = JSON.parse(fs.readFileSync(path.join(ROOT, '承注', 'expanded.json'), 'utf8'));

// ── 四门明文表：谱主亲用四门语的格，白话必须带出 ─────────────────
// 卷首「問。何故又表生滅等四門。答。約出世慧。法爾有此四門」——
// ④四门层是「約出世慧」而分，不是随处可取。谱主全书只在少数格亲用四门语，
// 那些格白话若不带出，就是漏了谱主明说的话。此表由原文自动抽取，零假阳性。
const LAYER4 = (() => {
  let raw = '';
  for (let i = 1; i <= 6; i++) {
    const f = path.join(ROOT, '校正原本', '原文', `B0136_00${i}.txt`);
    if (fs.existsSync(f)) raw += fs.readFileSync(f, 'utf8') + '\n';
  }
  const seg = {}; let cur = null;
  for (const l of raw.split('\n')) {
    const m = l.match(/^(?:\([那謨阿彌陀佛]{2}\))?([^\s(（]+)　　\(/);   // 位名前可带(轮相)前缀
    if (m) { cur = m[1]; seg[cur] ??= ''; continue; }
    if (/^第.+門\(凡/.test(l)) { cur = null; continue; }
    if (cur) seg[cur] += l;
  }
  // 「某轮相 + 四门语」的明文配对
  const RE = /([那謨阿彌陀佛]{2})[。．]?[^。]{0,14}?(生滅定門|無生定門|生滅門|無生滅門|無生門|次第門|圓頓門|生滅理|圓頓理)/g;
  const WORD = { 生滅理:'生滅', 生滅門:'生滅門', 生滅定門:'生滅定門', 無生滅門:'無生門',
                 無生門:'無生門', 無生定門:'無生定門', 次第門:'次第門', 圓頓門:'圓頓', 圓頓理:'圓頓' };
  const out = {};
  for (const [pos, s] of Object.entries(seg)) {
    let m; RE.lastIndex = 0;
    while ((m = RE.exec(s))) out[norm(pos) + '|' + m[1]] = WORD[m[2]];
  }
  // 人工补录：上面的正则不跨句号（跨了就会把「阿阿十六特勝等者。隨次第門漸增進故」这类误收），
  // 所以谱主把轮相与门名分写在两句里的，正则扫不到。此表逐条实核原文后补，仍是零假阳性。
  out[norm('六妙門禪') + '|阿佛'] = '生滅門';   // 原文：阿佛初果者。生滅門中。創發真無漏慧故。
  out[norm('六妙門禪') + '|彌佛'] = '無生門';   // 原文：彌佛見地者。無生門中創發真無漏慧故。
  out[norm('事六度心') + '|阿佛'] = '生滅門';   // 原文：阿佛三僧祇滿者。生滅門中。永伏諸惑。不離佛前故。
  out[norm('別相念') + '|彌佛'] = '生滅門';     // 原文：彌佛三果。陀佛四果者。生滅門中。已修正觀。急求出苦。故不轉入通別二門。
  out[norm('別相念') + '|陀佛'] = '生滅門';     //   （场所式，一句管两格；字义仍③层，正文带出）
  out[norm('初果須陀洹') + '|彌佛'] = '無生門'; // 原文：彌佛成已辦地者。悟無生門。必能即迴心故。（定义式，标④层）
  out[norm('二性地') + '|陀佛'] = '次第門';     // 原文：陀佛別十住者。轉入次第門故。（定义式，标④层）
  // ⚠ 反面备案：第八门另有两处「次第門」**不是**四门之三，切勿收入——
  //   六妙門禪「阿阿十六特勝等者。隨次第門漸增進故」（阿阿去处是本门第二位十六特勝，非别教位次；
  //     且「阿」表生滅門，若作四门之三解便自相矛盾）
  //   通明觀「今亦一往約次第門。較逾十六特勝而已」（比较三位禅法的深浅，是排列次第义）
  //   二者皆指本门十三位由浅入深的排列次第。详见 正本/四层义归属.md 第八门决议第 3 条。
  return out;
})();

// ── 校验一门 ─────────────────────────────────────────────────────
async function checkDoor(door) {
  const file = path.join(ROOT, '正本', `门${door}.js`);
  if (!fs.existsSync(file)) return null;
  const D = (await import(pathToFileURL(file).href)).default;
  const gates = ANNO.gates[String(+door)];

  const CSV = {}, POS = [];
  for (const r of csvRows.slice(1)) {
    if (r[iM] !== `第${+door}门`) continue;
    if (!CSV[r[iP]]) { CSV[r[iP]] = {}; POS.push(r[iP]); }
    CSV[r[iP]][r[iC]] = { j: r[iJ], q: r[iQ], fa: r[iFA], fb: r[iFB], lay: r[iLY] };
  }
  const gids = Object.keys(gates), P2G = {};
  POS.forEach((p, i) => P2G[p] = gids[i]);

  const done = POS.filter(p => ORD.some(c => D[p + '|' + c]));
  const S = { miss:0, bad:0, noq:0, dupq:0, short:0, nodest:0, dup:0, ban:0, xor:0, glyph:0, lay4:0, csvglyph:0, lay4b:0 };
  const lens = []; let n = 0;

  for (const p of done) {
    const gid = P2G[p];
    for (const c of ORD) {
      const key = p + '|' + c, v = D[key];
      if (!v) { console.log('  缺', key); S.miss++; continue; }
      n++;
      const parts = v.split('‖');
      const main = parts[0], q = parts[1];
      lens.push(main.length);

      if (parts.length > 2) { console.log('  引文重复', key); S.dupq++; }
      if (!q || !/譜曰/.test(q)) { console.log('  无引文', key); S.noq++; }
      if (main.length < 22) { console.log('  过短', key, main.length); S.short++; }
      for (const [re, why] of BAN)
        if (re.test(main)) { console.log('  禁语', key, '·', why); S.ban++; }

      // 字义标注：术语须统一，否则同一个字读者会看成两回事
      for (const [re, why] of GLYPH_BAD)
        if (re.test(main)) { console.log('  字义不一', key, '·', why); S.glyph++; }
      for (const [ch, oks] of Object.entries(GLYPH_OK)) {
        const mm = main.match(new RegExp('「' + ch + '」\\s*(?:在这里)?\\s*(?:表|是)\\s*([^，。；：（(]{1,12})'))
                || main.match(new RegExp('兩輪都是「' + ch + '」——(?:純是)?([^，。；：]{1,12})'));
        if (mm && !oks.some(o => mm[1].startsWith(o) || mm[1].includes(o))) {
          console.log('  字义不一', key, `·「${ch}」作「${mm[1]}」，标准为 ${oks.join('／')}`); S.glyph++;
        }
      }

      // 四判：行 / 不行 / 贈掷 / 终局
      // ★「终局」只在第十五门：本门原文**不列轮相行法表**，母本 21 行仅为矩形结构占位。
      //   不得写成「不行」——不行是某一路不通、尚有别路可行；妙覺極果则「圓滿菩提。歸無所得」，
      //   本无再掷、再行、再升之法。承注库该门 21 格 verdict 皆作「無行法」，故不参与互斥比对。
      const csvj = CSV[p][c].j, isNo = /不行/.test(main);
      const cat = csvj.startsWith('贈掷') ? '贈掷'
                : csvj.startsWith('不行') ? '不行'
                : csvj.startsWith('终局') ? '终局' : '行';
      const want = gates[gid]?.[c]?.verdict;
      if (cat === '不行' && !isNo) { console.log('  判定不符(应不行)', key); S.bad++; }
      if (cat !== '不行' && isNo) { console.log('  判定不符(应行/赠掷/终局)', key, main.slice(0, 28)); S.bad++; }
      if (cat === '贈掷' && !/贈|赠/.test(main)) { console.log('  赠掷未说明', key); S.bad++; }
      if (cat === '终局' && !/終局|终局|不再擲|不再掷/.test(main)) { console.log('  终局未说明', key); S.bad++; }
      if ((cat === '行' && want !== '行') || (cat === '不行' && want !== '不行')) {
        console.log('  ★承注/CSV互斥', key, want, csvj); S.xor++;
      }

      // 去处：行格须原样点出卡名（读者点进去看到的名字要对得上）
      if (cat === '行') {
        const dest = (CSV[p][c].q || '').trim();
        if (dest) {
          const nd = norm(dest), nm = norm(main);
          if (!variants(nd).some(k => nm.includes(k))) {
            console.log('  去处未见', key, dest, '|', main.slice(0, 34)); S.nodest++;
          }
        }
      }

      // 四门明文：谱主亲用四门语处，主句须带出（漏了就是丢掉谱主明说的话）
      const w4 = LAYER4[norm(p) + '|' + c];
      if (w4 && !main.includes(w4)) {
        console.log('  四门漏说', key, '·原文亲用四门语，主句须带出「' + w4 + '」'); S.lay4++;
      }

      // 十二 · 字义标注 ↔ 母本三列（2026-08-09 母本补齐「首字表义／次字表义／当令层」后上线）
      // 十一项全是正本内部自洽性检查，查不出「位名对、去处对、引文对，唯独教判错」这一类；
      // 此项以母本为镜，双向锁：字义须与母本一致，④层标与不标须与母本「当令层」一致。
      {
        const CUT = '[^，。；：（(—「」]{1,10}';
        const gp = ch => {
          const m = main.match(new RegExp('「' + ch + '」\\s*(?:在此位|在這裡)?\\s*[是表]\\s*(' + CUT + ')'));
          return m ? m[1] : null;
        };
        let ga = gp(c[0]), gb = gp(c[1]);
        if (c[0] === c[1]) {
          const dm = main.match(new RegExp('^兩輪都是「' + c[0] + '」[，,]?\\s*(?:在此位表)?\\s*[—:：]*\\s*(?:純是)?(' + CUT + ')'));
          ga = gb = ga || (dm ? dm[1] : null);
        }
        const M = CSV[p][c];
        for (const [got, want, w] of [[ga, M.fa, '首'], [gb, M.fb, '次']])
          if (got && want && norm(got) !== norm(want)) {
            console.log('  字义与母本不符', key, `${w}字 正本「${got}」／母本「${want}」`); S.csvglyph++;
          }
        const RE4 = /(生滅定門|無生定門|生滅門|無生滅門|無生門|次第門|圓頓門)/;
        const marked = ga || gb;
        const is4 = M.lay === '④';
        // 两字皆未标（整掷说）时，退看主句
        if (is4 && !RE4.test(marked ? String(ga) + String(gb) : main)) {
          console.log('  ④层未带出', key, '母本当令层④，主句未见四门名'); S.lay4b++;
        }
        if (!is4 && marked && RE4.test(String(ga) + String(gb))) {
          console.log('  ④层误标', key, `母本当令层「${M.lay}」，主句却以四门名作字义`); S.lay4b++;
        }
      }

      // 同一字义重复解释
      for (const ch of ['那','謨','阿','彌','陀','佛']) {
        const re = new RegExp('「' + ch + '」\\s*[表是在]', 'g');
        if ((main.match(re) || []).length >= 2) { console.log('  字义重复', key, ch); S.dup++; }
      }
    }
  }

  lens.sort((a, b) => a - b);
  const tot = Object.values(S).reduce((a, b) => a + b, 0);
  console.log(`门${door}　位 ${done.length}/${POS.length}　条 ${n}　应有 ${done.length * 21}`);
  console.log(`  缺${S.miss} 判定不符${S.bad} 无引文${S.noq} 引文重复${S.dupq} 过短${S.short} ` +
              `去处未见${S.nodest} 字义重复${S.dup} 禁语${S.ban} 互斥${S.xor} 字义不一${S.glyph} 四门漏说${S.lay4}\n  ` +
              `母本字义不符${S.csvglyph} 母本④层不符${S.lay4b}　${tot ? '✗' : '✓'}`);
  if (lens.length) console.log(`  主句 最短${lens[0]} 最长${lens[lens.length-1]} 均${Math.round(lens.reduce((a,b)=>a+b,0)/lens.length)}`);
  return { n, tot, done: done.length, pos: POS.length };
}

// ── 入口 ─────────────────────────────────────────────────────────
const arg = process.argv[2];
const doors = (!arg || arg === 'all')
  ? Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, '0'))
  : [String(arg).padStart(2, '0')];

let sum = 0, bad = 0, any = false;
for (const d of doors) {
  const r = await checkDoor(d);
  if (!r) continue;
  any = true; sum += r.n; bad += r.tot;
}
if (!any) { console.log('未找到任何 正本/门NN.js'); process.exit(2); }
if (doors.length > 1) {
  console.log(`\n=== 合计 ===\n已交 ${sum} 格 ／ 全谱 4620 格 ＝ ${(sum / 4620 * 100).toFixed(1)}%　问题 ${bad}`);
}
process.exit(bad ? 1 : 0);
