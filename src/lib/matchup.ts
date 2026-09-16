/**
 * ヒーロー詳細ページの「強みと対策」。
 *
 * 判断材料は3つだけで、それぞれ役割が違う。
 *   A 基礎ステータス (herorank の百分位) … 「特徴」の表示にだけ使う
 *   B スキルの中身   (署名スキルの cssClass / 継続時間) … 対策の発火
 *   C 実ビルドの構成比 (item-stats の採用率 × slotType) … 対策の発火
 *
 * A を対策の根拠にしてはいけない。ケルビンは DPS が★5(上位12%)だが、
 * 実ビルドの武器構成比は3%(全38体中で下から2番目)で、弾薬耐性は的外れになる。
 * 「素の数値が高い」ことと「実際にそれで戦っている」ことは別。
 *
 * 対応表は data/matchup-rules.json、機械判定できないものは data/kit-tags.json。
 * どちらもヒーロー個別の記述は持たない。
 */
import matchupJson from "../../data/matchup-rules.json" with { type: "json" };
import kitTagsJson from "../../data/kit-tags.json" with { type: "json" };
import { t, shopItems, itemStats, ability, releasedHeroes, statLabel, item as itemById } from "./data.ts";
import { heroRanks } from "./herorank.ts";
import type { Hero } from "../types/hero.ts";
import type { Item } from "../types/item.ts";
import type { ItemSlotType } from "../types/hero.ts";

/* ------------------------------------------------------------------ *
 * 対応表
 * ------------------------------------------------------------------ */

interface ItemSelector {
  /** 1つのプロパティ名。値が比較できるよう、必ず単一の量にする */
  property?: string;
  /** 同じ意味の別名が複数ある場合だけ(回復阻害の Receive/Regen など) */
  properties?: string[];
  /** 主目的が別のアイテムを落とすための絞り込み */
  shopFilter?: string;
  /** おまけ程度の値を落とす。ここだけがこちらの決めた数字 */
  minValue?: number;
  /** 画面に出す項目名。省略時はプロパティのラベルを引く */
  label?: string;
  /** data/kit-tags.json のタグID。そのタグの items を無条件で足す */
  tagIds?: string;
}
interface RuleWhen {
  kit?: "healing" | "cc";
  composition?: ItemSlotType;
  tag?: string;
  /** 全ヒーロー中の上位何%で発火するか */
  topPercent?: number;
}
interface Rule {
  id: string;
  title: string;
  why: string;
  when: RuleWhen;
  items: ItemSelector;
}
const rulesFile = matchupJson as unknown as { rules: Rule[] };
const tagsFile = kitTagsJson as unknown as {
  tags: Record<string, { label: string; heroes: string[]; items: string[] }>;
};

/* ------------------------------------------------------------------ *
 * B: スキルの中身
 * ------------------------------------------------------------------ */

/** 行動を奪うスキルの継続時間。サイレンスとディスアームはスキル側が継続時間を持たないため入らない */
const CC_PROPS = /^(Stun|Sleep|Immobilize)Duration$/;

function kitSignal(hero: Hero, kind: "healing" | "cc"): number {
  let total = 0;
  for (const a of hero.abilities) {
    if (!String(a.slot).startsWith("Signature")) continue;
    for (const [name, p] of Object.entries(ability(a.abilityKey)?.properties ?? {})) {
      if (!Number.isFinite(p.value) || p.value === null) continue;
      if (kind === "healing" && p.cssClass === "healing") total += Math.abs(p.value);
      if (kind === "cc" && CC_PROPS.test(name) && p.value > 0) total += p.value;
    }
  }
  return total;
}

/** 回復スキルの内訳。根拠として画面に出す */
export function healingAbilities(hero: Hero): { name: string; amount: number }[] {
  const out: { name: string; amount: number }[] = [];
  for (const a of hero.abilities) {
    if (!String(a.slot).startsWith("Signature")) continue;
    let amount = 0;
    for (const p of Object.values(ability(a.abilityKey)?.properties ?? {})) {
      if (p.cssClass === "healing" && Number.isFinite(p.value)) amount += Math.abs(p.value!);
    }
    if (amount > 0) out.push({ name: t(a.abilityKey, a.abilityKey), amount });
  }
  return out.sort((x, y) => y.amount - x.amount);
}

/* ------------------------------------------------------------------ *
 * C: 実ビルドの構成比
 * ------------------------------------------------------------------ */

