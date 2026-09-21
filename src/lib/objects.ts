/**
 * オブジェクトのリファレンス(/mechanics/objects/)が読むデータ。
 *
 * 数値は data/snapshots/<版>/objects.json（ゲーム本体から抽出した npc_units.vdata）から引く。
 * data/mechanics-notes.json が持つのは「どのトピックでどのオブジェクトを出すか」と、
 * 生データからは読めない補足の文章だけ（hero-notes.json / item-notes.json と同じ運用）。
 *
 * objects.json の stats は Valve の内部名がそのまま入っている（maxHealth / stompDamage …）。
 * 全部出すと healthBarOffset や modelScale のような表示用の値まで並ぶので、
 * ここで「出す項目」を明示的に選ぶ。tools/diff/fields.mjs と同じ「どの箱を見るか」の考え方。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mechanicsJson from "../../data/mechanics-notes.json" with { type: "json" };
import { t } from "./data.ts";
import type { EconomyFile } from "../types/economy.ts";

const DATA_DIR = join(process.cwd(), "data");

interface ObjectsFile {
  objects: Record<string, { id: string; className: string; stats: Record<string, number>; flags: Record<string, boolean> }>;
}
const objectsFile: ObjectsFile = (() => {
  const v = JSON.parse(readFileSync(join(DATA_DIR, "latest.json"), "utf8")).version as string;
  return JSON.parse(readFileSync(join(DATA_DIR, "snapshots", v, "objects.json"), "utf8")) as ObjectsFile;
})();
const economyFile: EconomyFile = (() => {
  const v = JSON.parse(readFileSync(join(DATA_DIR, "latest.json"), "utf8")).version as string;
  return JSON.parse(readFileSync(join(DATA_DIR, "snapshots", v, "economy.json"), "utf8")) as EconomyFile;
})();

/** Source 2 の距離は 1 unit = 1 inch（src/lib/gamestats.ts と同じ） */
const UNITS_PER_METER = 39.37;

interface StatSpec {
  label: string;
  /** 値の後ろに付ける単位 */
  unit?: string;
  /** Source 2 の距離単位。メートルに直して出す */
  meters?: boolean;
}

/**
 * 出す項目と日本語表記。ここに無い stats は内部用として出さない。
 * 表記はゲーム内に対応する語があるものはそれに合わせ、無いものだけ自分で付ける。
 */
const STATS: Record<string, StatSpec> = {
  maxHealth: { label: "最大HP" },
  phase2Health: { label: "第2形態のHP" },
  playerDPS: { label: "対ヒーローDPS" },
  trooperDPS: { label: "対トルーパーDPS" },
  playerDamageResistPct: { label: "対ヒーロー耐性", unit: "%" },
  trooperDamageResistPct: { label: "対トルーパー耐性", unit: "%" },
  meleeDamage: { label: "近接ダメージ" },
  invulRange: { label: "無敵化範囲", unit: "m", meters: true },
  backDoorProtectionRange: { label: "バックドア保護範囲", unit: "m", meters: true },
  enemyTrooperProtectionRange: { label: "敵トルーパー保護範囲", unit: "m", meters: true },
  sightRangePlayers: { label: "索敵範囲（ヒーロー）", unit: "m", meters: true },
  playerAutoAttackRange: { label: "攻撃範囲", unit: "m", meters: true },
  runSpeed: { label: "移動速度", unit: "m／秒", meters: true },
  walkSpeed: { label: "歩行速度", unit: "m／秒", meters: true },
  dPSPctGrowthPerMinute: { label: "毎分のDPS上昇", unit: "%" },

  // ウォーカーのストンプ
  stompDamage: { label: "ストンプのダメージ" },
  stompDamageMaxHealthPercent: { label: "ストンプの最大HP割合ダメージ", unit: "%" },
  stompImpactRadius: { label: "ストンプの範囲", unit: "m", meters: true },
  stunDuration: { label: "ストンプのスタン", unit: "秒" },
  aoeWaveHealthThreshold: { label: "波動を出すHP割合" },

  // パトロン
  laserDurationPhase1: { label: "レーザーの長さ（第1形態）", unit: "秒" },
  laserDurationPhase2: { label: "レーザーの長さ（第2形態）", unit: "秒" },
  laserCooldownPhase1: { label: "レーザーのCD（第1形態）", unit: "秒" },
  laserCooldownPhase2: { label: "レーザーのCD（第2形態）", unit: "秒" },
  shrineAttackHealthLossPerAttack: { label: "シュライン攻撃1回のHP減少" },

  // シュライン
  maxHealthFinal: { label: "最大HP" },
  maxHealthGenerator: { label: "ジェネレーターの最大HP" },
  maxHealthGeneratorSecond: { label: "第2ジェネレーターの最大HP" },

  // ニュートラル
  goldReward: { label: "獲得ソウル" },
  goldRewardBonusPercentPerMinute: { label: "毎分のソウル増加", unit: "%" },
  // ミッドボス（npc_super_neutral）は maxHealth ではなく startingHealth を持つ
  startingHealth: { label: "開始時HP" },
  healthGainPerMinute: { label: "毎分のHP増加" },
  weakPointCount: { label: "弱点の数" },
  weakPointRespawnTime: { label: "弱点の再出現", unit: "秒" },
  bonusDamageMult: { label: "弱点の追加ダメージ倍率" },
  goldPercent: { label: "弱点1つぶんのソウル割合" },
  damageOnDeath: { label: "破壊時のダメージ" },
};

