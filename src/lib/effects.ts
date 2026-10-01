/**
 * 状態異常・効果の定義と判定(状態異常・効果ページ /mechanics/effects/ と、ヒーロー一覧の効果での絞り込みで共用)。
 * 効果の一覧はここが唯一の定義で、ページ側に手書きの一覧は持たない。パッチでデータが変われば自動で追従する。
 *
 * ■ 判定の材料(すべてパーサーがゲームデータから取り出したもの)
 *   classes … スキル・アイテムが入れ子で持つモディファイアのクラス(src/parsers/modifiers.ts)。
 *             サイレンス・スロウ・移動不能などは、状態の名前ではなくクラスにだけ現れる
 *   states  … モディファイアが付ける状態(STATUS_IMMUNE など)
 *   props   … 数値プロパティの名前。スタンや打ち上げは専用のクラスを持たず、継続時間などの数値でだけ分かる。
 *             値が 0 のものは「持っていない」とみなす(AP強化で初めて値が入るものは via: "upgrade")
 *   purges  … デバフを解除する演出を持つか
 * どれか1つに当たれば、その効果を持つとする。
 *
 * ■ 判定できないもの
 * データに現れない効果(説明文にしか書かれていないもの)は手で付けない。ヘクサフォイルワードの
 * 「スピリットダメージを防ぐ」、リアクティブバリアの「CCされるとバリア」などは対策の欄に出ない。
 *
 * ■ 名前
 * ゲーム内の表記(ローカライズのトークン)を使う。InlineAttribute_* は説明文中の強調語で、4言語そろっている。
 * トークンが無いものだけ辞書(src/i18n/ui/<lang>.ts の effects.names)に書く。
 */
import { t, ability, shopItems, releasedHeroes, formatProperty } from "./data.ts";
import exclusionsJson from "../../data/effect-exclusions.json" with { type: "json" };
import { L } from "../i18n/index.ts";
import { currentLang } from "../i18n/context.ts";
import type { Hero } from "../types/hero.ts";
import type { Item } from "../types/item.ts";
import type { Ability } from "../types/ability.ts";
import type { AbilityProperty } from "../types/property.ts";

export type EffectCategory = "control" | "weaken" | "protect" | "counter";
export const EFFECT_CATEGORIES: EffectCategory[] = ["control", "weaken", "protect", "counter"];

/** 対策の手段(category: "counter" の効果の id) */
type CounterId = "debuff-resist" | "slow-resist" | "purge" | "unstoppable";

export interface EffectDef {
  id: string;
  category: EffectCategory;
  /** 名前のトークン。無ければ辞書の effects.names[id] */
  nameToken?: string;
  classes?: string[];
  states?: string[];
  props?: RegExp;
  purges?: boolean;
  /** スキル・アイテムの横に添える数値(効果時間・強さ)のプロパティ */
  show?: RegExp;
  /** この効果への対策になる手段 */
  counters?: CounterId[];
}

/** 行動を止める効果への対策。アンストッパブルはデータ上 STATUS_IMMUNE を持つ */
const CC_COUNTERS: CounterId[] = ["unstoppable", "debuff-resist", "purge"];

