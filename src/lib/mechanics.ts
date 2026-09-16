/**
 * ゲームシステムのリファレンス(/mechanics/)が読むデータ。
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
import { t, itemsFile, releasedHeroes } from "./data.ts";

const DATA_DIR = join(process.cwd(), "data");

interface ObjectsFile {
  objects: Record<string, { id: string; className: string; stats: Record<string, number>; flags: Record<string, boolean> }>;
}
const objectsFile: ObjectsFile = (() => {
  const v = JSON.parse(readFileSync(join(DATA_DIR, "latest.json"), "utf8")).version as string;
  return JSON.parse(readFileSync(join(DATA_DIR, "snapshots", v, "objects.json"), "utf8")) as ObjectsFile;
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

  // ニュートラル
  goldReward: { label: "獲得ソウル" },
  goldRewardBonusPercentPerMinute: { label: "毎分のソウル増加", unit: "%" },
  weakPointCount: { label: "弱点の数" },
  weakPointRespawnTime: { label: "弱点の再出現", unit: "秒" },
  bonusDamageMult: { label: "弱点の追加ダメージ倍率" },
  goldPercent: { label: "弱点1つぶんのソウル割合" },
  damageOnDeath: { label: "破壊時のダメージ" },
};

export interface MechanicsStat {
  label: string;
  value: string;
}
export interface MechanicsObject {
  id: string;
  name: string;
  stats: MechanicsStat[];
}
export interface MechanicsTopic {
  id: string;
  title: string;
  lead: string;
  lines: string[];
  objects: MechanicsObject[];
}

const num = (n: number, digits = 1): string => {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits);
};

function formatStat(key: string, raw: number): MechanicsStat | null {
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
    objects: { id: string; nameToken?: string; name?: string }[];
  }[];
};

export function mechanicsTopics(): MechanicsTopic[] {
  return notesFile.topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    lead: topic.lead,
    lines: topic.lines,
    objects: topic.objects.flatMap((o) => {
      const obj = objectsFile.objects[o.id];
      if (!obj) return [];
      const name = (o.nameToken ? t(o.nameToken, "") : "") || o.name || o.id;
      /*
       * 並び順は STATS の定義順にする。objects.json のキー順は
       * オブジェクトごとにバラバラで、そのまま出すと最大HPが下の方に来る版が出る。
       */
      const stats = Object.keys(STATS)
        .filter((k) => Number.isFinite(obj.stats[k]))
        .map((k) => formatStat(k, obj.stats[k]!))
        .filter((s): s is MechanicsStat => s !== null);
      return stats.length ? [{ id: o.id, name, stats }] : [];
    }),
  }));
}

/* ------------------------------------------------------------------ *
 * ソウルの経済。こちらは objects.json ではなく heroes/items から出る
 * ------------------------------------------------------------------ */

export interface EconomyTable {
  /** ティアごとのアイテム価格。未実装ティアは除く */
  itemPrices: { tier: number; cost: number }[];
  /** レベルアップに必要な累計ソウル */
  levels: { level: number; requiredGold: number }[];
  /** 累計投資額による購入ボーナス。全ヒーロー共通（architecture.html 参照） */
  costBonuses: { slot: string; label: string; rows: { goldThreshold: number; bonus: number }[] }[];
}

const SLOT_LABEL: Record<string, string> = { WeaponMod: "武器", Armor: "生命力", Tech: "スピリット" };

export function economyTable(): EconomyTable {
  const prices = (itemsFile.itemPricePerTier ?? []) as number[];
  const hero = releasedHeroes()[0];
  return {
    /* ティア0は存在しない。最後のティアは未実装の置き値なので出さない */
    itemPrices: prices
      .map((cost, tier) => ({ tier, cost }))
      .filter((p) => p.tier >= 1 && p.cost > 0 && p.cost < 9999),
    levels: (hero?.levels ?? []).map((l) => ({ level: l.level, requiredGold: l.requiredGold })),
    costBonuses: Object.entries(hero?.costBonuses ?? {}).map(([slot, rows]) => ({
      slot,
      label: SLOT_LABEL[slot] ?? slot,
      rows: (rows as { goldThreshold: number; bonus: number }[]).map((r) => ({
        goldThreshold: r.goldThreshold,
        bonus: r.bonus,
      })),
    })),
  };
}
