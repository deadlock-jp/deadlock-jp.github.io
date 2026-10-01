/**
 * スキル・アイテムの定義に入れ子で書かれたモディファイア(状態異常・バフの本体)から、
 * 効果の判定材料だけを取り出す。何をどう分類するかは src/lib/effects.ts で決め、ここは事実を集めるだけ。
 *
 *   classes … 入れ子のモディファイアの _class(modifier_citadel_silenced / modifier_slow_base など)。
 *             スタン・サイレンス等の状態はゲームのプログラム側でクラスに結び付いていることが多く、
 *             状態の名前がデータに出てこないため、クラス名が一番確かな手がかりになる
 *   states  … m_nEnabledStateMask に書かれた状態(STATUS_IMMUNE / SLOWED など。MODIFIER_STATE_ は外す)
 *   purges  … デバフを解除する演出(中身のある m_PurgeCastParticle など)か、解除専用の効果音を持つか。
 *             ディスペルマジック・インドミタブル・ディバインバリアなどが該当する。解除そのものはデータに数値として出てこない
 *
 * 敵にかけるものと自分にかかるものは区別していない(データ上で区別できない)。区別が要る効果は
 * effects.ts の側で、自分にしか付かないクラス・状態だけを選んで判定する。
 */
import type { Kv3Object, Kv3Value } from "./kv3.ts";

export interface ModifierRefs {
  classes: string[];
  states: string[];
  purges: boolean;
}

export function parseModifierRefs(entry: Kv3Object): ModifierRefs | null {
  const classes = new Set<string>();
  const states = new Set<string>();
  let purges = false;
  const walk = (v: Kv3Value | undefined, top: boolean): void => {
    if (v === null || v === undefined || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, false);
      return;
    }
    const o = v as Kv3Object;
    // 一番外側の _class はスキル・アイテム自身の種類なので入れない
    if (!top && typeof o["_class"] === "string" && o["_class"].startsWith("modifier_")) classes.add(o["_class"]);
    const mask = o["m_nEnabledStateMask"];
    if (typeof mask === "string") {
      for (const s of mask.split("|")) {
        const name = s.trim().replace(/^MODIFIER_STATE_/, "");
        if (name) states.add(name);
      }
    }
    for (const [k, x] of Object.entries(o)) {
      /*
       * 解除の演出(中身のある Purge…Particle)か、解除専用の効果音(m_strPurgeSound)を持つものだけ。
       * 呪いの遺物・コンデンサーは空の演出と共通の効果音(m_PurgeSound = DebuffRemover.Cast。
       * アイテムのひな形から継承したもの)しか持たず、味方の状態異常を解除しないので数えない
       */
      if (typeof x === "string" && x !== "" && (/Purge\w*Particle$/.test(k) || k === "m_strPurgeSound")) purges = true;
      walk(x, false);
    }
  };
  walk(entry, true);
  if (classes.size === 0 && states.size === 0 && !purges) return null;
  return { classes: [...classes].sort(), states: [...states].sort(), purges };
}

/** スキル・アイテムの出力に混ぜる形。判定材料が無ければ何も足さない(差分が騒がしくならないように) */
export function withModifierRefs(entry: Kv3Object): { modifiers?: ModifierRefs } {
  const refs = parseModifierRefs(entry);
  return refs ? { modifiers: refs } : {};
}
