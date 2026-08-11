// 選佛譜正本 API · Cloudflare Worker
//
// 蕅益智旭《選佛譜》六卷（1653，公版古籍）十五門・二百二十位・四六二〇格，
// 連同本項目逐格校審的白話正本、逐格所繫譜曰引文、全書原文與各層白話，
// 一併作只讀 JSON 接口對外開放。
//
// 全量數據打進 bundle（api/src/canon.js，626 KB），故無 KV／D1／檢索依賴，
// 冷啟即答。邊緣緩存走 Cache API 顯式存取（Worker 站在緩存之前，光靠響應頭不進緩存）。

import {
  META, COMBOS, DOORS, DOORBH, POS, POSBH, POSTBH, FRONT, TEXT,
  PLAIN, CITE, CELLS, STAT,
} from './canon.js';

const VERSION = '1.1.0';
const VERDICT = ['行', '不行', '贈擲', '無行法'];

// ── 六字定诠 · 卷首〈輪相表法第一〉四層義 ──────────────────────
// 一切判斷之根。四層何者當令，逐位核定，不得通套（詳 正本/四层义归属.md）。
const GLYPHS = {
  那: { 善恶: '惡', 二惑: '見煩惱（分別惑・見惑・見所斷）', 四善: null, 四門: null },
  謨: { 善恶: '惡', 二惑: '愛煩惱（俱生惑・思惑・修所斷）', 四善: null, 四門: null },
  阿: { 善恶: '善', 二惑: null, 四善: '施善', 四門: '生滅門（藏教・三乘鈍根）' },
  彌: { 善恶: '善', 二惑: null, 四善: '戒善', 四門: '無生滅門（通教・三乘利根）' },
  陀: { 善恶: '善', 二惑: null, 四善: '定善', 四門: '次第門（別教・大乘鈍根）' },
  佛: { 善恶: '善', 二惑: null, 四善: '善慧（阿彌陀＝有漏善，佛＝無漏善）', 四門: '圓頓門（圓教・大乘利根）' },
};

// ── 繁簡歸一：用戶多以簡體檢索，底本是繁體 ────────────────────
const S2T = { 谟: '謨', 弥: '彌' };
const normCombo = (s) => String(s || '').replace(/[谟弥]/g, (c) => S2T[c]);

// ── 檢索表：位名（繁・簡・正式全名・序號）皆可定位 ─────────────
const POS_LOOKUP = new Map();
POS.forEach((p, i) => {
  POS_LOOKUP.set(p.n, i);
  if (p.s) POS_LOOKUP.set(p.s, i);
  if (p.f) POS_LOOKUP.set(p.f, i);
  POS_LOOKUP.set(String(i + 1), i);
});
const COMBO_NO = new Map(COMBOS.map((c, i) => [c, i]));
const DOOR_OF = new Map(DOORS.map((d) => [d.no, d]));
const TEXT_OF = new Map(TEXT.map((b, i) => [b.id, i]));
const FRONT_LOOKUP = new Map();
FRONT.forEach((f, i) => { FRONT_LOOKUP.set(f.title, i); if (f.s) FRONT_LOOKUP.set(f.s, i); FRONT_LOOKUP.set(String(i + 1), i); });

const dec = (s) => decodeURIComponent(String(s || '')).trim();
function findPos(raw) {
  const k = dec(raw);
  if (!k) return -1;
  const hit = POS_LOOKUP.get(k);
  return hit === undefined ? -1 : hit;
}
function findCombo(raw) {
  const k = normCombo(dec(raw));
  if (/^\d+$/.test(k)) { const n = Number(k) - 1; return n >= 0 && n < 21 ? n : -1; }
  const hit = COMBO_NO.get(k);
  return hit === undefined ? -1 : hit;
}

// ── 序列化 ───────────────────────────────────────────────────
const doorBrief = (d) => ({ door: d.no, title: d.t, title_s: d.s, juan: d.juan, positions: d.count });

