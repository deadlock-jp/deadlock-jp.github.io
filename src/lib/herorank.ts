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
import type { WeaponInfo } from "../types/ability.ts";
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
  /** 標準レベルアップ1回ごとの成長。武器ダメージ/最大HP/近接ダメージ/スピリットパワー */
  growth: RankRow[];
  /** 成長(Boon)が全体で上位の軸。カードでアクセントを付ける */
  boonAccent: Array<"hp" | "weapon" | "spirit">;
}

type Metric = {
  key: string;
  label: string;
  group: "weapon" | "vitality" | "spirit" | "growth";
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

/**
 * 武器単体の値を返す関数群。Hero ではなく WeaponInfo を直接受け取るので、
 * シルバー(人狼)のように hero.abilities の既定武器とは別の武器
 * (ライカンクロー)を評価したいときにも使い回せる(radarAxesForWeapon 参照)。
 */
const WEAPON_METRIC_FNS: Record<string, (w: WeaponInfo) => number | null> = {
  dps: (w) => (w.cycleTime && w.bulletDamage !== null ? (w.bulletDamage / w.cycleTime) * (w.bulletsPerShot || 1) : null),
  bullet: (w) => w.bulletDamage ?? null,
  firerate: (w) => (w.cycleTime ? 1 / w.cycleTime : null),
  clip: (w) => w.clipSize ?? null,
  reload: (w) => w.reloadDuration ?? null,
  velocity: (w) => (w.bulletSpeed != null ? (toMeters(w.bulletSpeed) ?? null) : null),
  range: (w) => (w.falloff?.startRange != null ? (toMeters(w.falloff.startRange) ?? null) : null),
  // ダメージ減衰"開始"距離(range)は武器の間合いとは別物(近距離武器でも遠くまで届く砲弾はある)。
  // 減衰が下げ止まる距離(rangeEnd)の方が「実質的にダメージが届く距離」の指標になる。
  rangeEnd: (w) => (w.falloff?.endRange != null ? (toMeters(w.falloff.endRange) ?? null) : null),
};
const weaponMetric =
  (key: keyof typeof WEAPON_METRIC_FNS) =>
  (h: Hero): number | null => {
    const w = weaponOf(h);
    return w ? WEAPON_METRIC_FNS[key](w) : null;
  };
function dashSpeed(h: Hero): number | null {
  const d = h.startingStats.EGroundDashDuration;
  return d ? (h.startingStats.EGroundDashDistanceInMeters ?? 0) / d : null;
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
  { key: "dps", label: "DPS", group: "weapon", get: weaponMetric("dps"), fmt: (v) => num(v, 0) },
  { key: "bullet", label: "1発ダメージ", group: "weapon", get: weaponMetric("bullet"), fmt: (v) => num(v, 1) },
  { key: "firerate", label: "連射", group: "weapon", get: weaponMetric("firerate"), fmt: (v) => `${num(v, 1)}発/秒` },
  { key: "clip", label: "装弾数", group: "weapon", get: weaponMetric("clip"), fmt: (v) => num(v, 0) },
  {
    key: "reload",
    label: "リロード",
    group: "weapon",
    lowerIsBetter: true,
    get: weaponMetric("reload"),
    fmt: (v) => `${num(v, 2)}秒`,
  },
  { key: "velocity", label: "弾速", group: "weapon", get: weaponMetric("velocity"), fmt: (v) => `${num(v, 0)}m/秒` },
  {
    key: "range",
    label: "減衰開始",
    group: "weapon",
    get: weaponMetric("range"),
    fmt: (v) => `${num(v, 0)}m`,
  },
  {
    key: "rangeEnd",
    label: "減衰終了",
    group: "weapon",
    get: weaponMetric("rangeEnd"),
    fmt: (v) => `${num(v, 0)}m`,
  },
  { key: "lmelee", label: "軽近接", group: "weapon", get: (h) => h.startingStats.ELightMeleeDamage ?? null, fmt: (v) => num(v, 0) },
  { key: "hmelee", label: "重近接", group: "weapon", get: (h) => h.startingStats.EHeavyMeleeDamage ?? null, fmt: (v) => num(v, 0) },
  // --- 生命力 ---
  { key: "hp", label: "最大HP", group: "vitality", get: (h) => h.startingStats.EMaxHealth ?? null, fmt: (v) => num(v, 0) },
  { key: "regen", label: "HP回復", group: "vitality", get: (h) => h.startingStats.EBaseHealthRegen ?? null, fmt: (v) => num(v, 1) },
  { key: "move", label: "移動速度", group: "vitality", get: (h) => h.startingStats.EMaxMoveSpeed ?? null, fmt: (v) => `${num(v, 1)}m` },
  { key: "sprint", label: "スプリント速度", group: "vitality", get: (h) => h.startingStats.ESprintSpeed ?? null, fmt: (v) => `+${num(v, 1)}m` },
  { key: "dash", label: "ダッシュ速度", group: "vitality", get: dashSpeed, fmt: (v) => `${num(v, 1)}m` },
  { key: "stam", label: "スタミナ", group: "vitality", get: (h) => h.startingStats.EStamina ?? null, fmt: (v) => num(v, 0) },
  {
    key: "stamcd",
    label: "スタミナCD",
    group: "vitality",
    lowerIsBetter: true,
    get: (h) => {
      const x = h.startingStats.EStaminaRegenPerSecond;
      return x ? 1 / x : null;
    },
    fmt: (v) => `${num(v, 1)}秒`,
  },
  // --- スピリット(初期スタッツは全員共通なので、成長と係数で表す) ---
  { key: "skillscale", label: "スキル係数", group: "spirit", get: skillScaleAvg, fmt: (v) => `×${num(v, 2)}` },
  // --- 成長度(標準レベルアップ1回ごと。全38体が持つ4つ) ---
  {
    key: "gwdmg",
    label: "武器ダメージ",
    group: "growth",
    get: (h) => h.levelUpBonuses.MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL ?? null,
    fmt: (v) => `+${num(v, 3)}/Lv`,
  },
  {
    key: "ghp",
    label: "最大HP",
    group: "growth",
    get: (h) => h.levelUpBonuses.MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL ?? null,
    fmt: (v) => `+${num(v, 1)}/Lv`,
  },
  {
    key: "gmelee",
    label: "近接ダメージ",
    group: "growth",
    get: (h) => h.levelUpBonuses.MODIFIER_VALUE_BASE_MELEE_DAMAGE_FROM_LEVEL ?? null,
    fmt: (v) => `+${num(v, 2)}/Lv`,
  },
  {
    key: "gspower",
    label: "スピリットパワー",
    group: "growth",
    get: (h) => h.levelUpBonuses.MODIFIER_VALUE_TECH_POWER ?? null,
    fmt: (v) => `+${num(v, 1)}/Lv`,
  },
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
    const rank: HeroRank = { weapon: [], vitality: [], spirit: [], growth: [], boonAccent: [] };
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

/** RankRow を key で絞る(トップページのホバーカード用) */
export function pickRows(rows: RankRow[], keys: string[]): RankRow[] {
  return keys.map((k) => rows.find((r) => r.key === k)).filter((r): r is RankRow => Boolean(r));
}

// --- レーダーチャート ---------------------------------------------------------

export interface RadarAxis {
  label: string;
  /** このヒーローの正規化値 0..1 */
  value: number;
  /** 実値の表示 */
  raw: string;
}

const WEAPON_AXES = ["dps", "bullet", "firerate", "clip", "reload", "velocity", "range", "rangeEnd"];
const VITALITY_AXES = ["hp", "regen", "move", "sprint", "dash", "stam", "stamcd"];
const GROWTH_AXES = ["gwdmg", "ghp", "gmelee", "gspower"];

const asAxes = (rows: RankRow[], keys: string[]): RadarAxis[] =>
  keys
    .map((k) => rows.find((x) => x.key === k))
    .filter((x): x is RankRow => Boolean(x))
    .map((x) => ({ label: x.label, value: x.pct, raw: x.value }));

export function heroRadar(heroId: number): {
  weapon: RadarAxis[];
  base: RadarAxis[];
  growth: RadarAxis[];
} {
  const r = heroRanks()[heroId];
  return {
    weapon: asAxes(r.weapon, WEAPON_AXES),
    base: asAxes(r.vitality, VITALITY_AXES),
    growth: asAxes(r.growth, GROWTH_AXES),
  };
}

let weaponSortedCache: Record<string, number[]> | null = null;
function weaponMetricSorted(): Record<string, number[]> {
  if (weaponSortedCache) return weaponSortedCache;
  const heroes = releasedHeroes();
  const out: Record<string, number[]> = {};
  for (const key of Object.keys(WEAPON_METRIC_FNS)) {
    const vals = heroes.map((h) => weaponMetric(key)(h)).filter((v): v is number => v != null);
    out[key] = [...vals].sort((a, b) => a - b);
  }
  weaponSortedCache = out;
  return out;
}

/**
 * 特定の武器(WeaponInfo)ぶんのレーダー軸を、実装済みヒーロー全員の武器値分布の中での
 * 百分位で作る。シルバー(人狼)のライカンクローのように、hero.abilities の
 * 既定武器(Weapon_Primary)とは別の武器を評価したいときに使う
 * (通常の heroRadar は常に既定武器を見るため、変身後の武器は別途これで計算する)。
 */
export function radarAxesForWeapon(weapon: WeaponInfo | null): RadarAxis[] {
  if (!weapon) return [];
  const sorted = weaponMetricSorted();
  const byKey = new Map(METRICS.filter((m) => m.group === "weapon").map((m) => [m.key, m]));
  const axes: RadarAxis[] = [];
  for (const key of WEAPON_AXES) {
    const fn = WEAPON_METRIC_FNS[key];
    const m = byKey.get(key);
    if (!fn || !m) continue;
    const raw = fn(weapon);
    if (raw == null) continue;
    axes.push({ label: m.label, value: percentileOf(sorted[key] ?? [], raw), raw: m.fmt(raw) });
  }
  return axes;
}

/**
 * レーダーに載せにくい少数の値(ヒーロー詳細で1行)。
 * 近接ダメージの基礎値と、スキルのスピリット係数。
 */
export function heroMiscRows(heroId: number): RankRow[] {
  const r = heroRanks()[heroId];
  return pickRows(r.weapon, ["lmelee", "hmelee"]).concat(pickRows(r.spirit, ["skillscale"]));
}

// --- ティア表(ヒーロー一覧ページ) ------------------------------------------

export interface TierMetric {
  key: string;
  label: string;
  /** セレクトの optgroup 見出し */
  group: string;
}
export interface TierEntry {
  id: number;
  /** 1..5 (1=D, 5=S) */
  tier: number;
  /** 実値の表示 */
  value: string;
}

/** 選べる項目。key は heroRanks の RankRow.key、group はセレクトの見出し */
const TIER_METRICS: Array<TierMetric & { rankGroup: "weapon" | "vitality" | "spirit" | "growth" }> = [
  { key: "dps", label: "DPS", group: "武器", rankGroup: "weapon" },
  { key: "bullet", label: "1発ダメージ", group: "武器", rankGroup: "weapon" },
  { key: "firerate", label: "連射(発/秒)", group: "武器", rankGroup: "weapon" },
  { key: "clip", label: "装弾数", group: "武器", rankGroup: "weapon" },
  { key: "reload", label: "リロード(速い順)", group: "武器", rankGroup: "weapon" },
  { key: "velocity", label: "弾速", group: "武器", rankGroup: "weapon" },
  { key: "range", label: "減衰開始", group: "武器", rankGroup: "weapon" },
  // 「射程」の実質的な指標。減衰開始距離は間合いの近さとは関係ない
  // (近接寄りの武器でも遠くまで届くことがある)。減衰が下げ止まる距離の方が
  // 「ダメージが実質的に届く距離」に近い
  { key: "rangeEnd", label: "射程(減衰終了)", group: "武器", rankGroup: "weapon" },
  { key: "lmelee", label: "軽近接", group: "武器", rankGroup: "weapon" },
  { key: "hmelee", label: "重近接", group: "武器", rankGroup: "weapon" },
  { key: "hp", label: "最大HP", group: "生命力", rankGroup: "vitality" },
  { key: "regen", label: "HP回復", group: "生命力", rankGroup: "vitality" },
  { key: "move", label: "移動速度", group: "生命力", rankGroup: "vitality" },
  { key: "sprint", label: "スプリント速度", group: "生命力", rankGroup: "vitality" },
  { key: "dash", label: "ダッシュ速度", group: "生命力", rankGroup: "vitality" },
  { key: "stam", label: "スタミナ", group: "生命力", rankGroup: "vitality" },
  { key: "stamcd", label: "スタミナCD(速い順)", group: "生命力", rankGroup: "vitality" },
  { key: "gwdmg", label: "武器ダメージ成長/Lv", group: "成長度", rankGroup: "growth" },
  { key: "ghp", label: "最大HP成長/Lv", group: "成長度", rankGroup: "growth" },
  { key: "gmelee", label: "近接ダメージ成長/Lv", group: "成長度", rankGroup: "growth" },
  { key: "gspower", label: "スピリットパワー成長/Lv", group: "成長度", rankGroup: "growth" },
  { key: "skillscale", label: "スキルのスピリット係数", group: "スピリット", rankGroup: "spirit" },
];

/**
 * ヒーロー一覧のティア表。項目ごとに、全38体を「その項目の百分位」で
 * S/A/B/C/D の5段(= RankRow.stars)に分け、段内は上位ほど先頭にする。
 */
export function heroTierTable(): { metrics: TierMetric[]; data: Record<string, TierEntry[]> } {
  const ranks = heroRanks();
  const ids = releasedHeroes().map((h) => h.id);
  const data: Record<string, TierEntry[]> = {};
  for (const m of TIER_METRICS) {
    const rows = ids
      .map((id) => {
        const row = ranks[id][m.rankGroup].find((r) => r.key === m.key);
        return row ? { id, tier: row.stars, value: row.value, pct: row.pct } : null;
      })
      .filter((x): x is { id: number; tier: number; value: string; pct: number } => x !== null)
      .sort((a, b) => b.pct - a.pct);
    data[m.key] = rows.map(({ id, tier, value }) => ({ id, tier, value }));
  }
  return { metrics: TIER_METRICS.map(({ key, label, group }) => ({ key, label, group })), data };
}
