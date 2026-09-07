/**
 * 生データを、ゲーム内の表示と同じ単位・同じ並びに直すところ。
 *
 * ここでやっているのは単位変換と、データが持っている値どうしの割り算だけ。
 * 「%をどう合成するか」のような未確定の計算は一切していない。
 *
 * 単位について: Source 2 の距離は 1 unit = 1 inch。メートルは units / 39.37。
 * インファーナス(hero_inferno)のゲーム内表示と突き合わせて確認した。
 *   弾速     26000 units → 660 m/秒
 *   減衰距離 708.661 / 2165.35 units → 18m / 55m
 *   DPS      5.5 ÷ 0.105 = 52
 *   ダッシュ速度 10m ÷ 0.68秒 = 14.7m
 *   スタミナCD  1 ÷ 0.222222 = 4.5秒
 */

import type { Hero, StatKey } from "../types/hero.ts";
import type { Ability, WeaponInfo } from "../types/ability.ts";
import { t, ability } from "./data.ts";

/** Source の距離単位(inch)をメートルに直す */
export const UNITS_PER_METER = 39.37;
export const toMeters = (units: number | null): number | null =>
  units === null ? null : units / UNITS_PER_METER;

/** 小数の見せ方。整数なら整数のまま、端数があれば指定桁で丸める */
export function num(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r);
}

export interface StatRow {
  label: string;
  value: string;
}

const S = (h: Hero, k: StatKey): number => h.startingStats[k] ?? 0;

/** ウェポンのステータス。ゲーム内「ウェポンステータス」の並びに合わせる */
export function weaponRows(hero: Hero, weapon: WeaponInfo | null): StatRow[] {
  const rows: StatRow[] = [];
  if (weapon) {
    const perSec = weapon.cycleTime ? 1 / weapon.cycleTime : 0;
    rows.push({ label: "弾薬ダメージ", value: num(weapon.bulletDamage) });
    rows.push({ label: "弾／秒", value: num(perSec) });
    rows.push({ label: "弾数", value: num(weapon.clipSize) });
    rows.push({ label: "リロード時間", value: `${num(weapon.reloadDuration)}秒` });
    rows.push({ label: "弾速", value: `${num(toMeters(weapon.bulletSpeed), 0)}m／秒` });
    rows.push({ label: "ヘッドショット倍率", value: `×${num(weapon.crit.bonusStart)}` });
  }
  rows.push({ label: "近接弱攻撃", value: num(S(hero, "ELightMeleeDamage")) });
  rows.push({ label: "近接強攻撃", value: num(S(hero, "EHeavyMeleeDamage")) });
  return rows;
}

/**
 * 武器の表示名。
 *
 * スキルのキー(citadel_weapon_inferno_set)ではローカライズを引けない。
 * ゲーム側のトークンは「citadel_weapon_hero_<ヒーローキー>_set」の形で、
 * しかもヒーローキーとスキルキーが食い違うことがある
 * (hero_atlas のスキルは citadel_weapon_bull_set だが、名前は
 *  citadel_weapon_hero_atlas_set = 「ケースクローズド」)。
 * ヒーローキー側を使うと実装済み38体すべてで引ける。
 */
export function weaponName(hero: Hero): string {
  return t(`citadel_weapon_hero_${hero.key.replace(/^hero_/, "")}_set`, "");
}

/** ウェポンの見出しに出す DPS と減衰距離 */
export function weaponHeadline(
  weapon: WeaponInfo | null,
): { dps: string; falloffStart: string; falloffEnd: string } | null {
  if (!weapon || !weapon.cycleTime || weapon.bulletDamage === null) return null;
  return {
    dps: num((weapon.bulletDamage / weapon.cycleTime) * (weapon.bulletsPerShot || 1), 0),
    falloffStart: `${num(toMeters(weapon.falloff.startRange), 0)}m`,
    falloffEnd: `${num(toMeters(weapon.falloff.endRange), 0)}m`,
  };
}

/** バイタリティのステータス */
export function vitalityRows(hero: Hero): StatRow[] {
  const staminaCd = S(hero, "EStaminaRegenPerSecond");
  const dashDur = S(hero, "EGroundDashDuration");
  return [
    { label: "最大HP", value: num(S(hero, "EMaxHealth")) },
    { label: "HPリジェネ", value: num(S(hero, "EBaseHealthRegen")) },
    { label: "移動速度", value: `${num(S(hero, "EMaxMoveSpeed"))}m` },
    { label: "スプリント速度", value: `${num(S(hero, "ESprintSpeed"))}m` },
    { label: "スタミナ", value: num(S(hero, "EStamina")) },
    {
      label: "スタミナクールダウン",
      value: staminaCd ? `${num(1 / staminaCd, 1)}秒` : "—",
    },
    {
      label: "ダッシュ速度",
      value: dashDur ? `${num(S(hero, "EGroundDashDistanceInMeters") / dashDur, 1)}m` : "—",
    },
    { label: "しゃがみ速度", value: `${num(S(hero, "ECrouchSpeed"))}m` },
  ];
}

/**
 * スピリットパワーが効くスキルのダメージ。
 *
 * m_bIsAbilityDamageProperty が立ったプロパティが、ゲーム内の
 * 「スピリットパワーの影響値」に並んでいるものと一致する
 * (インファーナスで 40 / 30 / 14 / 125 の一致を確認済み)。
 *
 * 表示値 = 基礎値 + スピリットパワー × 係数。
 * 係数は m_flStatScale。持たないスキルは damage を null にする。
 */
export interface AbilityDamage {
  key: string;
  name: string;
  image: string | null;
  isUltimate: boolean;
  damage: { label: string; base: number; scale: number } | null;
}

export function abilityDamages(hero: Hero): AbilityDamage[] {
  return hero.abilities
    .filter((a) => a.slot.startsWith("Signature"))
    .sort((a, b) => a.slot.localeCompare(b.slot))
    .map((a) => {
      const ab: Ability | undefined = ability(a.abilityKey);
      const hit = ab
        ? Object.entries(ab.properties).find(([, p]) => p.isAbilityDamage && p.value !== null)
        : undefined;
      return {
        key: a.abilityKey,
        name: t(a.abilityKey, a.abilityKey),
        image: ab?.image ?? null,
        isUltimate: ab?.kind === "Ultimate",
        damage: hit
          ? {
              label: t(`${hit[0]}_label`, hit[0]),
              base: hit[1].value!,
              scale: hit[1].scale?.statScale ?? 0,
            }
          : null,
      };
    });
}

/** スピリット側のステータス。基礎値がそのまま出るものだけ */
export function spiritRows(hero: Hero): StatRow[] {
  return [
    { label: "アビリティ継続時間", value: `×${num(S(hero, "ETechDuration"))}` },
    { label: "アビリティ範囲", value: `×${num(S(hero, "ETechRange"))}` },
    { label: "武器パワー", value: num(S(hero, "EWeaponPower")) },
    { label: "リロード速度", value: `×${num(S(hero, "EReloadSpeed"))}` },
  ];
}