// 白话层：內部字段短名 → 對外可讀名
function vern(b) {
  if (!b) return null;
  const o = { text: b.v };
  if (b.rows) o.rows = b.rows;
  if (b.src) o.source = b.src;
  if (b.ext) o.ext = b.ext;                 // 他經補注（須帶經號行號）
  if (b.self) o.self_authored = true;       // 本項目自撰導語（原譜無此門總說）
  if (b.partial) o.partial = true;          // 白话只承担「这一位是什么」，原文另有长文
  if (b.q) o.uncertain = b.q;               // 存疑留痕
  return o;
}

function posBrief(i) {
  const p = POS[i];
  const o = { no: i + 1, name: p.n, door: p.g, door_title: DOOR_OF.get(p.g).t };
  if (p.s) o.name_s = p.s;
  if (p.f) o.formal_name = p.f;
  return o;
}

// 位注原文三段：義解段｜行法段｜後論。cut 為 d 之偏移，-1 表無。
function posCanon(i) {
  const p = POS[i];
  const [at, pt] = p.cut;
  const end = pt >= 0 ? pt : p.d.length;
  return {
    full: p.d,
    exegesis: at >= 0 ? p.d.slice(0, at) : p.d,        // 義解段：本位是什麼
    practice: at >= 0 ? p.d.slice(at, end) : null,     // 行法段：逐組輪相判語（原譜無者為 null）
    postscript: pt >= 0 ? p.d.slice(pt) : null,        // 後論：不屬任何一相的通論或問答（全譜 6 位）
  };
}

function posFull(i) {
  const p = POS[i];
  const o = posBrief(i);
  o.anchor = p.a;                     // 須彌山十法界世界地圖之錨點
  if (p.heads) o.headings = p.heads;  // 題下標目（全譜僅門十五「佛」有六句）
  if (p.start) o.start_combo = p.start;
  if (p.pure) o.pure = true;
  if (p.terminal) o.terminal = true;
  o.canon = posCanon(i);
  o.definition = p.d;                 // v1.0 既有欄位，等同 canon.full，留作兼容
  o.vernacular = vern(POSBH[i]);      // 位注白话（本項目手譯）
  const post = POSTBH[String(i)];
  o.postscript_vernacular = post ? vern(post) : null;
  return o;
}

function cell(pi, ci) {
  const [v, to, bonus, pl, ct] = CELLS[pi][ci];
  const p = POS[pi];
  const o = {
    door: p.g,
    door_title: DOOR_OF.get(p.g).t,
    position_no: pi + 1,
    position: p.n,
    combo_no: ci + 1,
    combo: COMBOS[ci],
    first: COMBOS[ci][0],
    second: COMBOS[ci][1],
    verdict: VERDICT[v],
  };
  if (v === 0) {
    o.to = POS[to].n;
    o.to_no = to + 1;
    o.to_door = POS[to].g;
    o.direction = POS[to].g > p.g ? '升' : POS[to].g < p.g ? '降' : '平';
  } else {
    o.to = null;
  }
  o.bonus = bonus;                // 贈擲數：0 表非贈擲
  o.plain = PLAIN[pl];            // 白話正本（本項目所撰，非原文）
  o.cite = CITE[ct];              // 該格所繫譜曰逐字引文
  return o;
}

function textBlock(i) {
  const b = TEXT[i];
  const o = {
    id: b.id, juan: b.juan, line: b.line, section: b.sec,
    kind: b.kind, title: b.title, text: b.text,
  };
  if (b.empty) o.empty = true;    // 母本錨句未取到正文（全書 2 塊），如實標明，不以他文冒充
  if (b.terms) o.terms = b.terms;
  if (b.note) o.note = b.note;
  if (b.pos !== undefined) { o.position = POS[b.pos].n; o.position_no = b.pos + 1; }
  return o;
}

