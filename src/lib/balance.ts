/**
 * バランス調整の表示用モデル。
 *
 * data/updates.json の1エントリ(= 公式マイナーアップデート1件)を、
 * トップページの一覧とアップデート個別ページの両方が使える形にほぐす。
 *
 * 並べる単位はヒーローではなく「スキル・主武器・基礎ステータス・アイテム」。
 * 1体のヒーローの中でスキルごとにバフとナーフが分かれるため、ヒーロー単位だと
 * 同じアイコンがバフ行にもナーフ行にも出てしまい、何が動いたのか読めない。
 */
import {
  siteUpdates,
  adjustmentGroups,
  heroByKey,
  item,
  t,
  patchNoteByDate,
  type SiteUpdate,
  type AdjustmentGroup,
  type AdjustmentKind,
  type PatchNoteEntry,
} from "./data.ts";
import type { Item } from "../types/item.ts";

/*
 * URL の接頭辞は呼び出し側(Astroページ)から渡す。plain .ts では import.meta.env に
 * 型が付かない(tsconfig の types が node のみ)ので、ここでは参照しない。
 */

/** 一覧に1つずつ並ぶもの。スキル1つ / アイテム1つ / ヒーローの基礎ステータス */
export interface BalanceChip {
  kind: AdjustmentKind;
  /** そのものの名前(スキル名・アイテム名・「基礎ステータス」) */
  name: string;
  /** 持ち主。アイコンの左下に重ねる。アイテムなら null */
  heroName: string | null;
  heroImage: string | null;
  /** スキルアイコン。アイテム・基礎ステータスでは null */
  abilityImage: string | null;
  abilityKey: string | null;
  /** アイテムのときだけ。ItemIcon に渡す */
  item: Item | null;
  /** 「基礎」「武器」のような小さな札。スキル・アイテムでは null */
  tag: string | null;
  href: string;
  changeCount: number;
}

/** 個別ページでヒーロー/アイテム1件ぶんをまとめたもの */
export interface BalanceEntity {
  target: "hero" | "item";
  key: string;
  name: string;
  href: string;
  /** 全体の分類(data/updates.json に入っている値) */
  kind: AdjustmentKind;
  heroImage: string | null;
  item: Item | null;
  groups: AdjustmentGroup[];
}

export interface BalanceUpdate {
  date: string;
  title: string;
  fromVersion: string | null;
  toVersion: string | null;
  /** 対応する公式パッチノート(本文はこちらから出す) */
  note: PatchNoteEntry | null;
  sourceUrl: string | null;
  /** このアップデートのページ */
  href: string;
  entities: BalanceEntity[];
  chips: BalanceChip[];
  counts: Record<AdjustmentKind, number>;
  changeCount: number;
}

const EMPTY_COUNTS = (): Record<AdjustmentKind, number> => ({
  buff: 0,
  nerf: 0,
  mixed: 0,
  neutral: 0,
  rework: 0,
});

function toUpdate(u: SiteUpdate, base: string): BalanceUpdate {
  const entities: BalanceEntity[] = [];
  const chips: BalanceChip[] = [];
  const counts = EMPTY_COUNTS();
  let changeCount = 0;

  for (const a of u.adjustments ?? []) {
    const groups = adjustmentGroups(a);
    if (groups.length === 0) continue;
    changeCount += a.changes?.length ?? 0;

    if (a.target === "item") {
      const it = item(a.key);
      if (!it) continue;
      const name = t(it.nameToken, it.id);
      const href = `${base}/items/${it.id}/`;
      entities.push({
        target: "item",
        key: a.key,
        name,
        href,
        kind: a.kind,
        heroImage: null,
        item: it,
        groups,
      });
      counts[a.kind]++;
      chips.push({
        kind: a.kind,
        name,
        heroName: null,
        heroImage: null,
        abilityImage: null,
        abilityKey: null,
        item: it,
        tag: null,
        href,
        changeCount: groups[0]?.rows.length ?? 0,
      });
      continue;
    }

    const hero = heroByKey(a.key);
    if (!hero) continue;
    const heroName = t(hero.nameToken, hero.key);
    const heroHref = `${base}/heroes/${hero.id}/`;
    entities.push({
      target: "hero",
      key: a.key,
      name: heroName,
      href: heroHref,
      kind: a.kind,
      heroImage: hero.images.iconSmall,
      item: null,
      groups,
    });
    // 一覧に出るのはヒーローではなくスキル。分類もスキルごとのものを使う
    for (const g of groups) {
      counts[g.kind]++;
      chips.push({
        kind: g.kind,
        name: g.name,
        heroName,
        heroImage: hero.images.iconSmall,
        abilityImage: g.scope === "ability" ? g.image : null,
        abilityKey: g.abilityKey,
        item: null,
        tag: g.scope === "stat" ? "基礎" : g.scope === "weapon" ? "武器" : null,
        href: g.scope === "ability" && g.abilityKey ? `${base}/abilities/${g.abilityKey}/` : heroHref,
        changeCount: g.rows.length,
      });
    }
  }

  return {
    date: u.date,
    title: u.title,
    fromVersion: u.fromVersion ?? null,
    toVersion: u.toVersion ?? null,
    note: patchNoteByDate(u.date),
    sourceUrl: u.sourceUrl ?? null,
    href: `${base}/patch-notes/${u.date}/`,
    entities,
    chips,
    counts,
    changeCount,
  };
}

/** バランス調整のあるアップデートだけを新しい順に */
export function balanceUpdates(base: string): BalanceUpdate[] {
  return siteUpdates()
    .map((u) => toUpdate(u, base))
    .filter((u) => u.entities.length > 0);
}

export function balanceUpdateByDate(date: string, base: string): BalanceUpdate | null {
  return balanceUpdates(base).find((u) => u.date === date) ?? null;
}

/** 一覧で並べる順。バフ → ナーフ → 混在 → 調整 → リワーク */
export const CHIP_ORDER: AdjustmentKind[] = ["buff", "nerf", "mixed", "rework", "neutral"];