const SLOTS = ["WeaponMod", "Armor", "Tech"] as const satisfies readonly ItemSlotType[];
export const SLOT_SHARE_LABEL: Record<ItemSlotType, string> = {
  WeaponMod: "武器",
  Armor: "生命力",
  Tech: "スピリット",
};

const shopById = new Map(shopItems().map((i) => [i.id, i]));

/**
 * そのヒーローで積まれているアイテムのカテゴリ比率。
 * 採用率(0.1%刻みの整数)をスロット種別ごとに合計して正規化する。
 * 1試合あたりの枠数ではなく「どのカテゴリがよく積まれるか」の比率。
 */
function composition(heroId: number): Record<ItemSlotType, number> | null {
  const st = itemStats.heroes[String(heroId)];
  if (!st) return null;
  const sum: Record<ItemSlotType, number> = { WeaponMod: 0, Armor: 0, Tech: 0 };
  for (const [id, v] of Object.entries(st.items ?? {})) {
    const slot = shopById.get(id)?.slotType;
    if (slot) sum[slot] += v[0];
  }
  const total = sum.WeaponMod + sum.Armor + sum.Tech;
  if (!total) return null;
  return { WeaponMod: sum.WeaponMod / total, Armor: sum.Armor / total, Tech: sum.Tech / total };
}

/* ------------------------------------------------------------------ *
 * 百分位。しきい値は絶対値ではなく全ヒーロー中の順位で決める
 * (herorank と同じ考え方。アイテムプールが変わっても追随する)
 * ------------------------------------------------------------------ */

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

/** 全ヒーローぶんの信号値。1度だけ計算して使い回す */
const signals = (() => {
  const heroes = releasedHeroes();
  const healing: number[] = [];
  const cc: number[] = [];
  const comp: Record<ItemSlotType, number[]> = { WeaponMod: [], Armor: [], Tech: [] };
  const byHero = new Map<number, { healing: number; cc: number; comp: Record<ItemSlotType, number> | null }>();
  for (const h of heroes) {
    const entry = { healing: kitSignal(h, "healing"), cc: kitSignal(h, "cc"), comp: composition(h.id) };
    byHero.set(h.id, entry);
    /* 信号を持たないヒーローは母数に入れない(回復を持つ23体の中で上位何%か、で見る) */
    if (entry.healing > 0) healing.push(entry.healing);
    if (entry.cc > 0) cc.push(entry.cc);
    if (entry.comp) for (const s of SLOTS) comp[s].push(entry.comp[s]);
  }
  const sortAsc = (a: number[]) => [...a].sort((x, y) => x - y);
  return {
    byHero,
    healing: sortAsc(healing),
    cc: sortAsc(cc),
    comp: { WeaponMod: sortAsc(comp.WeaponMod), Armor: sortAsc(comp.Armor), Tech: sortAsc(comp.Tech) },
  };
})();

/* ------------------------------------------------------------------ *
 * アイテムの選び方
 * ------------------------------------------------------------------ */

export interface MatchupItem {
  item: Item;
  /** 「弾薬耐性 +30%」。手動タグ由来は null */
  note: string | null;
  /** 並べ替え用。手動タグ由来は null */
  value: number | null;
}

/**
 * セレクタに合うアイテムを、実数の大きい順に返す。
 *
 * 採用率では並べない。item-stats はそのヒーロー自身のビルドの採用率なので、
 * 対策の欄をそれで並べると「そのヒーローが買うアイテム」が対策として上に来る
 * (実際にケルビンで試すと採用率44%のスーパーエクステンダーが先頭に来た)。
 */
function selectItems(sel: ItemSelector, max = 6): MatchupItem[] {
  const names = sel.properties ?? (sel.property ? [sel.property] : []);
  const out: MatchupItem[] = [];
  const seen = new Set<string>();

  for (const it of shopItems()) {
    if (sel.shopFilter && !it.shopFilters.includes(sel.shopFilter)) continue;
    let best: { name: string; value: number } | null = null;
    for (const name of names) {
      const p = it.properties[name];
      if (!p || !Number.isFinite(p.value) || p.value === null) continue;
      const v = Math.abs(p.value);
      if (sel.minValue !== undefined && v < sel.minValue) continue;
      if (!best || v > best.value) best = { name, value: v };
    }
    if (!best) continue;
    seen.add(it.id);
    const label = sel.label ?? statLabel(best.name);
    out.push({ item: it, note: `${label} ${best.value}%`, value: best.value });
  }
  out.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  /* 手動タグのアイテムは実数を持たないので、末尾に順不同で足す */
  const extra = sel.tagIds ? (tagsFile.tags[sel.tagIds]?.items ?? []) : [];
  const tail: MatchupItem[] = [];
  for (const id of extra) {
    if (seen.has(id)) continue;
    const it = itemById(id);
    if (it?.inShop) tail.push({ item: it, note: null, value: null });
  }
  return [...out.slice(0, max), ...tail];
}

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