const frontItem = (i) => {
  const f = FRONT[i];
  return { no: i + 1, juan: f.juan, title: f.title, title_s: f.s, text: f.text, vernacular: vern(f.bh) };
};

// ── 響應 ─────────────────────────────────────────────────────
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};
const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

function json(data, { status = 200, cache = CACHE } = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
      'x-api-version': VERSION,
      ...CORS,
    },
  });
}
const fail = (status, message, hint) =>
  json({ error: { status, message, ...(hint ? { hint } : {}) } }, { status, cache: 'no-store' });

function paginate(arr, url, dflt = 50, max = 500) {
  const limit = Math.min(max, Math.max(1, Number(url.searchParams.get('limit')) || dflt));
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const total = arr.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = (page - 1) * limit;
  return { slice: arr.slice(from, from + limit), meta: { total, page, pages, limit, has_more: page < pages } };
}

// ── 入口 ─────────────────────────────────────────────────────
//
// Worker 生成的響應**不會**自動進 Cloudflare 邊緣緩存——Worker 站在緩存之前，
// 光靠 Cache-Control 響應頭只管得住瀏覽器那一側。故此處顯式走 Cache API：
// 命中即直接吐出，不再跑一遍路由與序列化。定本不變，緩存可放心長存。
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return fail(405, `方法 ${request.method} 不受支持；本接口只讀。`);
    }
    // caches 僅在 Workers 運行時存在；本地自檢（純 Node）繞過，路由邏輯不受影響
    const edge = typeof caches !== 'undefined' ? caches.default : null;
    const key = new Request(new URL(request.url).toString(), { method: 'GET' });
    if (edge) {
      const hit = await edge.match(key);
      if (hit) { const r = new Response(hit.body, hit); r.headers.set('x-cache', 'HIT'); return r; }
    }

    const res = await handle(request);
    if (edge && res.status === 200) {
      res.headers.set('x-cache', 'MISS');
      const store = res.clone();
      if (ctx?.waitUntil) ctx.waitUntil(edge.put(key, store)); else await edge.put(key, store);
    }
    return res;
  },
};