export const EFFECTS: EffectDef[] = [
  // ---- 行動を止める ----
  {
    id: "stun",
    category: "control",
    nameToken: "InlineAttribute_Stun",
    states: ["STUNNED"],
    props: /^(Stun|StunDuration|WallStunDuration|StompStunDuration|StunOnLand|StunTargetOnExplode)$/,
    show: /StunDuration$/,
    counters: CC_COUNTERS,
  },
  {
    id: "sleep",
    category: "control",
    nameToken: "InlineAttribute_Sleep",
    classes: ["modifier_citadel_sleep_dagger_asleep"],
    states: ["IS_ASLEEP"],
    props: /^SleepDuration$/,
    show: /^SleepDuration$/,
    counters: CC_COUNTERS,
  },
  {
    id: "silence",
    category: "control",
    nameToken: "InlineAttribute_Silence",
    classes: ["modifier_citadel_silenced"],
    states: ["SILENCED"],
    props: /^(SilenceDuration|SilenceOnDrain)$/,
    show: /^SilenceDuration$/,
    counters: CC_COUNTERS,
  },
  {
    id: "disarm",
    category: "control",
    nameToken: "Citadel_StatusEffectDisarmed",
    classes: ["modifier_citadel_disarmed"],
    states: ["DISARMED"],
    props: /^(DisarmDuration|HasDisarm|DisarmTargets)$/,
    show: /^DisarmDuration$/,
    counters: CC_COUNTERS,
  },
  {
    id: "immobilize",
    category: "control",
    nameToken: "InlineAttribute_Immobilize",
    classes: ["modifier_citadel_root", "modifier_bookworm_immobilize", "modifier_priest_immobilize"],
    props: /^ImmobilizeDuration$/,
    show: /^ImmobilizeDuration$/,
    counters: CC_COUNTERS,
  },
  {
    id: "knockup",
    category: "control",
    nameToken: "InlineAttribute_KnockUp",
    classes: ["modifier_citadel_psychiclift", "modifier_airlift_grab"],
    props: /^(TossDuration|TossSpeed|TossUpStrength|TossUpMagnitude|LiftHeight|LiftDuration|EnemyHeroTossVelocity)$/,
    show: /^(TossDuration|LiftDuration)$/,
    counters: ["unstoppable"],
  },
  {
    id: "petrify",
    category: "control",
    nameToken: "Citadel_StatusEffectPetrify",
    classes: ["modifier_citadel_petrify"],
    counters: CC_COUNTERS,
  },
  {
    id: "freeze",
    category: "control",
    nameToken: "Citadel_StatusEffectFreeze",
    classes: ["modifier_arctic_blast_freeze"],
    props: /^(FreezeEnemies|InitialFreezeTime)$/,
    counters: CC_COUNTERS,
  },
  {
    id: "curse",
    category: "control",
    nameToken: "Citadel_StatusEffectCurse",
    classes: ["modifier_glitch_debuff"],
    states: ["GLITCHED"],
    counters: ["purge"],
  },
  // ---- 弱める ----
  {
    id: "slow",
    category: "weaken",
    nameToken: "InlineAttribute_Slow",
    classes: ["modifier_slow_base", "modifier_diminishing_slow"],
    states: ["SLOWED"],
    props: /^(SlowPercent|MoveSlowPercent|MovementSpeedSlow|MovementSlowPct|EnemySlowPct|SlowPercentPerStack|AuraSlowAmount|ChannelSlowPercent|SpinSlowPercent|ClubSlowPercent|MoveSpeedSlowPct)$/,
    show: /^(SlowPercent|MoveSlowPercent|MovementSpeedSlow|SlowDuration)$/,
    counters: ["unstoppable", "slow-resist", "purge"],
  },
  {
    id: "fire-rate-slow",
    category: "weaken",
    nameToken: "InlineAttribute_ReducedFireRate",
    props: /^(FireRateSlow|MaxFireRateSlowPercent)$/,
    show: /^(FireRateSlow|FireRateSlowDuration)$/,
    counters: ["purge"],
  },
  {
    id: "heal-reduction",
    category: "weaken",
    props: /^(HealAmpReceivePenaltyPercent|HealAmpRegenPenaltyPercent)$/,
    show: /^HealAmpReceivePenaltyPercent$/,
    counters: ["purge"],
  },
  {
    id: "bullet-resist-down",
    category: "weaken",
    nameToken: "upgrade_bullet_resist_shredder/modifier_bullet_armor_shredder_proc/modifier_bullet_armor_shredder",
    props: /^(BulletResistReduction|BulletArmorReduction)$/,
    show: /^(BulletResistReduction|BulletArmorReduction)$/,
    counters: ["purge"],
  },
  {
    id: "spirit-resist-down",
    category: "weaken",
    nameToken: "modifier_power_surge_debuff",
    props: /^(MagicResistReduction|TechResistDebuff|TechArmorDamageReduction)$/,
    show: /^(MagicResistReduction|TechResistDebuff)$/,
    counters: ["purge"],
  },
  {
    id: "burn",
    category: "weaken",
    nameToken: "Citadel_StatusEffectBurn",
    classes: ["modifier_afterburn_dot", "modifier_spirit_burn_dot"],
    props: /^(BurnDuration|BurnDurationBase)$/,
    counters: ["purge"],
  },
  {
    id: "bleed",
    category: "weaken",
    nameToken: "Citadel_StatusEffectBleed",
    classes: ["modifier_item_bleeding_bullets_damageovertime"],
    props: /^(BleedDuration|BleedDPSPerStack)$/,
    counters: ["purge"],
  },
  // ---- 自分を守る・強める ----
  {
    id: "unstoppable",
    category: "protect",
    nameToken: "Citadel_StatusEffectUnstoppable",
    classes: ["modifier_unstoppable"],
    states: ["UNSTOPPABLE", "STATUS_IMMUNE"],
    props: /^UnstoppableWhileChanneling$/,
  },
  {
    id: "invisible",
    category: "protect",
    nameToken: "Citadel_StatusEffectInvisible",
    classes: ["modifier_invis", "modifier_citadel_smoke_bomb_invis"],
    props: /^(InvisDuration|InvisFadeToDuration)$/,
    show: /^InvisDuration$/,
  },
  {
    id: "bullet-evasion",
    category: "protect",
    nameToken: "EvasionPercent_label",
    props: /^EvasionPercent$/,
    show: /^EvasionPercent$/,
  },
  {
    id: "barrier",
    category: "protect",
    nameToken: "CombatBarrier_label",
    props: /^(CombatBarrier|VexBarrierCombatBarrier|BarrierDuration)$/,
    show: /^(CombatBarrier|VexBarrierCombatBarrier)$/,
  },
  // ---- 解除・軽減の手段 ----
  {
    id: "purge",
    category: "counter",
    purges: true,
    props: /^(PurgeOnCast|DispelOnUse|ReduceDebuffs)$/,
  },
  {
    id: "debuff-resist",
    category: "counter",
    nameToken: "StatusResistancePercent_label",
    props: /^StatusResistancePercent$/,
    show: /^StatusResistancePercent$/,
  },
  {
    id: "slow-resist",
    category: "counter",
    nameToken: "SlowResistancePercent_label",
    props: /^(SlowResistancePercent|SlowResistance)$/,
    show: /^(SlowResistancePercent|SlowResistance)$/,
  },
];

