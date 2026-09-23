/** data/snapshots/<version>/*.json の読み込みと、表示名の解決 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import updatesJson from "../../data/updates.json" with { type: "json" };
import heroNotesJson from "../../data/hero-notes.json" with { type: "json" };
import itemNotesJson from "../../data/item-notes.json" with { type: "json" };
import objectNotesJson from "../../data/object-notes.json" with { type: "json" };
import soulsNotesJson from "../../data/souls-notes.json" with { type: "json" };
import propertyLabelsJson from "../../data/property-labels.json" with { type: "json" };
import itemStatsJson from "../../data/item-stats.json" with { type: "json" };
import heroStatsJson from "../../data/hero-stats.json" with { type: "json" };
import type { HeroesFile, Hero } from "../types/hero.ts";
import type { ItemsFile, Item } from "../types/item.ts";
import type { AbilitiesFile, Ability } from "../types/ability.ts";
import type { LocalizationFile } from "../types/localization.ts";
import type { AdjustmentKind, AdjustmentChange, Adjustment } from "./adjustments.ts";
import {
  economyBucketOf,
  ECONOMY_BUCKET_LABEL,
  economyFieldLabel,
  economyValueText,
  type EconomyBucket,
} from "./economyLabels.ts";
import {
  isUpgradePath,
  upgradeTierOf,
  fieldNameOf,
  isScalePath,
  weaponFieldOf,
  WEAPON_FIELDS,
  abilityKeyOf,
  classifyChanges,
} from "./adjustments.ts";

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
 * ステータス名の表示ラベル。
 *
 * Valve のトークンは末尾が "_label" のものと "_Label" のものが混在していて、
 * 素直に `${name}_label` だけを引くと8件ほどが日本語を持っているのに英語へ落ちる
 * (HealingPerCast_Label / DOTDuration_Label など)。describe() が {s:X} の参照で
 * 大文字小文字を無視して再探索しているのと同じ理由で、ここでも両方見る。
 */
const labelTokenIndex = new Map<string, string>();
for (const file of [localization, localizationEn]) {
  for (const key of Object.keys(file.tokens)) {
    const lower = key.toLowerCase();
    if (lower.endsWith("_label") && !labelTokenIndex.has(lower)) labelTokenIndex.set(lower, key);
  }
}
/** ゲーム側に日本語が1つも無いプロパティの自前の名前(data/property-labels.json) */
const ownLabels = (propertyLabelsJson as unknown as { labels: Record<string, string> }).labels;

export function statLabel(name: string, fallback?: string): string {
  const exact = t(`${name}_label`, "");
  if (exact) return exact;
  const key = labelTokenIndex.get(`${name}_label`.toLowerCase());
  const viaLabel = key ? t(key, "") : "";
  if (viaLabel) return viaLabel;
  /*
   * "_postvalue_label"(値の後ろに添える表記)しか持たない項目がある。
   * 1223件あり "_label"(1108件)より多く、中身は同じ日本語なので流用する。
   * これを見ていなかったため「BouncePadExtendDuration」のような内部名が出ていた。
   */
  const pvKey = labelTokenIndex.get(`${name}_postvalue_label`.toLowerCase());
  const viaPostvalue = pvKey ? t(pvKey, "") : "";
  if (viaPostvalue) return viaPostvalue;
  return ownLabels[name] ?? fallback ?? humanize(name);
}

/**
 * value(数値文字列。例: "8m")の末尾から、数字の直後に続く非数字部分だけを
 * 単位として取り出す。無ければ空文字("125"のような単位無しの値、
 * または数値として読めない値)。
 */
function trailingUnit(value: string): string {
  return value.match(/^-?\d+(?:\.\d+)?([^\d]*)$/)?.[1] ?? "";
}

/**
 * postfix(例: " m", " m／秒")のうち、value(例: "4m", "8m")が既に埋め込んでいる
 * 単位の部分を取り除いた残りを返す(足す必要がある分だけになる)。
 *
 * postfix には素の数値の後に付けたときに読みやすいよう前に半角スペースを
 * 持つものがあり(" m")、rawValue 側はスペース無しで単位を持つ("4m")ため、
 * 単純な endsWith だけでは二重付与("4 m"/"4mm")を見逃す。
 * また "m／秒" のような複合単位で、value 側が先頭の "m" 部分だけを
 * 既に含んでいることもある("8m" + " m／秒" → "8m m／秒" になってしまう)。
 * value 側の単位が postfix のどこかに現れていれば、そこまでを重複として
 * postfix から取り除く。
 */