// ── 路由 ─────────────────────────────────────────────────────
async function handle(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const seg = path.split('/').filter(Boolean);

  try {
    // ── 自述索引 ──
    if (path === '/' || path === '/v1') {
      return json({
        name: '選佛譜正本 API',
        version: VERSION,
        description:
          '蕅益智旭《選佛譜》六卷（1653）十五門・二百二十位・四六二〇格全量正本，'
          + '連同全書原文七萬六千字與逐層白話。'
          + '底本 CBETA 大藏經補編第24冊 No.136；白話與逐格引文為本項目校審所撰。',
        license: '底本為公版古籍；白話正本可自由取用，煩請註明出處。',
        statistics: STAT,
        endpoints: {
          'GET /v1/meta': '譜之總說（六字輪相、大師自敘）與統計',
          'GET /v1/glyphs': '六字定诠四層義（卷首〈輪相表法第一〉）',
          'GET /v1/combos': '二十一輪相',
          'GET /v1/doors': '十五門',
          'GET /v1/doors/{no}': '單門（門首總說原文＋門義白話＋所轄諸位）',
          'GET /v1/positions': '二百二十位（?door= 篩選・分頁）',
          'GET /v1/positions/{name}': '單位（原文三段＋位注白話＋二十一格全）',
          'GET /v1/rules': '四六二〇格（?door= ?position= ?combo= ?verdict= ?to= 篩選・分頁）',
          'GET /v1/rules/{position}/{combo}': '單格',
          'GET /v1/front': '卷首卷末四篇（原文＋白話）',
          'GET /v1/front/{title}': '單篇',
          'GET /v1/text': '全書原文 692 塊（?juan= ?kind= ?section= ?position= 篩選・分頁）',
          'GET /v1/text/{id}': '單塊',
          'GET /v1/search?q=': '全文檢索（?in=position|plain|cite|vernacular|text）',
          'GET /v1/export': '全量下載（?include=text 併出全書原文）',
          'GET /openapi.json': 'OpenAPI 3.1 規格',
        },
        notes: [
          '位名可用繁體、簡體、正式全名或序號（1–220）。',
          '輪相可用繁體、簡體或序號（1–21）；二十一相之序為標準十五序後接相雜六相。',
          '判定四種：行・不行・贈擲・無行法。無行法專指第十五門終局——本無輪相行法，非此路不通。',
          '位注原文分三段：義解段（這一位是什麼）、行法段（逐組輪相判語，原譜八十位無此段）、'
          + '後論（不屬任何一相的通論或問答，全譜六位有）。',
          '凡標 self_authored 者為本項目自撰導語（門1・門2・門15 原譜無總說），不冒「譜曰」。',
        ],
      });
    }

    if (path === '/openapi.json') return json(openapi(url.origin));
    if (path === '/v1/meta') return json({ version: VERSION, source: META, statistics: STAT });
    if (path === '/v1/glyphs') {
      return json({
        note: '卷首〈輪相表法第一〉六字定诠。一位之中何層當令，逐位核定，不得通套。',
        layers: ['善恶', '二惑', '四善', '四門'],
        glyphs: Object.entries(GLYPHS).map(([g, v]) => ({ glyph: g, ...v })),
      });
    }
    if (path === '/v1/combos') {
      return json({
        total: 21,
        note: '前十五為標準序，後六為相雜六相（那阿・謨阿・那彌・謨彌・那陀・謨陀）。',
        combos: COMBOS.map((c, i) => ({
          no: i + 1, combo: c, first: c[0], second: c[1],
          standard: i < 15, senses: { first: GLYPHS[c[0]], second: GLYPHS[c[1]] },
        })),
      });
    }

    // ── 卷首卷末四篇 ──
    if (path === '/v1/front') {
      return json({
        total: FRONT.length,
        note: '〈敘選佛譜敘〉〈輪相表法第一〉〈位次升降第二〉在卷一，〈紀事〉在卷六。'
          + '〈輪相表法第一〉是全譜字義總綱——六字四層表法與七則問答的立義根據全在此篇。',
        sections: FRONT.map((_, i) => frontItem(i)),
      });
    }
    if (seg[0] === 'v1' && seg[1] === 'front' && seg[2]) {
      const k = dec(seg[2]);
      const i = FRONT_LOOKUP.get(k);
      if (i === undefined) {
        return fail(404, `無此篇：${k}`, `四篇為：${FRONT.map((f) => f.title).join('・')}`);
      }
      return json(frontItem(i));
    }

    // ── 全書原文 ──
    if (path === '/v1/text') {
      const q = url.searchParams;
      let idx = TEXT.map((_, i) => i);
      const juan = q.get('juan');
      if (juan) {
        const n = Number(juan);
        if (!(n >= 1 && n <= 6)) return fail(400, `juan 須為 1–6，得 ${juan}`);
        idx = idx.filter((i) => TEXT[i].juan === n);
      }
      const kind = q.get('kind');
      if (kind) {
        const kinds = new Set(TEXT.map((b) => b.kind));
        if (!kinds.has(kind)) return fail(400, `無此 kind：${kind}`, `可用：${[...kinds].join('・')}`);
        idx = idx.filter((i) => TEXT[i].kind === kind);
      }
      const section = q.get('section');
      if (section) idx = idx.filter((i) => TEXT[i].sec === section);
      const position = q.get('position');
      if (position) {
        const pi = findPos(position);
        if (pi < 0) return fail(404, `無此位：${position}`);
        idx = idx.filter((i) => TEXT[i].pos === pi);
      }
      const { slice, meta } = paginate(idx, url);
      return json({ ...meta, blocks: slice.map(textBlock) });
    }
    if (seg[0] === 'v1' && seg[1] === 'text' && seg[2]) {
      const id = dec(seg[2]);
      const i = TEXT_OF.get(id);
      if (i === undefined) return fail(404, `無此塊：${id}`, '塊 id 形如 j1-g01-p01-def，見 /v1/text 列表。');
      return json(textBlock(i));
    }

    // ── 門 ──
    if (path === '/v1/doors') return json({ total: DOORS.length, doors: DOORS.map(doorBrief) });
    if (seg[0] === 'v1' && seg[1] === 'doors' && seg[2]) {
      const no = Number(dec(seg[2]));
      const d = DOOR_OF.get(no);
      if (!d) return fail(404, `無第 ${seg[2]} 門`, '門號為 1–15。');
      return json({
        ...doorBrief(d),
        intro: d.intro,                       // 門首總說原文（門1・2・15 原譜無，為空串）
        vernacular: vern(DOORBH[d.no - 1]),   // 門義白話
        positions: Array.from({ length: d.count }, (_, k) => posBrief(d.from + k)),
      });
    }

    // ── 位 ──
    if (path === '/v1/positions') {
      let idx = POS.map((_, i) => i);
      const door = url.searchParams.get('door');
      if (door) {
        const n = Number(door);
        if (!DOOR_OF.has(n)) return fail(400, `door 須為 1–15，得 ${door}`);
        idx = idx.filter((i) => POS[i].g === n);
      }
      const { slice, meta } = paginate(idx, url, 220);
      return json({ ...meta, positions: slice.map(posBrief) });
    }
    if (seg[0] === 'v1' && seg[1] === 'positions' && seg[2]) {
      const i = findPos(seg[2]);
      if (i < 0) return fail(404, `無此位：${dec(seg[2])}`, '可用位名（繁／簡／全名）或序號 1–220。');
      return json({ ...posFull(i), rules: CELLS[i].map((_, ci) => cell(i, ci)) });
    }

    // ── 格 ──
    if (seg[0] === 'v1' && seg[1] === 'rules' && seg[2] && seg[3]) {
      const pi = findPos(seg[2]);
      if (pi < 0) return fail(404, `無此位：${dec(seg[2])}`);
      const ci = findCombo(seg[3]);
      if (ci < 0) return fail(404, `無此輪相：${dec(seg[3])}`, `二十一相為：${COMBOS.join('・')}`);
      return json({
        ...posBrief(pi),
        definition: POS[pi].d,
        canon: posCanon(pi),
        vernacular: vern(POSBH[pi]),
        rule: cell(pi, ci),
      });
    }
    if (path === '/v1/rules') {
      const q = url.searchParams;
      const list = [];
      const doorF = q.get('door') ? Number(q.get('door')) : null;
      if (doorF !== null && !DOOR_OF.has(doorF)) return fail(400, `door 須為 1–15，得 ${q.get('door')}`);
      const posF = q.get('position') ? findPos(q.get('position')) : -1;
      if (q.get('position') && posF < 0) return fail(404, `無此位：${q.get('position')}`);
      const comboF = q.get('combo') ? findCombo(q.get('combo')) : -1;
      if (q.get('combo') && comboF < 0) return fail(404, `無此輪相：${q.get('combo')}`);
      const verdictF = q.get('verdict');
      if (verdictF && !VERDICT.includes(verdictF)) return fail(400, `verdict 須為：${VERDICT.join('・')}`);
      const toF = q.get('to') ? findPos(q.get('to')) : -1;
      if (q.get('to') && toF < 0) return fail(404, `無此去處：${q.get('to')}`);

      for (let pi = 0; pi < POS.length; pi += 1) {
        if (doorF !== null && POS[pi].g !== doorF) continue;
        if (posF >= 0 && pi !== posF) continue;
        for (let ci = 0; ci < 21; ci += 1) {
          if (comboF >= 0 && ci !== comboF) continue;
          const c = CELLS[pi][ci];
          if (verdictF && VERDICT[c[0]] !== verdictF) continue;
          if (toF >= 0 && c[1] !== toF) continue;
          list.push([pi, ci]);
        }
      }
      const { slice, meta } = paginate(list, url);
      return json({ ...meta, rules: slice.map(([pi, ci]) => cell(pi, ci)) });
    }

    // ── 檢索 ──
    if (path === '/v1/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return fail(400, '缺 q 參數', '例：/v1/search?q=取相懺');
      if (q.length > 60) return fail(400, 'q 過長（上限 60 字）');
      const FIELDS = ['all', 'position', 'plain', 'cite', 'vernacular', 'text'];
      const inField = (url.searchParams.get('in') || 'all').toLowerCase();
      if (!FIELDS.includes(inField)) return fail(400, `in 須為：${FIELDS.join('・')}`);
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 30));
      // 繁簡兩式各掃一遍：底本繁體，用戶多打簡體
      const needles = [...new Set([q, normCombo(q)])];
      const hit = (s) => !!s && needles.some((n) => s.includes(n));
      const hitBH = (b) => !!b && (hit(b.v) || (b.rows || []).some((r) => hit(r.k) || hit(r.v)));
      const want = (f) => inField === 'all' || inField === f;

      const out = { query: q, in: inField, positions: [], rules: [], texts: [] };

      if (want('position') || want('vernacular')) {
        for (let i = 0; i < POS.length && out.positions.length < limit; i += 1) {
          const p = POS[i];
          const inName = hit(p.n) || hit(p.s) || hit(p.f);
          const inCanon = want('position') && hit(p.d);
          const inVern = want('vernacular') && (hitBH(POSBH[i]) || hitBH(POSTBH[String(i)]));
          if (!inName && !inCanon && !inVern) continue;
          out.positions.push({
            ...posBrief(i),
            matched_in: inName ? 'name' : inCanon ? 'canon' : 'vernacular',
            vernacular: inVern ? vern(POSBH[i]) : undefined,
          });
        }
      }

      if (want('plain') || want('cite')) {
        outer:
        for (let pi = 0; pi < POS.length; pi += 1) {
          for (let ci = 0; ci < 21; ci += 1) {
            const [, , , pl, ct] = CELLS[pi][ci];
            const inPlain = want('plain') && hit(PLAIN[pl]);
            const inCite = want('cite') && hit(CITE[ct]);
            if (!inPlain && !inCite) continue;
            out.rules.push({ ...cell(pi, ci), matched_in: inPlain && inCite ? 'both' : inPlain ? 'plain' : 'cite' });
            if (out.rules.length >= limit) break outer;
          }
        }
      }

      if (want('text')) {
        for (let i = 0; i < TEXT.length && out.texts.length < limit; i += 1) {
          const b = TEXT[i];
          if (!hit(b.text) && !hit(b.title) && !hit(b.sec)) continue;
          out.texts.push(textBlock(i));
        }
      }

      out.counts = { positions: out.positions.length, rules: out.rules.length, texts: out.texts.length };
      out.truncated = out.rules.length >= limit || out.texts.length >= limit || out.positions.length >= limit;
      return json(out);
    }

    // ── 全量 ──
    if (path === '/v1/export') {
      const all = [];
      for (let pi = 0; pi < POS.length; pi += 1) for (let ci = 0; ci < 21; ci += 1) all.push(cell(pi, ci));
      const body = {
        version: VERSION,
        source: META,
        statistics: STAT,
        glyphs: GLYPHS,
        combos: COMBOS,
        front: FRONT.map((_, i) => frontItem(i)),
        doors: DOORS.map((d) => ({ ...doorBrief(d), intro: d.intro, vernacular: vern(DOORBH[d.no - 1]) })),
        positions: POS.map((_, i) => posFull(i)),
        rules: all,
      };
      // 全書原文另有 692 塊 76276 字，默認不併出（另有 /v1/text）；?include=text 方帶
      if ((url.searchParams.get('include') || '').toLowerCase() === 'text') {
        body.text = TEXT.map((_, i) => textBlock(i));
      }
      return json(body);
    }

    return fail(404, `無此路徑：${path}`, '見 / 之端點清單。');
  } catch (err) {
    return fail(500, '接口內部出錯', String((err && err.message) || err));
  }
}