export interface ObjectStat {
  label: string;
  value: string;
}
export interface GameObjectEntry {
  id: string;
  name: string;
  /** ゲーム内のNPCアイコン参照。絵柄を確認できたオブジェクトにだけ付いている */
  icon: string | null;
  stats: ObjectStat[];
}
export interface ObjectTopic {
  id: string;
  title: string;
  lead: string;
  lines: string[];
  objects: GameObjectEntry[];
}

const num = (n: number, digits = 1): string => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits);
};

function formatStat(key: string, raw: number): ObjectStat | null {
  const spec = STATS[key];
  if (!spec) return null;
  const v = spec.meters ? raw / UNITS_PER_METER : raw;
  return { label: spec.label, value: `${num(v, spec.meters ? 0 : 2)}${spec.unit ?? ""}` };
}

const notesFile = mechanicsJson as unknown as {
  topics: {
    id: string;
    title: string;
    lead: string;
    lines: string[];
    /**
     * nameToken があればゲーム内の表記をそのまま使う（ルール1）。
     * トルーパーの種別や弱点のようにゲーム側が個別の名前を持っていないものだけ、
     * name に短い説明的なラベルを置く。どちらの場合も実IDを併記する。
     */
    objects: {
      id: string;
      nameToken?: string;
      name?: string;
      excludeStats?: string[];
      icon?: string;
    }[];
  }[];
};

export interface CampSpawnRow {
  key: string;
  label: string;
  initialSpawnMinutes: number;
  respawnMinutes: number;
  /** ミッドボスだけ持つ、撃破ごとの再出現間隔の短縮先。無ければ null */
  shrinksToMinutes: number | null;
}

/** ニュートラルキャンプの出現タイミング(economy.json の campSpawnTimes。misc.vdata由来) */
const CAMP_LABELS: Record<string, string> = {
  weak: "弱い中立モンスター",
  medium: "中程度の中立モンスター",
  strong: "強い中立モンスター",
  vaults: "罪人の生贄",
  midboss: "ミッドボス",
};

export function campSpawnTimes(): CampSpawnRow[] {
  return (economyFile.campSpawnTimes ?? []).map((c) => ({
    key: c.key,
    label: CAMP_LABELS[c.key] ?? c.key,
    initialSpawnMinutes: c.initialSpawnSeconds / 60,
    respawnMinutes: c.respawnIntervalSeconds / 60,
    shrinksToMinutes: c.intervalChangeSeconds !== 0 ? c.intervalMinSeconds / 60 : null,
  }));
}

export function objectTopics(): ObjectTopic[] {
  return notesFile.topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    lead: topic.lead,
    lines: topic.lines,
    objects: topic.objects.flatMap((o) => {
      const obj = objectsFile.objects[o.id];
      if (!obj) return [];
      const name = (o.nameToken ? t(o.nameToken, "") : "") || o.name || o.id;
      const excluded = new Set(o.excludeStats ?? []);
      /*
       * 並び順は STATS の定義順にする。objects.json のキー順は
       * オブジェクトごとにバラバラで、そのまま出すと最大HPが下の方に来る版が出る。
       */
      const stats = Object.keys(STATS)
        .filter((k) => !excluded.has(k) && Number.isFinite(obj.stats[k]))
        .map((k) => formatStat(k, obj.stats[k]!))
        .filter((s): s is ObjectStat => s !== null);
      return stats.length ? [{ id: o.id, name, icon: o.icon ?? null, stats }] : [];
    }),
  }));
}