export interface MatchupStrength {
  label: string;
  value: string;
  /** 上位何%か(1..100) */
  topPercent: number;
}
export interface MatchupShare {
  slot: ItemSlotType;
  label: string;
  /** 0..100 */
  percent: number;
  topPercent: number;
}
export interface MatchupCounter {
  id: string;
  title: string;
  /** 根拠の1行 */
  why: string;
  /** 「上位7%」などの実測。手動タグ由来は null */
  evidence: string | null;
  manual: boolean;
  items: MatchupItem[];
}
export interface HeroMatchup {
  strengths: MatchupStrength[];
  /** ★5が1本も無いヒーロー。strengths は上位3軸のフォールバック */
  noStandout: boolean;
  shares: MatchupShare[];
  counters: MatchupCounter[];
}

const pctText = (p: number) => Math.max(1, Math.round((1 - p) * 100));

export function heroMatchup(hero: Hero): HeroMatchup {
  const rank = heroRanks()[hero.id];
  const rows = rank ? [...rank.weapon, ...rank.vitality, ...rank.spirit, ...rank.growth] : [];
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const top = sorted.filter((r) => r.stars >= 5);
  /*
   * ★5 = 上位12.5%。★4(上位37.5%)だと22軸中の平均6.8本が該当して「強み」にならない。
   * ★5が1本も無いヒーローが4体いるので、そのときは上位3軸を出す。
   */
  const noStandout = top.length === 0;
  const strengths = (noStandout ? sorted.slice(0, 3) : top).map((r) => ({
    label: r.label,
    value: r.value,
    topPercent: pctText(r.pct),
  }));

  const sig = signals.byHero.get(hero.id);
  const shares: MatchupShare[] = sig?.comp
    ? SLOTS.map((slot) => ({
        slot,
        label: SLOT_SHARE_LABEL[slot],
        percent: Math.round(sig.comp![slot] * 100),
        topPercent: pctText(percentileOf(signals.comp[slot], sig.comp![slot])),
      })).sort((a, b) => b.percent - a.percent)
    : [];

  const counters: MatchupCounter[] = [];
  for (const rule of rulesFile.rules) {
    const w = rule.when;
    let evidence: string | null = null;
    let manual = false;

    if (w.tag) {
      if (!tagsFile.tags[w.tag]?.heroes.includes(hero.key)) continue;
      manual = true;
    } else if (w.kit) {
      const value = w.kit === "healing" ? (sig?.healing ?? 0) : (sig?.cc ?? 0);
      if (value <= 0) continue;
      const pool = w.kit === "healing" ? signals.healing : signals.cc;
      const p = percentileOf(pool, value);
      if (pctText(p) > (w.topPercent ?? 100)) continue;
      evidence =
        w.kit === "healing"
          ? `${healingAbilities(hero).map((x) => `${x.name} ${x.amount}`).join(" / ")}（回復を持つ${pool.length}体中 上位${pctText(p)}%）`
          : `スタン・睡眠・拘束 合計 ${Math.round(value * 100) / 100}秒（${pool.length}体中 上位${pctText(p)}%）`;
    } else if (w.composition) {
      if (!sig?.comp) continue;
      const share = sig.comp[w.composition];
      const p = percentileOf(signals.comp[w.composition], share);
      if (pctText(p) > (w.topPercent ?? 100)) continue;
      evidence = `${SLOT_SHARE_LABEL[w.composition]}構成比 ${Math.round(share * 100)}%（全${signals.comp[w.composition].length}体中 上位${pctText(p)}%）`;
    }

    const items = selectItems(rule.items);
    if (items.length === 0) continue;
    counters.push({ id: rule.id, title: rule.title, why: rule.why, evidence, manual, items });
  }

  return { strengths, noStandout, shares, counters };
}