export function dedupedTail(value: string, postfix: string): string {
  if (!postfix) return postfix;
  const unit = trailingUnit(value);
  if (!unit) return postfix;
  const idx = postfix.indexOf(unit);
  return idx === -1 ? postfix : postfix.slice(idx + unit.length);
}

/**
 * Valveの説明文に埋め込まれたプレースホルダを解決する。
 *
 *   {s:PropName}                          → そのアイテム/スキル自身のプロパティ値
 *   {s:hero_name} など                    → properties に無ければ extra から(第4引数)
 *   {g:citadel_inline_attribute:'X'}      → 文中に埋め込むステータス名
 *
 * 埋め込み名は "InlineAttribute_X" が正しい引き先で、
 * ステータス行の見出しに使う "X_label" とは訳が違うものがある
 * (BonusFireRate: 「ボーナス発射速度」/「発射速度」)。
 * InlineAttribute_ を優先し、無いものだけ _label に落とす。
 *
 * 解決できないものは読める形に整えて残す(空欄にすると文意が壊れるため)。
 *
 * extra: {s:...} のうちプロパティではないもの(例: "自身"のヒーロー名を指す
 * {s:hero_name})を解決するための差し込み値。ability/skillのdescTokenは
 * ヒーロー詳細ページの文脈で呼ばれるので、そこから hero_name を渡す。
 *
 * {s:X} は、プロパティの内部名(name)ではなく m_strLocTokenOverride の名前で
 * 参照されることがある(例: ability_doorman_bomb の "ProjectileFuse" は
 * 説明文中では {s:BellLifetime} として出てくる)。properties[X] に無ければ
 * labelOverride === X のプロパティを探す。
 *
 * ほかにも Valve 側の説明文自体が一点物のズレを持つことがある:
 *   - 大文字小文字の打ち間違い(例: 実際は "AbilityCharges" なのに
 *     説明文だけ "AbilitYCharges" と参照している)→ 大文字小文字を無視して再探索
 *   - 末尾に "_scale" を付けた別名で同じ値を指す(例: "MaxBonusBulletDamage_scale")
 *     → "_scale" を外して再探索
 * ゲーム本体のツールチップは実際にこの2つを解決して正しい値を出すため
 * (実測で確認済み)、こちらも同じ挙動に合わせる。
 */
