// 行棋升降判定 · 单一真源
// 游戏（game.js）与核证脚本（scripts/check-dir.mjs）共用此模块，免得判定逻辑分叉两份。
//
// 口径：升降表「從凡入聖轉惡成善」（《選佛譜》輪相表法第一），是善惡进退之义，
// 不是须弥山上的物理高低——生魔羅天虽在天上，因「煩惑紛陳」而往，不名为升。
//
// 判定分两层：
//   ① SFP_DIR_FIX —— 原文明言升降者，逐条照录（经证优先，不推断）
//   ② 结构启发式 —— 原文未明言者，依净土/恶趣/门序推断
// 凡启发式与原文措辞相抵者，一律以 ① 覆盖；新发现者补进 ① 即可，不改启发式。

// 退修忏法/助道之目标（谱曰「須修/退修/借用」）
export const SFP_RETREAT_DEST = new Set(['作法懺', '取相懺', '無生懺', '五停心']);

// ① 原文明言的升降勘误表：`位id|轮相` → 'up' | 'down'
// 每条须附原文依据（逐字），无依据者不得入表。
//
// 判据以谱注自身用字为准：原文判「降」用**墮／沈／退／貶**，判「升」用**升／生／成／為／證／登**。
// 「惡字下坠」是卷首輪相表法的通则；各位谱注是别例。通则与别例相抵时以别例为准——
// 如【味禪】「那那等三……故**墮**鬼畜脩羅。那陀雖不失禪……必**成**十仙。謨陀亦不失禪……必**為**魔種」，
// 同段之内「墮」与「成／為」分明，可见惡字组未必尽降。
//
// 现为空表：全谱 2692 条行棋逐条核过（scripts/check-dir.mjs），未见原文明言而引擎判反者。
export const SFP_DIR_FIX = {};

// ② 结构启发式
export function sfpDirOf(p, dest, combo, posOrder) {
  const fix = SFP_DIR_FIX[`${p.id}|${combo}`];
  if (fix) return fix.dir;                       // 原文明言者优先

  if (dest.pure && !p.pure) return 'pure';
  // 净土出位皆「登」：莲开见佛证入圣位（谱曰登/证/成），永離退緣无退堕
  if (p.pure && !dest.pure) return 'up';
  const pd = p.door === 2 || p.door === 3, dd = dest.door === 2 || dest.door === 3;
  if (dd && !pd) return 'down';
  // 门2（人道流弊）高于门3（恶趣）
  if (pd && dd && p.door !== dest.door) return dest.door === 2 ? 'up' : 'down';
  if (!pd || !dd) { // 圈外常规：门序定升降；自恶趣出圈皆升
    if (dest.door > p.door) return 'up';
    if (dest.door < p.door) {
      if (pd) return 'up';
      // 回门1：堕十惡因＝降；入出世四学＝闻法发心起修（谱曰「得遵修出世施戒禪慧」）
      if (dest.door === 1) return /十惡$/.test(dest.id) ? 'down' : 'up';
      if (p.door === 5) return 'down'; // 色无色诸天报尽下生（降德贬坠/穷空轮转之殃）
      if (SFP_RETREAT_DEST.has(dest.id)) return 'down'; // 修行/圣位退修忏法助道＝降
      // 還生人道依组定：引業所牵＝降；罪滅福生/感樂報＝升
      if (dest.id === '南贍部洲') return combo && /[那謨]/.test(combo) && !combo.includes('佛') ? 'down' : 'up';
      return 'up'; // 生天/净居/轮王/内院/护法/梵王/三昧皆胜报进修
    }
  }
  // 同门依谱序（无间→畜生是「仗佛性威力」渐出转轻，属升非堕）
  const ord = (x) => posOrder.indexOf(x.id);
  return ord(dest) >= ord(p) ? 'up' : 'down';
}
