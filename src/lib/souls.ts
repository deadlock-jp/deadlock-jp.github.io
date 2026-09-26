/**
 * 試合の流れ(/mechanics/match/)の付録の数値表が読むデータ(旧ソウル獲得システムのページ)。
 *
 * アイテム価格・レベル必要ソウル・購入ボーナスは heroes.json / items.json から、
 * 建造物破壊のソウル・キル時の分配率・裂け目のカムバック補正は
 * data/snapshots/<版>/economy.json（generic_data.vdata と misc.vdata から抽出。
 * src/parsers/economy.ts）から引く。数値はすべて自動抽出（CLAUDE.md ルール6）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { itemsFile, releasedHeroes } from "./data.ts";
import type { EconomyFile } from "../types/economy.ts";

const DATA_DIR = join(process.cwd(), "data");

const economyFile: EconomyFile = (() => {
  const v = JSON.parse(readFileSync(join(DATA_DIR, "latest.json"), "utf8")).version as string;
  return JSON.parse(readFileSync(join(DATA_DIR, "snapshots", v, "economy.json"), "utf8")) as EconomyFile;
})();

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

export interface KillShareRow {
  /** キルに絡んだ人数 */
  count: number;
  trooperFrac: number;
  heroFrac: number;
}

export interface RiftComebackRow {
  label: string;
  value: string;
}

/**
 * 不安定な裂け目の劣勢側補正。その版に存在するフィールドだけを行にする
 * （2026-09-16 に一律耐性から時間でスケールする方式へ変わっており、
 *  どちらの方式かはデータ側にしか書かれていない）。
 */
export function riftComeback(): RiftComebackRow[] {
  const r = economyFile.riftComeback;
  if (!r) return [];
  const rows: RiftComebackRow[] = [];
  const add = (label: string, v: number | null, unit = "%") => {
    if (v !== null) rows.push({ label, value: `${v}${unit}` });
  };
  add("劣勢時のボーナス賞金", r.bounty);
  add("弾薬耐性（一律）", r.bulletResist);
  add("スピリット耐性（一律）", r.techResist);
  add("状態異常耐性（一律）", r.statusResist);
  add("耐性上限（試合開始時）", r.resistMaxAtStart);
  add("耐性上限の増加（1分ごと）", r.resistMaxPerMinute);
  add("耐性上限の頭打ち", r.resistMaxCap);
  return rows;
}

/** キルに絡んだ人数によるソウルの取り分。人数が増えるほど1人あたりは減る */
export function killShareFrac(): KillShareRow[] {
  const t = economyFile.trooperKillGoldShareFrac;
  const h = economyFile.heroKillGoldShareFrac;
  const len = Math.max(t.length, h.length);
  return Array.from({ length: len }, (_, i) => ({
    count: i + 1,
    trooperFrac: t[i] ?? 0,
    heroFrac: h[i] ?? 0,
  }));
}
