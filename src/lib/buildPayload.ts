/**
 * ビルドシミュレーター(src/pages/build/index.astro)がクライアント側で使うデータ。
 * 言語ごとに1つの JSON にして、/data/build-<lang>.<ハッシュ>.json として別ファイルで配る
 * (src/pages/data/[file].json.ts)。ページはそれを <head> で preload し、スクリプトで読む。
 *
 * 以前はページの HTML に埋め込んでいた(/build/ の HTML の半分以上)。
 * ファイル名に中身のハッシュを付けるので、データが変わればファイル名も変わり、古いものは使われない。
 *
 * 全ランクの人気率・勝率はここに入れない。言語に依存しない大きなデータなので、
 * 他のランク帯と同じく /stats/item-stats-<帯>.json をヒーローを選んだときに読む。
 */
import { createHash } from "node:crypto";
import {
  releasedHeroes,
  shopItems,
  t,
  describe,
  formatProperty,
  itemsFile,
  ability,
  usedIn,
  modifierLabel,
  SLOT_META,
  itemStats,
  hasItemStats,
  heroBuilds,
} from "./data.ts";
import { weaponRows, weaponHeadline, weaponName, vitalityRows, spiritRows, abilityDamages } from "./gamestats.ts";
import { COST_BONUS_TARGET } from "../types/hero.ts";
import { BAND_KEYS } from "./rankBands.ts";
import { currentLang } from "../i18n/context.ts";

type ShopItem = ReturnType<typeof shopItems>[number];

/** ホバーカードに出す1行。ゲーム側のトークンで整形済み */
function propRows(names: string[], item: ShopItem) {
  return names.filter((n) => item.properties[n]).map((n) => formatProperty(n, item.properties[n]!));
}