/**
 * データで区別できない誤判定を外す手動リスト(data/effect-exclusions.json)。効果 id → 外す実ID。
 * 今はノックアップの「自分が跳ぶ・味方を運ぶ・物を投げる」ものだけ
 */
const EXCLUDED: Record<string, Set<string>> = Object.fromEntries(
  Object.entries((exclusionsJson as { effects: Record<string, { id: string }[]> }).effects).map(([k, list]) => [
    k,
    new Set(list.map((x) => x.id)),
  ]),
);

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));
export const effectById = (id: string): EffectDef | undefined => BY_ID.get(id);

/** 効果の名前(描いているページの言語で) */
export function effectName(e: EffectDef): string {
  const dict = (L().effects.names as Record<string, string | undefined>)[e.id];
  const name = e.nameToken ? t(e.nameToken, dict ?? e.id) : (dict ?? e.id);
  // InlineAttribute_* は文中用の語なので、英語では小文字で始まる(slow / stun)。見出しにするので先頭だけ大文字にする
  return name.replace(/^[a-z]/, (c) => c.toUpperCase());
}

type Subject = Pick<Ability, "properties" | "upgrades" | "modifiers">;

/**
 * そのスキル・アイテムがこの効果を持つか。持たなければ null。
 * via は "base"(素の性能)か "upgrade"(AP強化で付く。スキルのみ)
 */
export function effectMatch(e: EffectDef, s: Subject): { via: "base" | "upgrade"; reason: string } | null {
  const m = s.modifiers;
  const cls = e.classes && m?.classes.find((c) => e.classes!.includes(c));
  if (cls) return { via: "base", reason: cls };
  const st = e.states && m?.states.find((x) => e.states!.includes(x));
  if (st) return { via: "base", reason: st };
  if (e.purges && m?.purges) return { via: "base", reason: "purge" };
  if (e.props) {
    for (const [name, p] of Object.entries(s.properties ?? {})) {
      if (e.props.test(name) && p.value !== null && Number.isFinite(p.value) && p.value !== 0) {
        return { via: "base", reason: name };
      }
    }
    for (const tier of s.upgrades ?? []) {
      for (const u of tier) {
        if (e.props.test(u.property) && Number(u.bonus) !== 0 && Number.isFinite(Number(u.bonus))) {
          return { via: "upgrade", reason: u.property };
        }
      }
    }
  }
  return null;
}

/** 添える数値(「継続時間 1.5秒」など)。値が 0 のものは出さない */
function shownValues(e: EffectDef, props: Record<string, AbilityProperty>): EffectValue[] {
  if (!e.show) return [];
  const out: EffectValue[] = [];
  for (const [name, p] of Object.entries(props)) {
    if (!e.show.test(name) || p.value === null || !Number.isFinite(p.value) || p.value === 0) continue;
    const f = formatProperty(name, p);
    out.push({ label: f.label, value: f.value });
  }
  return out.slice(0, 2);
}

/** 添える数値1つ(「スタン継続時間」「1.25秒」) */
export interface EffectValue {
  label: string;
  value: string;
}

export interface EffectAbilityRow {
  hero: Hero;
  abilityKey: string;
  via: "base" | "upgrade";
  /** 当たった判定材料(クラス名・状態・プロパティ名)。検算用 */
  reason: string;
  values: EffectValue[];
}
export interface EffectItemRow {
  item: Item;
  reason: string;
  values: EffectValue[];
}
export interface EffectEntry {
  def: EffectDef;
  abilities: EffectAbilityRow[];
  items: EffectItemRow[];
}

