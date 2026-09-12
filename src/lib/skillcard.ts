/**
 * スキルを「ゲーム内のスキルカード」に近い形へ整理する。
 *
 * 出しているのは abilities.json(= Valve の abilities.vdata 由来)の値だけ。
 * どれを見出しに出すかの並びはこちらで決めているが、数値・ラベル・単位は
 * すべてゲームのトークンをそのまま使う(勝手な訳・単位付けはしない)。
 */

import type { Ability } from "../types/ability.ts";
import type { AbilityProperty } from "../types/property.ts";
import { t, formatProperty, describe } from "./data.ts";

export interface CardRow {
  label: string;
  value: string;
  /** StatIcon.astro に渡す種別。ゲーム本編の見た目に寄せる装飾で、無ければ null */
  icon: StatIconKind | null;
}
export interface DamageRow {
  label: string;
  value: string;
  /** スピリットパワー係数(m_flStatScale)。null なら非スケーリング */
  scale: number | null;
  icon: StatIconKind | null;
}
export interface UpgradeTier {
  /** アビリティポイント消費(1 / 2 / 5) */
  ap: number;
  rows: CardRow[];
  /**
   * ゲーム側が用意した、この段階専用の説明文(`<abilityKey>_t{1,2,3}_desc`)。
   * リワークで挙動そのものが変わる段階(例: ヴェナトル ガットショットT3「次の近接強攻撃が
   * 祝福状態になる」)は、rows の数値羅列だけでは説明にならないためこちらを優先表示する。
   * 無ければ null(このトークンが無いアビリティの方が多い。単純な数値強化ならrowsで足りる)。
   */
  description: string | null;
}
export interface SkillCard {
  meta: CardRow[];
  damage: DamageRow[];
  effects: CardRow[];
  upgrades: UpgradeTier[];
}

/** 見出しに出すメタ項目。ここに挙げた順で、値が実質ゼロでないものだけ出す */
const META: Array<[prop: string, label: string]> = [
  ["AbilityCharges", "チャージ"],
  ["AbilityCooldown", "クールダウン"],
  ["AbilityCastRange", "射程"],
  ["AbilityDuration", "効果時間"],
  ["AbilityCastDelay", "詠唱ディレイ"],
  ["AbilityChannelTime", "チャネル時間"],
];
const META_NAMES = new Set(META.map(([p]) => p));
const AP_BY_TIER = [1, 2, 5];

/**
 * ゲーム内UIに寄せた装飾アイコンの種別。実データが持つ m_strCSSClass
 * (properties.ts で cssClass として素通ししている値)を、その意味ごとに
 * まとめただけ。cssClass はゲーム側の分類なので、ここでの対応付けが
 * 間違っていてもラベル・数値そのものは影響を受けない(見た目だけの話)。
 * 見た目のアイコン自体はまだ抽出できていない(architecture.html参照)ので、
 * 簡易SVG(StatIcon.astro)で代用している。
 */
export type StatIconKind =
  | "damage"
  | "heal"
  | "duration"
  | "cooldown"
  | "range"
  | "cast"
  | "speed"
  | "resist"
  | "slow"
  | "spirit"
  | "ap";
const ICON_BY_CSS_CLASS: Record<string, StatIconKind> = {
  tech_damage: "damage",
  bullet_damage: "damage",
  damage: "damage",
  melee_damage: "damage",
  healing: "heal",
  health: "heal",
  duration: "duration",
  time: "duration",
  cooldown: "cooldown",
  charge_cooldown: "cooldown",
  range: "range",
  distance: "range",
  radius: "range",
  cast: "cast",
  move_speed: "speed",
  fire_rate: "speed",
  fireRate: "speed",
  stamina_recovery: "speed",
  bullet_armor_up: "resist",
  bullet_armor_down: "resist",
  tech_armor_up: "resist",
  tech_armor_down: "resist",
  combat_barrier: "resist",
  slow: "slow",
};
function iconFor(p: AbilityProperty | undefined): StatIconKind | null {
  return p?.cssClass ? (ICON_BY_CSS_CLASS[p.cssClass] ?? null) : null;
}

