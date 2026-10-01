/**
 * マウスオーバーの詳細カード(ヒーロー・アイテム・スキル)のデータ。言語ごとに全件まとめて作り、
 * /hover/<kind>.json(日本語以外は /<lang>/hover/<kind>.json)として別ファイルで配る。
 *
 * 以前は各ページの HTML に全件を埋め込んでいた(トップページでは 555KB のうち約 300KB)。
 * カードが出るのはマウスのある広い画面だけ(1000px 以下では出さない)なので、スマホは読み込まない。
 * 読み込みはカードのスクリプト(*HoverCard.astro)が、最初にカードを出すとき(またはアイドル時)に行う。
 *
 * 中身の作り方は、各ページ・コンポーネントで作っていたものと同じ(ここへ移しただけ)。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ability,
  describe,
  heroNotes,
  heroTags,
  heroesFile,
  itemHoverData,
  legendaryItems,
  releasedHeroes,
  shopItems,
  t,
} from "./data.ts";
import { heroRanks, pickRows } from "./herorank.ts";
import { skillCard } from "./skillcard.ts";
import { abilityEffects, itemEffects } from "./effects.ts";
import { balanceUpdates } from "./balance.ts";
import { L } from "../i18n/index.ts";

export const HOVER_KINDS = ["heroes", "items", "abilities"] as const;
export type HoverKind = (typeof HOVER_KINDS)[number];

const base = () => ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/").replace(/\/$/, "");

/** ヒーロー(トップ・ヒーロー一覧・ティア表) */
function heroes(): Record<number, unknown> {
  const T = L();
  const BOON_LABEL: Record<string, string> = { hp: T.rank.boonHp, weapon: T.rank.boonWeapon, spirit: T.rank.boonSpirit };
  const ranks = heroRanks();
  const out: Record<number, unknown> = {};
  for (const h of releasedHeroes()) {
    const key = h.key.replace(/^hero_/, "");
    const gloatRel = `images/heroes/gloat/${key}.webp`;
    const r = ranks[h.id]!;
    out[h.id] = {
      name: t(h.nameToken, h.key),
      gloat: existsSync(join(process.cwd(), "public", gloatRel)) ? `${base()}/${gloatRel}` : null,
      tags: heroTags(h),
      // ホバーカードは各カテゴリ4項目まで(レーダーはヒーロー詳細で全項目)
      weapon: pickRows(r.weapon, ["dps", "bullet", "clip", "range"]),
      vitality: pickRows(r.vitality, ["hp", "regen", "move", "stam"]),
      spirit: pickRows(r.growth, ["gspower"]).concat(pickRows(r.spirit, ["skillscale"])),
      boon: r.boonAccent.map((a) => BOON_LABEL[a]),
    };
  }
  return out;
}

/** アイテム(ショップに並ぶもの+レジェンダリー)。状態異常・効果も足す */
function items(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const i of [...shopItems(), ...legendaryItems()]) {
    out[i.id] = { ...itemHoverData(i), effects: itemEffects(i.id).map((b) => ({ n: b.name, c: b.category, v: b.value })) };
  }
  return out;
}

/** スキル(全ヒーローのスキル+バランス調整の一覧に出るもの)。状態異常・効果も足す */
function abilities(): Record<string, unknown> {
  const T = L();
  /** {s:hero_name} を解決するのに持ち主の名前が要る */
  const ownerName = new Map<string, string>();
  for (const h of releasedHeroes()) {
    for (const a of h.abilities) if (!ownerName.has(a.abilityKey)) ownerName.set(a.abilityKey, t(h.nameToken, h.key));
  }
  const keys = new Set<string>();
  for (const h of Object.values(heroesFile.heroes)) for (const a of h.abilities) keys.add(a.abilityKey);
  for (const u of balanceUpdates(base())) {
    for (const c of u.chips) if (c.abilityKey) keys.add(c.abilityKey);
    for (const e of u.entities) for (const g of e.groups) if (g.abilityKey) keys.add(g.abilityKey);
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const ab = ability(key);
    if (!ab) continue;
    const heroName = ownerName.get(key) ?? "";
    const card = skillCard(ab, heroName);
    out[key] = {
      name: t(key, key),
      isUlt: ab.kind === "Ultimate",
      isPassive: ab.kind !== "Ultimate" && ab.activation === "PASSIVE",
      meta: card.meta,
      desc: describe(`${key}_desc`, ab.properties, T.common.noDesc, { hero_name: heroName }),
      tiles: card.tiles,
      secondaryRows: card.secondaryRows,
      upgrades: card.upgrades,
      notes: heroNotes(key),
      effects: abilityEffects(key).map((b) => ({ n: b.name, c: b.category, v: b.value, ap: b.viaUpgrade })),
    };
  }
  return out;
}

/** 描いている言語での、その種類の全件 */
export function hoverData(kind: HoverKind): Record<string, unknown> {
  return kind === "heroes" ? heroes() : kind === "items" ? items() : abilities();
}