/** ヒーローの署名スキル(Ability1〜4。武器・近接などは除く) */
function signatureAbilities(hero: Hero): string[] {
  return hero.abilities.filter((a) => String(a.slot).startsWith("Signature")).map((a) => a.abilityKey);
}

/** 添える数値のラベルは描いているページの言語で引くので、結果は言語ごとに持つ */
const cache = new Map<string, EffectEntry[]>();
/** 全効果について、持っているスキル・アイテム。ページとヒーロー一覧の絞り込みの両方がこれを使う */
export function effectIndex(): EffectEntry[] {
  const lang = currentLang();
  const hit = cache.get(lang);
  if (hit) return hit;
  const heroes = releasedHeroes();
  const items = shopItems();
  const built = EFFECTS.map((def) => {
    const abilities: EffectAbilityRow[] = [];
    for (const hero of heroes) {
      for (const key of signatureAbilities(hero)) {
        const a = ability(key);
        if (!a || EXCLUDED[def.id]?.has(key)) continue;
        const hit = effectMatch(def, a);
        if (hit) {
          abilities.push({ hero, abilityKey: key, via: hit.via, reason: hit.reason, values: shownValues(def, a.properties) });
        }
      }
    }
    const itemRows: EffectItemRow[] = [];
    for (const it of items) {
      if (EXCLUDED[def.id]?.has(it.id)) continue;
      const hit = effectMatch(def, it);
      if (hit) itemRows.push({ item: it, reason: hit.reason, values: shownValues(def, it.properties) });
    }
    return { def, abilities, items: itemRows };
  });
  cache.set(lang, built);
  return built;
}

/** スキル・アイテムの各ページに出すバッジ1つ分 */
export interface EffectBadge {
  /** 効果の id(効果ページの #id) */
  id: string;
  category: EffectCategory;
  name: string;
  /** 効果ページに出している数値の先頭(「1.25秒」)。無ければ null */
  value: string | null;
  /** AP強化で付く効果(スキルのみ) */
  viaUpgrade: boolean;
}

const badgeCache = new Map<string, { abilities: Map<string, EffectBadge[]>; items: Map<string, EffectBadge[]> }>();
/** 実ID → そのスキル・アイテムが持つ効果。effectIndex() を裏返したもので、判定は増やさない */
function badgeIndex() {
  const lang = currentLang();
  const hit = badgeCache.get(lang);
  if (hit) return hit;
  const abilities = new Map<string, EffectBadge[]>();
  const items = new Map<string, EffectBadge[]>();
  for (const e of effectIndex()) {
    const base = { id: e.def.id, category: e.def.category, name: effectName(e.def) };
    for (const r of e.abilities) {
      const list = abilities.get(r.abilityKey) ?? [];
      if (!list.some((b) => b.id === base.id)) list.push({ ...base, value: r.values[0]?.value ?? null, viaUpgrade: r.via === "upgrade" });
      abilities.set(r.abilityKey, list);
    }
    for (const r of e.items) {
      const list = items.get(r.item.id) ?? [];
      list.push({ ...base, value: r.values[0]?.value ?? null, viaUpgrade: false });
      items.set(r.item.id, list);
    }
  }
  const built = { abilities, items };
  badgeCache.set(lang, built);
  return built;
}
/** そのスキルが持つ効果(効果ページの並び順) */
export const abilityEffects = (abilityKey: string): EffectBadge[] => badgeIndex().abilities.get(abilityKey) ?? [];
/** そのアイテムが持つ効果(効果ページの並び順) */
export const itemEffects = (itemId: string): EffectBadge[] => badgeIndex().items.get(itemId) ?? [];

/**
 * ヒーロー一覧の絞り込み用: 効果 id → ヒーローID → [スキルの実ID, AP強化で付くなら 1]。
 * 効果ページの「持っているスキル」と同じ effectIndex() から作るので、両者は必ず一致する
 */
export function effectHeroAbilities(): Record<string, Record<number, [string, 0 | 1][]>> {
  const out: Record<string, Record<number, [string, 0 | 1][]>> = {};
  for (const e of effectIndex()) {
    if (e.abilities.length === 0) continue;
    const byHero: Record<number, [string, 0 | 1][]> = {};
    for (const r of e.abilities) (byHero[r.hero.id] ??= []).push([r.abilityKey, r.via === "upgrade" ? 1 : 0]);
    out[e.def.id] = byHero;
  }
  return out;
}