/** いま描いている言語のデータ。base はサイトの接頭辞(import.meta.env.BASE_URL の末尾 / を除いたもの) */
function buildPayload(base: string) {
  const isJa = currentLang() === "ja";
  const heroes = releasedHeroes();
  const items = shopItems();
  return {
    heroes: heroes.map((h) => {
      const weaponSlot = h.abilities.find((a) => a.slot === "Weapon_Primary");
      const weapon = weaponSlot ? (ability(weaponSlot.abilityKey)?.weapon ?? null) : null;
      return {
        id: h.id,
        name: t(h.nameToken, h.key),
        /* ビルドカードの背景 public/images/heroes/card16x9/<key>.webp を引くのに使う */
        key: h.key.replace(/^hero_/, ""),
        levels: h.levels.map((l) => ({
          level: l.level,
          requiredGold: l.requiredGold,
          // 標準レベルアップ = Boon 1。Boon 数を数えるのに使う
          up: l.useStandardUpgrade,
        })),
        // 購入ボーナスはカテゴリへの累計投資額で決まる階段関数
        costBonuses: h.costBonuses,
        weaponHead: weaponHeadline(weapon),
        weaponName: weaponName(h),
        rows: {
          WeaponMod: weaponRows(h, weapon),
          Armor: vitalityRows(h),
          Tech: spiritRows(h),
        },
        /*
         * 実測(実測チェックリストv2, 2026-09-07)で確定した式で最大HP・武器ダメージ・
         * スピリットパワーの実数値をクライアント側で組み立てるための、素の数値。
         */
        calc: {
          baseHealth: h.startingStats.EMaxHealth ?? 0,
          healthPerBoon: h.levelUpBonuses.MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL ?? 0,
          techPowerPerBoon: h.levelUpBonuses.MODIFIER_VALUE_TECH_POWER ?? 0,
          bulletDamage: weapon?.bulletDamage ?? null,
          bulletDamagePerBoon: h.levelUpBonuses.MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL ?? 0,
          cycleTime: weapon?.cycleTime ?? null,
          bulletsPerShot: weapon?.bulletsPerShot ?? 1,
        },
        // ゲーム内の「スピリットパワーの影響値」と同じ並び
        abilities: abilityDamages(h),
      };
    }),
    items: Object.fromEntries(
      items.map((i) => [
        i.id,
        {
          name: t(i.nameToken, i.id),
          /* 日本語以外では英語名でも検索できるようにする */
          ...(isJa ? {} : { nameEn: t(i.nameToken, i.id, "en") }),
          tier: i.tier,
          slot: i.slotType,
          cost: i.cost,
          slotCost: i.slotCost,
          activation: i.activation,
          isImbue: i.isImbue,
          desc: describe(i.descToken, i.properties),
          // 常時パッシブだけを合計ステータスに足す
          mods: i.passiveProperties
            .map((n) => i.properties[n])
            .filter((p) => p?.providedType && p.value !== null)
            .map((p) => ({ type: p!.providedType!, value: p!.value! })),
          passives: propRows(i.passiveProperties, i),
          conditional: i.tooltip
            .flatMap((s) => [...s.elevatedProperties, ...s.properties])
            .filter((n, idx, a) => a.indexOf(n) === idx && !i.passiveProperties.includes(n))
            .filter((n) => i.properties[n])
            .map((n) => formatProperty(n, i.properties[n]!)),
          components: i.componentItems
            .map((c) => itemsFile.items[c])
            .filter((c) => c !== undefined)
            .map((c) => t(c.nameToken, c.id)),
          // 上位アイテムを買ったときに下位を外すための参照。名前ではなくIDで持つ
          componentIds: i.componentItems.filter((c) => itemsFile.items[c] !== undefined),
          usedIn: usedIn(i.id).map((c) => t(c.nameToken, c.id)),
        },
      ]),
    ),
    labels: Object.fromEntries(
      [
        ...new Set([
          ...items.flatMap((i) => i.passiveProperties.map((n) => i.properties[n]?.providedType).filter(Boolean)),
          ...Object.values(COST_BONUS_TARGET).map((c) => c.valueType),
        ]),
      ].map((type) => [type, modifierLabel(type as string)]),
    ),
    costBonusTarget: COST_BONUS_TARGET,
    slotMeta: SLOT_META,
    /**
     * ヒーロー×アイテムの人気率・勝率。ショップの並び替えと数値表示に使う。
     * 中身はランク帯ごとの JSON(src/pages/stats/item-stats-[band].json.ts)で、ヒーローを選んだときに読む
     */
    stats: {
      fetchedAt: itemStats.fetchedAt,
      window: itemStats.window,
      lowSampleMatches: itemStats.lowSampleMatches,
      bandUrls: Object.fromEntries(
        (hasItemStats ? BAND_KEYS : [])
          .filter((k) => itemStats.bands[k])
          .map((k) => [k, `${base}/stats/item-stats-${k}.json`]),
      ),
    },
    /**
     * 人気のビルド。中身はヒーローを選んだときに url の {id} をヒーローIDにして読み込む。
     * heroes はビルドのあるヒーローのID(無いヒーローでは読みに行かない)
     */
    builds: {
      heroes: Object.keys(heroBuilds.heroes).map(Number),
      url: `${base}/stats/hero-builds-{id}.json`,
    },
  };
}

/** 言語ごとに1回だけ作る(ページの描画と JSON の書き出しで同じものを使う) */
const cache = new Map<string, { json: string; file: string; url: string }>();

/**
 * いま描いている言語のデータの JSON 文字列と、その置き場所(/data/<name>-<lang>.<ハッシュ>.json)。
 * file は src/pages/data/[file].json.ts の file(拡張子なし)、url はページから読むときの URL。
 * name はページの種類(build / compare)、make はその中身を作る関数
 */
export function dataFile(name: string, base: string, make: () => unknown) {
  const lang = currentLang();
  const key = `${name}|${base}|${lang}`;
  let hit = cache.get(key);
  if (!hit) {
    const json = JSON.stringify(make());
    const hash = createHash("sha256").update(json).digest("hex").slice(0, 10);
    const file = `${name}-${lang}.${hash}`;
    hit = { json, file, url: `${base}/data/${file}.json` };
    cache.set(key, hit);
  }
  return hit;
}

/** ビルドシミュレーターのデータ(/data/build-<lang>.<ハッシュ>.json) */
export const buildDataFile = (base: string) => dataFile("build", base, () => buildPayload(base));