// ── OpenAPI 3.1 ──────────────────────────────────────────────
function openapi(origin) {
  const P = (path, summary, params = []) => [path, {
    get: {
      summary,
      parameters: params,
      responses: { 200: { description: 'OK', content: { 'application/json': {} } } },
    },
  }];
  const q = (name, description, schema = { type: 'string' }) => ({ name, in: 'query', description, schema });
  const p = (name, description, schema = { type: 'string' }) =>
    ({ name, in: 'path', required: true, description, schema });

  return {
    openapi: '3.1.0',
    info: {
      title: '選佛譜正本 API',
      version: VERSION,
      description:
        '蕅益智旭《選佛譜》六卷（1653）十五門・二百二十位・四六二〇格全量正本，'
        + '連同全書原文與逐層白話。只讀，無需鑑權。',
      license: { name: '底本公版（CBETA 大藏經補編第24冊 No.136）' },
    },
    servers: [{ url: origin }],
    paths: Object.fromEntries([
      P('/v1/meta', '譜之總說與統計'),
      P('/v1/glyphs', '六字定诠四層義'),
      P('/v1/combos', '二十一輪相'),
      P('/v1/doors', '十五門'),
      P('/v1/doors/{no}', '單門（原文＋門義白話＋諸位）', [p('no', '門號 1–15', { type: 'integer', minimum: 1, maximum: 15 })]),
      P('/v1/positions', '二百二十位', [
        q('door', '按門篩選 1–15', { type: 'integer' }),
        q('page', '頁碼', { type: 'integer' }), q('limit', '每頁條數，上限 500', { type: 'integer' }),
      ]),
      P('/v1/positions/{name}', '單位（原文三段＋白話＋二十一格）', [p('name', '位名（繁／簡／全名）或序號 1–220')]),
      P('/v1/rules', '四六二〇格', [
        q('door', '按門篩選', { type: 'integer' }), q('position', '按位篩選'),
        q('combo', '按輪相篩選'), q('verdict', '按判定篩選', { type: 'string', enum: VERDICT }),
        q('to', '按去處篩選'),
        q('page', '頁碼', { type: 'integer' }), q('limit', '每頁條數，上限 500', { type: 'integer' }),
      ]),
      P('/v1/rules/{position}/{combo}', '單格', [
        p('position', '位名或序號'), p('combo', '輪相（繁／簡）或序號 1–21'),
      ]),
      P('/v1/front', '卷首卷末四篇（原文＋白話）'),
      P('/v1/front/{title}', '單篇', [p('title', '篇名或序號 1–4')]),
      P('/v1/text', '全書原文 692 塊', [
        q('juan', '按卷篩選 1–6', { type: 'integer' }), q('kind', '按塊類篩選'),
        q('section', '按所屬節篩選'), q('position', '按所屬位篩選'),
        q('page', '頁碼', { type: 'integer' }), q('limit', '每頁條數，上限 500', { type: 'integer' }),
      ]),
      P('/v1/text/{id}', '單塊', [p('id', '塊 id，形如 j1-g01-p01-def')]),
      P('/v1/search', '全文檢索', [
        q('q', '檢索詞，上限 60 字'),
        q('in', '限定欄位', { type: 'string', enum: ['all', 'position', 'plain', 'cite', 'vernacular', 'text'] }),
        q('limit', '上限 200', { type: 'integer' }),
      ]),
      P('/v1/export', '全量下載', [q('include', '併出全書原文', { type: 'string', enum: ['text'] })]),
    ]),
  };
}