export function describe(
  descToken: string,
  properties: Record<string, { rawValue: string; labelOverride?: string | null }> = {},
  fallback = "",
  extra: Record<string, string> = {},
): string {
  const raw = t(descToken, fallback);
  if (!raw) return "";
  const byOverride = (key: string): string | undefined =>
    Object.values(properties).find((p) => p.labelOverride === key)?.rawValue;
  const byCaseInsensitive = (key: string): string | undefined => {
    const lower = key.toLowerCase();
    const found = Object.entries(properties).find(([name]) => name.toLowerCase() === lower);
    return found?.[1].rawValue;
  };
  const resolveProp = (prop: string): string | undefined => {
    const direct = properties[prop]?.rawValue ?? byOverride(prop) ?? extra[prop];
    if (direct !== undefined) return direct;
    if (prop.endsWith("_scale")) {
      const base = prop.slice(0, -"_scale".length);
      const scaled = properties[base]?.rawValue ?? byOverride(base);
      if (scaled !== undefined) return scaled;
    }
    return byCaseInsensitive(prop);
  };
  /*
   * {s:X} を手動で1つずつ置換する(String.replaceの単純な置換だと、テンプレ側が
   * 値の直後に単位を重ねて書いている場合に対応できない)。
   * 例1: ability_werewolf_transformation の "{s:BonusMoveSpeed} m／秒" は、
   *   BonusMoveSpeedの値が既に"4m"のように単位を含むため、そのまま置換すると
   *   "4 m／秒"のように単位が二重になる。
   * 例2: ability_bounce_pad の "{s:SpeedOnLand}m／秒" は、SpeedOnLandに
   *   _postfixトークン自体が無いのに値("4m")が単位を含む(vdata側で既に
   *   単位付きの文字列として持っている)。
   * どちらも値はそのまま使い、テンプレ側の重複した単位表記だけを読み飛ばす。
   * 単位はまず正式な_postfixトークンから、無ければ値自身の末尾(数値の後ろに
   * 続く非数字部分)から拾う。"m／秒"のような複合単位で値側が先頭の"m"だけ
   * 持っている場合もあるため、postfixの中でvalの単位と重なる位置を探し、
   * その重なりぶんだけをテンプレ側から読み飛ばす(dedupedTailの逆: こちらは
   * テンプレ側を削る)。新しい単位を推測して足すことはしない。
   */
  let withProps = "";
  let cursor = 0;
  for (const m of raw.matchAll(/\{s:([A-Za-z0-9_]+)\}/g)) {
    const prop = m[1];
    const offset = m.index;
    withProps += raw.slice(cursor, offset);
    cursor = offset + m[0].length;
    const val = resolveProp(prop);
    if (val === undefined) {
      withProps += "?";
      continue;
    }
    const valUnit = trailingUnit(val);
    if (valUnit) {
      const postfix = t(`${prop}_postfix`, "");
      const candidates = [...new Set([postfix, postfix.trim(), valUnit])].filter(Boolean);
      for (const cand of candidates) {
        const idx = cand.indexOf(valUnit);
        if (idx === -1) continue;
        const span = cand.slice(0, idx + valUnit.length);
        if (raw.startsWith(span, cursor)) {
          cursor += span.length;
          break;
        }
      }
    }
    withProps += val;
  }
  withProps += raw.slice(cursor);

  const resolved = withProps
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
  prop: { rawValue: string; value: number | null; labelOverride?: string | null },
): { label: string; value: string; unit: string } {
  // m_strLocTokenOverride があれば、ラベル系トークンはそちらの名前で引く
  // (例: ability_doorman_bomb の "ProjectileFuse" は "BellLifetime_label" しか無い)
  const lookupName = prop.labelOverride ?? name;
  const baseLabel = statLabel(lookupName, humanize(name));
  const cond = t(`${lookupName}_conditional`, "");
  // ラベルに既に条件が含まれていることがある(例: "対NPC武器ダメージ" + "対NPC" →
  // 素直に足すと "対NPC武器ダメージ対NPC" になる)。buildModifierLabels() と同じ回避
  const label = cond && !baseLabel.includes(cond) ? baseLabel + cond : baseLabel;
  const prefix = t(`${lookupName}_prefix`, "");
  const postfix = t(`${lookupName}_postfix`, "");

  // rawValue は "15m" のように単位付きのことがある。
  // その場合 postfix("m")を足すと "15mm" になるので、重複ぶんは足さない。
  let body = prop.rawValue;
  const tail = dedupedTail(body, postfix);

  // "{s:sign}" は値の符号。負なら記号側に出し、数値からは "-" を落とす
  let head = prefix;
  if (prefix.includes("{s:sign}")) {
    const negative = body.startsWith("-") || (prop.value !== null && prop.value < 0);
    head = prefix.replace("{s:sign}", negative ? "−" : "+");
    if (body.startsWith("-")) body = body.slice(1);
  }
  const value = `${head}${body}${tail}`;
  // 末尾がpostfixと一致する分だけを「単位」として切り出す(表示上、数値より小さく暗くするため)。
  // rawValueに既にpostfixが含まれていた場合もここで拾える。新しい単位を推測して足すことはしない。
  const postfixTrim = postfix.trim();
  const unit = value.endsWith(postfix) ? postfix : postfixTrim && value.endsWith(postfixTrim) ? postfixTrim : "";
  return { label, value, unit };
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

/**
 * オブジェクトの補足メモ。data/object-notes.json(キーはオブジェクトの実ID)。
 * ソウル獲得システム・キャラクターコントロールも同じ形(id -> string[])で、
 * それぞれ data/souls-notes.json / data/controls-notes.json に持つ。
 */
const objectNotesFile = objectNotesJson as unknown as { notes: Record<string, string[]> };
export function objectNotes(objectId: string): string[] {
  return objectNotesFile.notes[objectId] ?? [];
}

const soulsNotesFile = soulsNotesJson as unknown as { notes: Record<string, string[]> };
export function soulsNotes(topicId: string): string[] {
  return soulsNotesFile.notes[topicId] ?? [];
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

/**
 * TIER5(レジェンダリー)アイテム。通常のショップには並ばず(inShop: false)、
 * STREET BRAWL(ストリートブロウル)モードのランダムビルドドラフトにだけ
 * レジェンダリー枠として出現する。ビルドシミュレーターは通常ショップの
 * 再現なので対象外(shopItems() のみを使う)。名前を持たない内部の
 * テンプレート(armor_upgrade_t5 等)は除く。
 */
export function legendaryItems(): Item[] {
  return Object.values(itemsFile.items)
    .filter((i) => i.tier === 5 && t(i.nameToken, ""))
    .sort((a, b) => t(a.nameToken, a.id).localeCompare(t(b.nameToken, b.id)));
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
 * バランス調整の履歴。公式マイナーアップデート1件が1エントリ。
 * data/updates.json を新しい順で返す。
 *
 * adjustments は「そのアップデートでどのヒーロー/アイテムがどう動いたか」の一覧。
 * key はヒーローなら hero.key、アイテムなら item.id。changes にフィールド単位の
 * before/after を持ち、note はそれを1行に畳んだ表示フォールバック。
 * すべて tools/gen-updates.mjs が before/after のスナップショットから生成する。
 *
 * kind の決め方(バフ/ナーフの判定ルール):
 *   1. 項目ごとの向きは tools/diff/fields.mjs の goodOf()。判定できないものは null
 *   2. スキル/アイテム単位では、まず基礎値(properties・stat・growth・cost)だけを数える。
 *      有利のみ=buff / 不利のみ=nerf / 両方=mixed。基礎値の変更が0件のときだけ
 *      AP強化(upgrades)で同じ判定をする
 *   3. ヒーロー単位では、スキルごとの判定を集めて同じ規則で畳む
 *   rework だけは機械判定しない。公式ノートが「リワーク」と書いているときに
 *   updates.json へ手で書く上書き(数値ではなく分類ラベルなのでルール6の対象外)
 */
export type { AdjustmentKind, AdjustmentChange, Adjustment } from "./adjustments.ts";
export { ADJUSTMENT_LABEL, classifyChanges, combineKinds } from "./adjustments.ts";
export interface SiteUpdate {
  date: string;
  upstreamCommit: string | null;
  title: string;
  changes: string[];
  adjustments?: Adjustment[];
  /** 比較に使ったスナップショット(監査用) */
  fromVersion?: string;
  toVersion?: string;
  /** 元になった公式パッチノート(tools/gen-updates.mjsがdata/patch-notes.jsonから自動で付与) */
  sourceTitle?: string;
  sourceUrl?: string;
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


/**
 * 1件の Adjustment を表示用にほぐす。
 *
 * data/updates.json に入っているのは実ID(パス)と数値だけなので、ラベル・単位・
 * スキル名は「現在の」スナップショットから引く。ゲーム内日本語が後で増えれば、
 * 過去のアップデートの表示も作り直さずに直る。
 * 単位や符号はここで推測せず、formatProperty() と同じ *_label / *_prefix /
 * *_postfix トークンを使う(CLAUDE.md「単位や%を自分で推測して付けないこと」)。
 */
export interface AdjustmentRow {
  path: string;
  label: string;
  /** AP強化の段(1-3)。基礎値なら null */
  tier: number | null;
  /** スピリット倍率の行。値は "×0.6" の形で出す */
  isScale: boolean;
  /** 表示済みの値。"34秒" "+0.76" "16.5m" など。追加・削除なら片方が null */
  fromText: string | null;
  toText: string | null;
  good: boolean | null;
}
export interface AdjustmentGroup {
  /** "system" は target === "system"(economy.json由来)の1カテゴリ */
  scope: "stat" | "weapon" | "ability" | "item" | "system";
  /** scope === "ability" のときだけ。/abilities/<key>/ のIDでもある */
  abilityKey: string | null;
  name: string;
  /** abilities.json / items.json の image。解決は AbilityIcon などに任せる */
  image: string | null;
  kind: AdjustmentKind;
  rows: AdjustmentRow[];
}

/**
 * Source 2 の距離は 1 unit = 1 inch。src/lib/gamestats.ts の UNITS_PER_METER と同じ値だが、
 * gamestats はこのモジュールを読む側なので、循環 import を作らないようここに置く。
 */
const UNITS_PER_METER = 39.37;

/**
 * ヒーローの基礎ステータス(E*)の表示名。
 *
 * これらはゲーム側に "<名前>_label" のトークンが1つも無く、humanize() に落ちると
 * "EStamina Regen Per Second" のような内部名がそのまま画面に出てしまう。
 * ヒーローページ(src/lib/gamestats.ts の vitalityRows)が既に日本語を決めているので、
 * 表記が食い違わないよう同じ言葉をここでも使う。
 *
 * スタミナはヒーローページでは 1÷値 を「スタミナクールダウン」として見せているが、
 * ここで出すのは変換前の生の値なので「スタミナ回復」と呼び分ける。
 */
const BASE_STAT_LABEL: Record<string, string> = {
  EMaxHealth: "最大HP",
  EBaseHealthRegen: "HPリジェネ",
  EMaxMoveSpeed: "移動速度",
  ESprintSpeed: "スプリント速度",
  ECrouchSpeed: "しゃがみ速度",
  EStamina: "スタミナ",
  EStaminaRegenPerSecond: "スタミナ回復",
  ELightMeleeDamage: "近接弱攻撃",
  EHeavyMeleeDamage: "近接強攻撃",
  EGroundDashDistanceInMeters: "地上ダッシュ距離",
  EGroundDashDuration: "地上ダッシュ時間",
  EAirDashDistanceInMeters: "空中ダッシュ距離",
  EAirDashDuration: "空中ダッシュ時間",
};

/** プロパティ名から表示ラベルを引く。m_strLocTokenOverride があればそちら優先 */
function adjustmentLabel(name: string, source: Ability | Item | undefined): string {
  const override = source?.properties?.[name]?.labelOverride ?? null;
  return statLabel(override ?? name, BASE_STAT_LABEL[name] ?? humanize(name));
}

/**
 * 数値に単位を付ける。AP強化の増分には符号も付ける(SkillCard の upgrades と同じ体裁)。
 * スピリット倍率は SkillCard のダメージタイルと同じく "×0.6" と出す(単位は付かない)。
 */
function adjustmentValueText(
  name: string,
  value: number | null,
  source: Ability | Item | undefined,
  isUpgrade: boolean,
  isScale: boolean,
): string | null {
  if (value === null) return null;
  const body = Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
  /* 基礎値の倍率は "×0.6"、AP強化ぶんの倍率は増分なので "+0.45" と出す */
  if (isScale) return isUpgrade ? `${value >= 0 ? "+" : ""}${body}` : `×${body}`;
  const override = source?.properties?.[name]?.labelOverride ?? null;
  const postfix = t(`${override ?? name}_postfix`, "").trim();
  const sign = isUpgrade && value >= 0 ? "+" : "";
  return `${sign}${body}${dedupedTail(body, postfix)}`;
}

export function adjustmentGroups(a: Adjustment): AdjustmentGroup[] {
  const changes = a.changes ?? [];
  if (changes.length === 0) return [];

  if (a.target === "item") {
    const it = item(a.key);
    return [
      {
        scope: "item",
        abilityKey: null,
        name: it ? t(it.nameToken, it.id) : a.key,
        image: it?.shopIcon ?? null,
        kind: classifyChanges(changes),
        rows: changes.map((c) => adjustmentRow(c, it, true)),
      },
    ];
  }

  /*
   * ヒーロー・アイテムどちらにも属さない全体調整(economy.json由来)。
   * カテゴリ(建造物破壊のソウル/キルの分配/…)ごとに1つのまとまりにする
   * (ヒーローのスキルごとの分け方と同じ考え方。1本にまとめると全部同じ「システム全体の
   * 調整」という名前になって、上のエンティティ名と重複して読みにくくなる)。
   */
  if (a.target === "system") {
    const buckets: EconomyBucket[] = ["objective", "kill", "rejuv", "rift", "breakable"];
    const groups: AdjustmentGroup[] = [];
    for (const b of buckets) {
      const rows = changes.filter((c) => economyBucketOf(c.path) === b);
      if (rows.length === 0) continue;
      groups.push({
        scope: "system",
        abilityKey: null,
        name: ECONOMY_BUCKET_LABEL[b],
        image: null,
        kind: classifyChanges(rows),
        rows: rows.map((c) => adjustmentRow(c, undefined)),
      });
    }
    return groups;
  }

  const hero = heroByKey(a.key);
  const groups: AdjustmentGroup[] = [];

  // ヒーローの基礎ステータス・レベル成長は1つのまとまりとして扱う(1スキルと同格)
  const statChanges = changes.filter(
    (c) => abilityKeyOf(c.path) === null && weaponFieldOf(c.path) === null,
  );
  if (statChanges.length > 0) {
    groups.push({
      scope: "stat",
      abilityKey: null,
      name: "基礎ステータス",
      image: null,
      kind: classifyChanges(statChanges),
      rows: statChanges.map((c) => adjustmentRow(c, undefined)),
    });
  }

  // 主武器。スキルと同格の1まとまり
  const weaponChanges = changes.filter((c) => weaponFieldOf(c.path) !== null);
  if (weaponChanges.length > 0) {
    // 武器名のトークン規則は src/lib/gamestats.ts の weaponName() と同じ
    // (スキルのキーでは引けず、ヒーローキー側でしか引けない)
    const heroKey = a.key.replace(/^hero_/, "");
    groups.push({
      scope: "weapon",
      abilityKey: null,
      name: t(`citadel_weapon_hero_${heroKey}_set`, "主武器"),
      image: null,
      kind: classifyChanges(weaponChanges),
      rows: weaponChanges.map((c) => adjustmentRow(c, undefined)),
    });
  }

  // スキルは持ち主の並び順(Signature_1..4)で。並び順が引けないものは後ろに回す
  const order = new Map((hero?.abilities ?? []).map((x, i) => [x.abilityKey, i]));
  const byAbility = new Map<string, AdjustmentChange[]>();
  for (const c of changes) {
    const key = abilityKeyOf(c.path);
    if (!key) continue;
    const list = byAbility.get(key);
    if (list) list.push(c);
    else byAbility.set(key, [c]);
  }
  const keys = [...byAbility.keys()].sort(
    (x, y) => (order.get(x) ?? 99) - (order.get(y) ?? 99) || x.localeCompare(y),
  );
  for (const key of keys) {
    const ab = ability(key);
    const rows = byAbility.get(key) ?? [];
    groups.push({
      scope: "ability",
      abilityKey: key,
      name: ab ? t(ab.nameToken, key) : key,
      image: ab?.image ?? null,
      kind: classifyChanges(rows),
      rows: rows.map((c) => adjustmentRow(c, ab)),
    });
  }
  return groups;
}

/**
 * isItem: true ならアイテム由来の変更。アイテムには AP1/AP2/AP5 のような段階的強化が無く、
 * upgrades.T1.* は「ストリートブロールのエンハンスド状態」の値でしかないため、
 * アビリティの強化段のように "T1" タグを付けない(tier を常に null にする)。
 */
function adjustmentRow(
  c: AdjustmentChange,
  source: Ability | Item | undefined,
  isItem = false,
): AdjustmentRow {
  const weaponField = weaponFieldOf(c.path);
  if (weaponField !== null) {
    const spec = WEAPON_FIELDS[weaponField];
    const text = (v: number | null): string | null => {
      if (v === null) return null;
      const n = spec?.meters ? v / UNITS_PER_METER : v;
      const body = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
      return `${body}${spec?.unit ?? ""}`;
    };
    return {
      path: c.path,
      label: spec?.label ?? humanize(weaponField.replace(".", " ")),
      tier: null,
      isScale: false,
      fromText: text(c.from),
      toText: text(c.to),
      good: c.good,
    };
  }
  /*
   * 構成素材の組み替え(components.<アイテムID>)。値は在否を表す 1 / null なので、
   * 数字は出さずに「追加」「除外」とだけ見せる(tools/diff/fields.mjs 参照)。
   */
  const componentId = /^components\.(.+)$/.exec(c.path)?.[1];
  if (componentId) {
    const comp = item(componentId);
    return {
      path: c.path,
      label: "構成素材",
      tier: null,
      isScale: false,
      fromText: c.from === null ? null : (comp ? t(comp.nameToken, componentId) : componentId),
      toText: c.to === null ? null : (comp ? t(comp.nameToken, componentId) : componentId),
      good: c.good,
    };
  }
  /*
   * システム全体の調整(economy.json由来)。ゲーム側のトークンを持たない合成キーなので、
   * 末尾の名前だけでなくパス全体から表示名を引く(economyLabels.ts)。
   */
  const economyLabel = economyFieldLabel(c.path);
  if (economyLabel !== null) {
    return {
      path: c.path,
      label: economyLabel,
      tier: null,
      isScale: false,
      fromText: economyValueText(c.path, c.from),
      toText: economyValueText(c.path, c.to),
      good: c.good,
    };
  }
  const name = fieldNameOf(c.path);
  /*
   * ヒーローのレベル成長(growth.MODIFIER_VALUE_*)は "_label" を持たないものが多い。
   * ヒーローページと同じ modifierLabel() で引く(アイテムのプロパティ名からの
   * 投票で表示名を決めている。ここで別に解決すると表記が食い違う)。
   */
  if (c.path.startsWith("growth.")) {
    const text = (v: number | null) =>
      v === null ? null : Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
    return {
      path: c.path,
      label: modifierLabel(name),
      tier: null,
      isScale: false,
      fromText: text(c.from),
      toText: text(c.to),
      good: c.good,
    };
  }
  const upgrade = isUpgradePath(c.path);
  /*
   * AP強化で同じ段に同名プロパティが2つ並ぶときの2つ目は、Valve のデータ上
   * その強化のスピリット倍率(例: T2 の CombatBarrier は 70=バリア量 と 0.76=倍率)。
   * 公式パッチノートも「+80、スケーリング +0.7」と2つ組で書いている。
   * 判定は値の大小ではなく出現順(#2 以降)で行う。
   */
  const scale = isScalePath(c.path) || (upgrade && /#\d+$/.test(c.path));
  const base = name === "cost" ? "価格" : adjustmentLabel(name, source);
  return {
    path: c.path,
    label: scale ? `${base}のスピリット倍率` : base,
    tier: isItem ? null : upgradeTierOf(c.path),
    isScale: scale,
    fromText: adjustmentValueText(name, c.from, source, upgrade, scale),
    toText: adjustmentValueText(name, c.to, source, upgrade, scale),
    good: c.good,
  };
}

/**
 * 公式パッチノート本文のアーカイブ。data/patch-notes.json(tools/fetch-patch-notes.mjsが
 * Steamの公開ニュースAPIから取得)を新しい順で返す。Valve公式の投稿本文そのもので、
 * こちらで書き起こしたものではない。
 *
 * 実体は src/lib/patchNotes.ts。日付との対応付けをツール(tools/gen-updates.mjs)と
 * 共有するため、data.ts からは切り出してある。ここは従来どおりの入り口。
 */
export type { PatchNoteEntry } from "./patchNotes.ts";
export { patchNotes, patchNoteByDate, nearestPatchNote } from "./patchNotes.ts";

/**
 * ヒーロー×アイテムの人気率・勝率。data/item-stats.json
 * (tools/fetch-item-stats.mjs が deadlock-api.com から取得。ゲーム本体由来の
 * data/snapshots/ とは出所も更新周期も別で、数値統計のみ)。
 *
 * items の値は [人気率, 勝率, サンプル試合数]。率は 0.1% 刻みの整数(503 = 50.3%)。
 * キーはヒーローの実ID(数値)を文字列にしたもの。
 */
export interface ItemStatsFile {
  fetchedAt: string;
  window: string;
  lowSampleMatches: number;
  heroes: Record<string, { matches: number; items: Record<string, [number, number, number]> }>;
}
export const itemStats = itemStatsJson as unknown as ItemStatsFile;

/**
 * ランク帯別のヒーロー統計。data/hero-stats.json
 * (tools/fetch-hero-stats.mjs が deadlock-api.com から取得)。
 *
 * buckets のキーは "all"(全ランク)と ランクtier("1"〜"11")。
 * tier はゲーム内のランク名トークン Citadel_ranks_rank<tier-1> に対応する。
 * heroes の値は [ピック率, 勝率, BAN率, 試合数] で、率は 0.1% 刻みの整数。
 *
 * BAN率は「BANされた試合の割合」ではなく【全BANに占めるそのヒーローの割合】。
 * BANデータのある試合数がAPIから取れないため(詳細は fetch-hero-stats.mjs)。
 */
export interface HeroStatsFile {
  fetchedAt: string;
  window: string;
  lowSampleMatches: number;
  banRateNote: string;
  buckets: Record<
    string,
    { matches: number; bans: number; heroes: Record<string, [number, number, number | null, number]> }
  >;
}
export const heroStats = heroStatsJson as unknown as HeroStatsFile;
