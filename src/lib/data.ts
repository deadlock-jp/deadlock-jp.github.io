/** data/snapshots/<version>/*.json の読み込みと、表示名の解決 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import updatesJson from "../../data/updates.json" with { type: "json" };
import heroNotesJson from "../../data/hero-notes.json" with { type: "json" };
import itemNotesJson from "../../data/item-notes.json" with { type: "json" };
import type { HeroesFile, Hero } from "../types/hero.ts";
import type { ItemsFile, Item } from "../types/item.ts";
import type { AbilitiesFile, Ability } from "../types/ability.ts";
import type { LocalizationFile } from "../types/localization.ts";

// import.meta.url ベースの相対解決は使わない: Astro/Vite のビルドでこのモジュールは
// dist/.prerender/chunks/ 以下へ移されるため、ソース上の相対パスが build 時に壊れる。
// プロジェクトルートは常に process.cwd()(npm run dev/build の実行場所)とする。
const DATA_DIR = join(process.cwd(), "data");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/**
 * data/snapshots/<version>/ からヒーロー・アイテム・アビリティ・日本語ローカライズを読む。
 * version を省略すると data/latest.json が指す最新版。
 * ビルドページに複数バージョン比較 UI を足すときは、ここに version を渡すだけでよい
 * (architecture.html「データレイアウト」参照)。
 */
function loadSnapshot(version?: string): {
  heroes: HeroesFile;
  items: ItemsFile;
  abilities: AbilitiesFile;
  localization: LocalizationFile;
  localizationEn: LocalizationFile;
} {
  const v = version ?? readJson<{ version: string }>(join(DATA_DIR, "latest.json")).version;
  const dir = join(DATA_DIR, "snapshots", v);
  return {
    heroes: readJson<HeroesFile>(join(dir, "heroes.json")),
    items: readJson<ItemsFile>(join(dir, "items.json")),
    abilities: readJson<AbilitiesFile>(join(dir, "abilities.json")),
    localization: readJson<LocalizationFile>(join(dir, "localization.japanese.json")),
    localizationEn: readJson<LocalizationFile>(join(dir, "localization.english.json")),
  };
}

const snapshot = loadSnapshot();
export const heroesFile = snapshot.heroes;
export const itemsFile = snapshot.items;
export const abilitiesFile = snapshot.abilities;
export const localization = snapshot.localization;
/** ゲーム内日本語が用意されていないトークン用の予備。約100件がこちらに落ちる */
export const localizationEn = snapshot.localizationEn;

/**
 * トークンID から表示テキストを引く。
 * ゲーム内の日本語を優先し、無ければ英語、それも無ければフォールバック。
 * 訳文はゲーム本体から取り出したものをそのまま使い、こちらで訳し直さない。
 */
export function t(token: string, fallback = ""): string {
  return localization.tokens[token]?.text ?? localizationEn.tokens[token]?.text ?? fallback;
}

/** 説明文に含まれる装飾タグを落として素のテキストにする */
export function plain(token: string, fallback = ""): string {
  return stripTags(t(token, fallback));
}

