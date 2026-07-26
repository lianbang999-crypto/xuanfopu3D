// 选佛谱行棋引擎 · 浏览器与 Cloudflare Durable Object 共用
//
// 这里只计算项目的“操作结果”，不负责 UI、动画、存档或网络。
// 《選佛譜》原文事实仍在 sfp-data.js；升降判定仍以 sfp-rules.js 为单一真源。
import { SFP_POS } from './sfp-data.js';
import { sfpDirOf } from './sfp-rules.js';

export const SFP_FACE_ORDER = '那謨阿彌陀佛';
export const SFP_PROTOCOL_VERSION = 2;

const POS_ORDER = SFP_POS.map((p) => p.id);
const POS_BY = Object.fromEntries(SFP_POS.map((p) => [p.id, p]));
const START_BY = Object.fromEntries(SFP_POS.filter((p) => p.start).map((p) => [p.start, p]));
const GRANT_CN = ['', '一', '二', '三', '四'];

export function canonicalSfpCombo(a, b) {
  return SFP_FACE_ORDER.indexOf(a) <= SFP_FACE_ORDER.indexOf(b) ? `${a}${b}` : `${b}${a}`;
}
export function isSfpCombo(combo) {
  return typeof combo === 'string'
    && combo.length === 2
    && SFP_FACE_ORDER.includes(combo[0])
    && SFP_FACE_ORDER.includes(combo[1])
    && canonicalSfpCombo(combo[0], combo[1]) === combo;
}

export function emptySfpPlayerState() {
  return { pos: null, n: 0, bonus: 0, done: false, doneAt: 0 };
}

// 解析“一次实际掷轮”。act 是落位后的自动行法，不增加掷数；贈掷只增加
// bonus 队列，仍由当前操作者继续掷，绝不转给下一位。
export function resolveSfpToss(input, combo, now = Date.now()) {
  if (!isSfpCombo(combo)) throw new Error(`invalid sfp combo: ${combo}`);

  const state = {
    pos: input?.pos && POS_BY[input.pos] ? input.pos : null,
    n: Math.max(0, Number(input?.n) || 0) + 1,
    bonus: Math.max(0, Number(input?.bonus) || 0),
    done: !!input?.done,
    doneAt: Number(input?.doneAt) || 0,
  };
  if (state.bonus > 0) state.bonus--;

  const steps = [];
  const apply = (face, automatic = false, depth = 0) => {
    if (depth > 12) throw new Error('sfp automatic chain overflow');

    if (!state.pos) {
      const start = START_BY[face];
      if (!start) {
        steps.push({ combo: face, automatic, kind: 'stay', from: null, to: null, dir: 'stay', bonus: 0 });
        return;
      }
      state.pos = start.id;
      steps.push({
        combo: face, automatic, kind: 'start', from: null, to: start.id,
        dir: 'start', bonus: 0, text: `起行 · 因地「${start.name}」`,
      });
      return;
    }

    const from = POS_BY[state.pos];
    if (!from || from.terminal) return;
    const move = (from.moves || []).find((candidate) => candidate.c.includes(face));
    if (!move) {
      steps.push({
        combo: face, automatic, kind: 'stay', from: from.id, to: from.id,
        dir: 'stay', bonus: 0, text: `安住「${from.name}」`,
      });
      return;
    }

    const bonus = Math.max(0, Number(move.bonus) || 0);
    state.bonus += bonus;
    if (!move.to) {
      steps.push({
        combo: face, automatic, kind: 'grant', from: from.id, to: from.id,
        dir: 'bonus', bonus, text: `贈${GRANT_CN[bonus] || bonus}掷`,
      });
      return;
    }

    const destination = POS_BY[move.to];
    if (!destination) throw new Error(`unknown sfp destination: ${move.to}`);
    const dir = sfpDirOf(from, destination, face, POS_ORDER);
    state.pos = destination.id;
    steps.push({
      combo: face, automatic, kind: 'move', from: from.id, to: destination.id,
      dir, bonus,
      text: `「${from.name}」→「${destination.name}」${bonus ? `，贈${GRANT_CN[bonus] || bonus}掷` : ''}`,
    });
    if (move.act) apply(move.act, true, depth + 1);
  };

  apply(combo);
  const terminal = state.pos ? POS_BY[state.pos]?.terminal : false;
  if (terminal) {
    state.done = true;
    state.doneAt = state.doneAt || now;
    state.bonus = 0;
  }

  return { combo, state, steps };
}
