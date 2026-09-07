/**
 * ヒーロー同士の相対評価。
 *
 * 実装済みヒーロー全員の中で、その数値が何%の位置にいるかを出して
 *   ★1〜5(百分位を5段に量子化)
 *   レーダーチャート用の 0〜1 正規化値
 * を作る。値そのものはゲームの生データで、順位付けだけがこちらの計算。
 * 「どれが優れているか」の重み付けや主観評価はしない。
 */

import type { Hero } from "../types/hero.ts";
import { releasedHeroes, ability } from "./data.ts";
import { toMeters, num } from "./gamestats.ts";

export interface RankRow {
  key: string;
  label: string;
  value: string;
  /** 0..1。全実装済みヒーロー中の百分位(高いほど値が大きい。lowerIsBetter のときは反転済み) */
  pct: number;
  /** 1..5 */
  stars: number;
}

export interface HeroRank {
  weapon: RankRow[];
  vitality: RankRow[];
  spirit: RankRow[];
  /** 成長(Boon)が全体で上位の軸。カードでアクセントを付ける */
  boonAccent: Array<"hp" | "weapon" | "spirit">;
}

type Metric = {
  key: string;
  label: string;
  group: "weapon" | "vitality" | "spirit";
  /** そのヒーローの生値。取れなければ null */
  get: (h: Hero) => number | null;
  /** 表示整形 */
  fmt: (v: number) => string;
  /** 小さいほど良い数値(反転して順位を出す) */
  lowerIsBetter?: boolean;
};

/** ヒーローの主武器情報 */
function weaponOf(h: Hero) {
  const slot = h.abilities.find((a) => a.slot === "Weapon_Primary");
  return slot ? (ability(slot.abilityKey)?.weapon ?? null) : null;
}