function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "BonusWeaponDamage" → "Bonus Weapon Damage" (ラベルが辞書に無いときの保険) */
function humanize(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

/**
 * Valveの説明文に埋め込まれたプレースホルダを解決する。
 *
 *   {s:PropName}                          → そのアイテム/スキル自身のプロパティ値
 *   {g:citadel_inline_attribute:'X'}      → 文中に埋め込むステータス名
 *
 * 埋め込み名は "InlineAttribute_X" が正しい引き先で、
 * ステータス行の見出しに使う "X_label" とは訳が違うものがある
 * (BonusFireRate: 「ボーナス発射速度」/「発射速度」)。
 * InlineAttribute_ を優先し、無いものだけ _label に落とす。
 *
 * 解決できないものは読める形に整えて残す(空欄にすると文意が壊れるため)。
 */
export function describe(
  descToken: string,
  properties: Record<string, { rawValue: string }> = {},
  fallback = "",
): string {
  const raw = t(descToken, fallback);
  if (!raw) return "";
  const resolved = raw
    .replace(/\{s:([A-Za-z0-9_]+)\}/g, (_m, prop: string) => properties[prop]?.rawValue ?? `?`)
    .replace(
      /\{g:citadel_inline_attribute:'([A-Za-z0-9_]+)'\}/g,
      // SpiritIcon は文字ではなくアイコンの差し込み位置。文字にすると文意が壊れるので落とす
      (_m, attr: string) =>
        attr === "SpiritIcon"
          ? ""
          : t(`InlineAttribute_${attr}`, t(`${attr}_label`, humanize(attr))),
    )
    // キーバインドの参照は [前進] のように括って示す
    .replace(
      /\{g:citadel_binding:'([A-Za-z0-9_]+)'\}/g,
      (_m, key: string) => `[${t(`${key}_label`, humanize(key))}]`,
    )
    // 上記以外の {x:...} 形式は最後の引数だけを読める形にして残す
    .replace(/\{[a-z]+:([^}]*)\}/g, (_m, inner: string) => {
      const last = inner.split(":").pop() ?? inner;
      return humanize(last.replace(/'/g, ""));
    });
  return stripTags(resolved);
}

/**
 * MODIFIER_VALUE_* に読めるラベルを与える表を作る。
 *
 * データ側にラベルは無い。アイテムのプロパティ名(BonusClipSize など)に対応する
 * "<名前>_label" がローカライズにあるので、それを流用する。
 *
 * 同じ MODIFIER_VALUE_* を複数のプロパティ名が使うため、最初に見つけた名前を採ると
 * 特殊な用途の名前を拾ってしまう(TECH_POWER に対して
 * 「チャージアビリティのボーナススピリットパワー」など)。
 * 出現回数が最も多い名前を選び、同数ならラベルが短い方を採る。
 *
 * ラベルだけでは複数の MODIFIER_VALUE_* が同じ表記になることがある
 * (武器ダメージ / 近距離の武器ダメージ / 遠距離の武器ダメージ)。
 * ゲーム側が持っている "<プロパティ名>_conditional"(「（範囲内）」など)を
 * 後ろに足して区別する。訳文はゲーム本体のものをそのまま使い、こちらで作らない。
 */
function buildModifierLabels(): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const item of Object.values(itemsFile.items)) {
    for (const propName of item.passiveProperties) {
      const prop = item.properties[propName];
      if (!prop?.providedType) continue;
      const base = t(`${propName}_label`, "");
      if (!base) continue;
      // 条件がラベルに既に含まれている場合は足さない(「対NPC武器ダメージ対NPC」を防ぐ)
      const cond = t(`${propName}_conditional`, "");
      const label = cond && !base.includes(cond) ? base + cond : base;
      const v = votes.get(prop.providedType) ?? new Map<string, number>();
      v.set(label, (v.get(label) ?? 0) + 1);
      votes.set(prop.providedType, v);
    }
  }
  const out = new Map<string, string>();
  for (const [type, v] of votes) {
    const best = [...v.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
    if (best) out.set(type, best[0]);
  }
  return out;
}

export const modifierLabels = buildModifierLabels();

/**
 * レベルアップの成長値だけに使われるキー。
 * ショップに並ぶアイテムがこれらを供給しないため上の投票では拾えず、
 * ゲームのローカライズにも対応する文字列が無い(Valveが画面に出していない)。
 * 表示のためにこちらで名前を与えたもので、ゲーム内表記ではない。
 */
const LEVEL_GROWTH_LABELS: Record<string, string> = {
  MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL: "最大HP",
  MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL: "1発ダメージ",
  MODIFIER_VALUE_BASE_MELEE_DAMAGE_FROM_LEVEL: "近接ダメージ",
  MODIFIER_VALUE_BOON_COUNT: "恩恵",
  // 一部ヒーローだけがレベルで得る成長。ゲームの表示名が無いので付けたもの
  MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL_ALT_FIRE: "サブ射撃1発ダメージ",
  MODIFIER_VALUE_BONUS_ATTACK_RANGE: "攻撃射程",
  MODIFIER_VALUE_TECH_RESIST: "スピリット耐性",
};

/**
 * MODIFIER_VALUE_* の表示名。
 * 1) アイテムのプロパティ名からの投票(対象が最も広く、条件付きも区別できる)
 * 2) ローカライズが直接持っている "<キー>_label"
 * 3) 上の成長値テーブル
 * 引けないものは接頭辞を落とした生キーをそのまま出す(勝手な訳を当てない)。
 */
export function modifierLabel(type: string): string {
  // t() は未定義でも "" を返すので ?? ではなく || でつなぐ
  return (
    modifierLabels.get(type) ||
    t(`${type}_label`, "") ||
    LEVEL_GROWTH_LABELS[type] ||
    type.replace("MODIFIER_VALUE_", "")
  );
}

/**
 * プロパティ1件を「ラベル + 値」の形にする。
 *
 * 表記はゲーム側のトークンをそのまま使う。
 *   <名前>_label     見出し(「武器ダメージ」)
 *   <名前>_prefix    値の前(多くは "{s:sign}" = 符号)
 *   <名前>_postfix   値の後("%" や "m")
 *   <名前>_conditional 条件(「（範囲内）」)
 * 単位や%を自分で推測して付けないこと。
 */
export function formatProperty(
  name: string,
  prop: { rawValue: string; value: number | null },
): { label: string; value: string } {
  const label = t(`${name}_label`, humanize(name)) + t(`${name}_conditional`, "");
  const prefix = t(`${name}_prefix`, "");
  const postfix = t(`${name}_postfix`, "");

  // rawValue は "15m" のように単位付きのことがある。
  // その場合 postfix("m")を足すと "15mm" になるので、既に付いていれば足さない。
  let body = prop.rawValue;
  const tail = postfix && !body.endsWith(postfix) ? postfix : "";

  // "{s:sign}" は値の符号。負なら記号側に出し、数値からは "-" を落とす
  let head = prefix;
  if (prefix.includes("{s:sign}")) {
    const negative = body.startsWith("-") || (prop.value !== null && prop.value < 0);
    head = prefix.replace("{s:sign}", negative ? "−" : "+");
    if (body.startsWith("-")) body = body.slice(1);
  }
  return { label, value: `${head}${body}${tail}` };
}

/** 実装済みヒーローをID順で返す */
export function releasedHeroes(): Hero[] {
  return Object.values(heroesFile.heroes)
    .filter((h) => h.released)
    .sort((a, b) => a.id - b.id);
}

/**
 * ヒーロータグ(ゲーム内ヒーローセレクトの3語)。
 * トークンは citadel_heroes の Citadel_<名前>_HeroTag_1..3。
 * <名前> はキー由来のコードネームだったり表示名だったりで規則が一定しないため、
 * 実在を確認した対応表を持つ(2026-09-07 時点、実装済み38体すべて解決)。
 */
const HERO_TAG_BASE: Record<string, string> = {
  hero_inferno: "Inferno", hero_gigawatt: "Gigawatt", hero_hornet: "Vindicta", hero_ghost: "Geist",
  hero_atlas: "Abrams", hero_wraith: "Wraith", hero_forge: "Engineer", hero_chrono: "Chrono",
  hero_dynamo: "Dynamo", hero_kelvin: "Kelvin", hero_haze: "Haze", hero_astro: "Astro",
  hero_bebop: "Bebop", hero_nano: "Nano", hero_orion: "Orion", hero_krill: "Digger",
  hero_shiv: "Shiv", hero_tengu: "Tengu", hero_warden: "Warden", hero_yamato: "Yamato",
  hero_lash: "Lash", hero_viscous: "Viscous", hero_synth: "Synth", hero_mirage: "Mirage",
  hero_viper: "Viper", hero_magician: "Magician", hero_vampirebat: "VampireBat", hero_drifter: "Drifter",
  hero_priest: "Priest", hero_frank: "Frank", hero_bookworm: "Bookworm", hero_doorman: "Doorman",
  hero_punkgoat: "Punkgoat", hero_necro: "Necro", hero_fencer: "Fencer", hero_familiar: "Familiar",
  hero_werewolf: "Werewolf", hero_unicorn: "Unicorn",
};
export function heroTags(hero: Hero): string[] {
  const base = HERO_TAG_BASE[hero.key];
  if (!base) return [];
  return [1, 2, 3].map((n) => t(`Citadel_${base}_HeroTag_${n}`, "")).filter(Boolean);
}

/**
 * スキルの補足メモ。data/hero-notes.json(キーはアビリティの実ID、値は文字列配列)。
 * 内容はこちらで自前に書くもので、他サイトの文章は使わない。
 */
const heroNotesFile = heroNotesJson as unknown as { notes: Record<string, string[]> };
export function heroNotes(abilityKey: string): string[] {
  return heroNotesFile.notes[abilityKey] ?? [];
}

/**
 * アイテムの補足メモ。data/item-notes.json(キーはアイテムの実ID、値は文字列配列)。
 * heroNotes と同じく自前で書く欄。生データだけでは分からない仕様の但し書きだけを置く。
 */
const itemNotesFile = itemNotesJson as unknown as { notes: Record<string, string[]> };
export function itemNotes(itemId: string): string[] {
  return itemNotesFile.notes[itemId] ?? [];
}

/** ショップに並ぶアイテムを ティア → 名前 順で返す */
export function shopItems(): Item[] {
  return Object.values(itemsFile.items)
    .filter((i) => i.inShop)
    .sort(
      (a, b) =>
        a.tier - b.tier || t(a.nameToken, a.id).localeCompare(t(b.nameToken, b.id)),
    );
}

export function ability(id: string): Ability | undefined {
  return abilitiesFile.abilities[id];
}

/** アイテムを実IDで引く */
export function item(id: string): Item | undefined {
  return itemsFile.items[id];
}

/**
 * 「このアイテムを素材にしている上位アイテム」の逆引き。
 * componentItems は下向きの参照しか持たないため、一度だけ作って使い回す。
 */
const usedInIndex = (() => {
  const map = new Map<string, string[]>();
  for (const i of Object.values(itemsFile.items)) {
    for (const c of i.componentItems) {
      map.set(c, [...(map.get(c) ?? []), i.id]);
    }
  }
  return map;
})();

export function usedIn(id: string): Item[] {
  return (usedInIndex.get(id) ?? [])
    .map((x) => itemsFile.items[x])
    .filter((x): x is Item => Boolean(x) && x.inShop);
}

/** アイテムTYPEの日本語表記とCSS変数名 */
export const SLOT_META = {
  WeaponMod: { label: "武器", cssVar: "weapon" },
  Armor: { label: "生命力", cssVar: "vitality" },
  Tech: { label: "スピリット", cssVar: "spirit" },
} as const;

/**
 * アイテムのホバーカード用データ(ビルド画面・アイテム一覧・トップで共用)。
 * ItemHoverCard.astro が受け取る形。値はすべてゲームの生データ由来。
 */
export function itemHoverData(i: Item) {
  return {
    name: t(i.nameToken, i.id),
    slotLabel: i.slotType ? SLOT_META[i.slotType].label : "",
    cssVar: i.slotType ? SLOT_META[i.slotType].cssVar : "accent",
    tier: i.tier,
    cost: i.cost,
    slotCost: i.slotCost,
    badge: i.isImbue ? "IMBUE" : i.activation !== "PASSIVE" ? "ACTIVE" : null,
    desc: describe(i.descToken, i.properties),
    passives: i.passiveProperties
      .filter((n) => i.properties[n])
      .map((n) => formatProperty(n, i.properties[n]!)),
    conditional: i.tooltip
      .flatMap((s) => [...s.elevatedProperties, ...s.properties])
      .filter((n, idx, a) => a.indexOf(n) === idx && !i.passiveProperties.includes(n))
      .filter((n) => i.properties[n])
      .map((n) => formatProperty(n, i.properties[n]!)),
    components: i.componentItems
      .map((c) => itemsFile.items[c])
      .filter((c): c is Item => c !== undefined)
      .map((c) => t(c.nameToken, c.id)),
    usedIn: usedIn(i.id).map((c) => t(c.nameToken, c.id)),
  };
}

/** ソウルを 3桁区切りにする */
export function souls(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * 更新履歴。GameTracking-Deadlock の更新で data/*.json が変わったときの差分要約。
 * data/updates.json を新しい順で返す。将来は上流コミットの差分から自動生成する。
 *
 * adjustments は「そのパッチでどのヒーロー/アイテムが強化/弱体/リワークされたか」の一覧。
 * key はヒーローなら hero.key、アイテムなら item.id。note は差分の短い説明(任意)。
 * これも tools/gen-updates で before/after の data/*.json を突き合わせて生成する。
 */
export type AdjustmentKind = "buff" | "nerf" | "rework";
export interface Adjustment {
  kind: AdjustmentKind;
  target: "hero" | "item";
  key: string;
  note?: string;
}
export interface SiteUpdate {
  date: string;
  upstreamCommit: string | null;
  title: string;
  changes: string[];
  adjustments?: Adjustment[];
}
const updatesFile = updatesJson as unknown as {
  upstreamRepo: string;
  entries: SiteUpdate[];
};
export const upstreamRepo = updatesFile.upstreamRepo;
export function siteUpdates(): SiteUpdate[] {
  return [...updatesFile.entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** ヒーローを内部キー(hero_inferno など)で引く */
export function heroByKey(key: string): Hero | undefined {
  return Object.values(heroesFile.heroes).find((h) => h.key === key);
}

/** そのエンティティに対する調整履歴。新しい順。 */
export interface AdjustmentHistoryRow {
  date: string;
  title: string;
  upstreamCommit: string | null;
  kind: AdjustmentKind;
  note?: string;
}
function adjustmentsFor(target: "hero" | "item", key: string): AdjustmentHistoryRow[] {
  return siteUpdates().flatMap((u) =>
    (u.adjustments ?? [])
      .filter((a) => a.target === target && a.key === key)
      .map((a) => ({
        date: u.date,
        title: u.title,
        upstreamCommit: u.upstreamCommit,
        kind: a.kind,
        note: a.note,
      })),
  );
}
export const heroAdjustments = (heroKey: string): AdjustmentHistoryRow[] =>
  adjustmentsFor("hero", heroKey);
export const itemAdjustments = (itemId: string): AdjustmentHistoryRow[] =>
  adjustmentsFor("item", itemId);