/** "0" / "-1" / "0m" など実質ゼロか */
function isZero(p: AbilityProperty | undefined): boolean {
  if (!p) return true;
  if (p.value !== null) return p.value === 0 || p.value === -1;
  return /^-?(0|0\.0|-1|-1\.0)/.test(String(p.rawValue).trim());
}

/** heroName: 説明文中の {s:hero_name} を解決するためのヒーロー表示名(あれば) */
export function skillCard(ab: Ability, heroName = ""): SkillCard {
  const props = ab.properties ?? {};
  const extra: Record<string, string> = heroName ? { hero_name: heroName } : {};

  // アップグレードで初めて増えるチャージ(基礎0)も見出しに出したいので拾っておく
  const chargeFromUpgrade = (ab.upgrades ?? []).some((tier) =>
    tier.some((u) => u.property === "AbilityCharges"),
  );

  const meta: CardRow[] = [];
  for (const [prop, label] of META) {
    const p = props[prop];
    if (!p) continue;
    if (isZero(p) && !(prop === "AbilityCharges" && chargeFromUpgrade)) continue;
    const { value } = formatProperty(prop, p);
    meta.push({ label, value, icon: iconFor(p) });
  }

  const damage: DamageRow[] = [];
  for (const [name, p] of Object.entries(props)) {
    if (!p.isAbilityDamage || p.value === null) continue;
    damage.push({
      label: t(`${p.labelOverride ?? name}_label`, "ダメージ"),
      value: formatProperty(name, p).value,
      scale: p.scale?.statScale ?? null,
      icon: iconFor(p) ?? "damage",
    });
  }

  const damageNames = new Set(
    Object.entries(props).filter(([, p]) => p.isAbilityDamage).map(([n]) => n),
  );
  const effects: CardRow[] = [];
  for (const [name, p] of Object.entries(props)) {
    if (META_NAMES.has(name) || damageNames.has(name)) continue;
    if (isZero(p)) continue;
    // ラベルがローカライズに無いもの(内部係数など)は出さない。
    // labelOverride(m_strLocTokenOverride)があれば、ラベルはそちらの名前で引く
    // (例: ability_doorman_bomb の "ProjectileFuse" は "BellLifetime_label" しか無い)
    if (!t(`${p.labelOverride ?? name}_label`, "")) continue;
    effects.push({ ...formatProperty(name, p), icon: iconFor(p) });
  }

  const upgrades: UpgradeTier[] = (ab.upgrades ?? []).map((tier, i) => {
    // この段階の bonus を rawValue として重ね、{s:プロパティ名} をこの段階の増分に解決する
    // (base の値ではなく)。例: t2_desc の "{s:AbilityCooldown}秒" は -10 に解決してほしい。
    // labelOverride も引き継ぐ: describe() 側の {s:BellLifetime} のような override名参照が
    // この段階の bonus 値を見つけられるようにする。
    const bonusAsProps: Record<string, { rawValue: string; labelOverride: string | null }> = {};
    for (const u of tier) {
      bonusAsProps[u.property] = {
        rawValue: String(u.bonus),
        labelOverride: props[u.property]?.labelOverride ?? null,
      };
    }
    const description =
      describe(`${ab.id}_t${i + 1}_desc`, { ...props, ...bonusAsProps }, "", extra) || null;
    return {
      ap: AP_BY_TIER[i] ?? i + 1,
      description,
      rows: tier.map((u) => {
        const lookupName = props[u.property]?.labelOverride ?? u.property;
        const post = t(`${lookupName}_postfix`, "");
        const b = String(u.bonus);
        const sign = b.startsWith("-") ? "" : "+";
        // bonus が "10m" のように単位付きのことがある。postfix を足して "10mm" にしない
        const tail = post && !b.endsWith(post) ? post : "";
        return {
          label: t(`${lookupName}_label`, u.property),
          value: `${sign}${b}${tail}`,
          icon: iconFor(props[u.property]),
        };
      }),
    };
  });

  return { meta, damage, effects, upgrades };
}