/** 署名アビリティ1つあたりの「主ダメージ×スピリット係数」平均。異常値(>2)は頭打ち */
function skillScaleAvg(h: Hero): number | null {
  const sigs = h.abilities.filter((a) => a.slot.startsWith("Signature"));
  const vals: number[] = [];
  for (const s of sigs) {
    const ab = ability(s.abilityKey);
    if (!ab) continue;
    const dmg = Object.values(ab.properties ?? {})
      .filter((p) => p.isAbilityDamage && p.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
    if (dmg) vals.push(Math.min(dmg.scale?.statScale ?? 0, 2));
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const METRICS: Metric[] = [
  // --- 武器 ---
  {
    key: "dps",
    label: "DPS",
    group: "weapon",
    get: (h) => {
      const w = weaponOf(h);
      return w && w.cycleTime && w.bulletDamage !== null
        ? (w.bulletDamage / w.cycleTime) * (w.bulletsPerShot || 1)
        : null;
    },
    fmt: (v) => num(v, 0),
  },
  { key: "bullet", label: "1発ダメージ", group: "weapon", get: (h) => weaponOf(h)?.bulletDamage ?? null, fmt: (v) => num(v, 1) },
  { key: "clip", label: "装弾数", group: "weapon", get: (h) => weaponOf(h)?.clipSize ?? null, fmt: (v) => num(v, 0) },
  {
    key: "range",
    label: "減衰開始",
    group: "weapon",
    get: (h) => {
      const w = weaponOf(h);
      return w?.falloff?.startRange != null ? (toMeters(w.falloff.startRange) ?? null) : null;
    },
    fmt: (v) => `${num(v, 0)}m`,
  },
  // --- 生命力 ---
  { key: "hp", label: "最大HP", group: "vitality", get: (h) => h.startingStats.EMaxHealth ?? null, fmt: (v) => num(v, 0) },
  { key: "regen", label: "HP回復", group: "vitality", get: (h) => h.startingStats.EBaseHealthRegen ?? null, fmt: (v) => num(v, 1) },
  { key: "move", label: "移動速度", group: "vitality", get: (h) => h.startingStats.EMaxMoveSpeed ?? null, fmt: (v) => `${num(v, 1)}m` },
  { key: "stam", label: "スタミナ", group: "vitality", get: (h) => h.startingStats.EStamina ?? null, fmt: (v) => num(v, 0) },
  // --- スピリット(初期スタッツは全員共通なので、成長と係数で表す) ---
  {
    key: "techpow",
    label: "パワー成長/Lv",
    group: "spirit",
    get: (h) => h.levelUpBonuses.MODIFIER_VALUE_TECH_POWER ?? null,
    fmt: (v) => `+${num(v, 1)}`,
  },
  { key: "skillscale", label: "スキル係数", group: "spirit", get: skillScaleAvg, fmt: (v) => `×${num(v, 2)}` },
];

/** 昇順ソートした配列の中で v の百分位(0..1)。同値は中間順位 */
function percentileOf(sorted: number[], v: number): number {
  if (sorted.length <= 1) return 0.5;
  let below = 0;
  let equal = 0;
  for (const x of sorted) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (below + equal / 2) / sorted.length;
}

const starsFromPct = (pct: number): number => Math.min(5, Math.max(1, Math.round(pct * 4) + 1));

let cache: Record<number, HeroRank> | null = null;

export function heroRanks(): Record<number, HeroRank> {
  if (cache) return cache;
  const heroes = releasedHeroes();

  // 各メトリクスの全ヒーロー値(昇順)
  const sortedByMetric = new Map<string, number[]>();
  for (const m of METRICS) {
    const vals = heroes.map((h) => m.get(h)).filter((v): v is number => v != null);
    sortedByMetric.set(m.key, [...vals].sort((a, b) => a - b));
  }
  // Boon 成長の3軸
  const boonAxes = {
    hp: heroes.map((h) => h.levelUpBonuses.MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL ?? 0),
    weapon: heroes.map((h) => h.levelUpBonuses.MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL ?? 0),
    spirit: heroes.map((h) => h.levelUpBonuses.MODIFIER_VALUE_TECH_POWER ?? 0),
  };
  const boonSorted = {
    hp: [...boonAxes.hp].sort((a, b) => a - b),
    weapon: [...boonAxes.weapon].sort((a, b) => a - b),
    spirit: [...boonAxes.spirit].sort((a, b) => a - b),
  };

  const out: Record<number, HeroRank> = {};
  heroes.forEach((h, i) => {
    const rank: HeroRank = { weapon: [], vitality: [], spirit: [], boonAccent: [] };
    for (const m of METRICS) {
      const raw = m.get(h);
      if (raw == null) continue;
      const sorted = sortedByMetric.get(m.key)!;
      let pct = percentileOf(sorted, raw);
      if (m.lowerIsBetter) pct = 1 - pct;
      rank[m.group].push({ key: m.key, label: m.label, value: m.fmt(raw), pct, stars: starsFromPct(pct) });
    }
    for (const axis of ["hp", "weapon", "spirit"] as const) {
      if (percentileOf(boonSorted[axis], boonAxes[axis][i]) >= 0.75) rank.boonAccent.push(axis);
    }
    out[h.id] = rank;
  });

  cache = out;
  return out;
}

/** レーダーチャート用。基礎スタッツ + 武器を 0..1 正規化した軸で返す */
export interface RadarAxis {
  label: string;
  /** このヒーローの正規化値 0..1 */
  value: number;
  /** 実値の表示 */
  raw: string;
  /** 全ヒーローの中央値(0..1)。基準線として描く */
  median: number;
}

export function heroRadar(heroId: number): { base: RadarAxis[]; weapon: RadarAxis[] } {
  const ranks = heroRanks();
  const r = ranks[heroId];
  const pick = (group: "weapon" | "vitality" | "spirit", keys: string[]) =>
    keys
      .map((k) => (group === "vitality" ? r.vitality : group === "weapon" ? r.weapon : r.spirit).find((x) => x.key === k))
      .filter((x): x is RankRow => Boolean(x))
      .map((x) => ({ label: x.label, value: x.pct, raw: x.value, median: 0.5 }));
  return {
    base: pick("vitality", ["hp", "regen", "move", "stam"]),
    weapon: pick("weapon", ["dps", "bullet", "clip", "range"]),
  };
}
