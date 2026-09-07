/** heroes.vdata → heroes.json */

import type { Kv3Object, Kv3Value } from "./kv3.ts";
import { readVdata, resolveEntry, num, stripEnumPrefix } from "./vdata.ts";
import type {
  Hero,
  HeroLevel,
  HeroesFile,
  ItemSlotType,
  PurchaseBonus,
  CostBonus,
  ShopStatDisplayGroup,
  BoundAbility,
} from "../types/hero.ts";

const SLOT_TYPES: ItemSlotType[] = ["WeaponMod", "Armor", "Tech"];

function obj(v: Kv3Value | undefined): Kv3Object {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Kv3Object) : {};
}
function arr(v: Kv3Value | undefined): Kv3Value[] {
  return Array.isArray(v) ? v : [];
}
function strArr(v: Kv3Value | undefined): string[] {
  return arr(v).filter((x): x is string => typeof x === "string");
}

function parseLevels(v: Kv3Value | undefined): HeroLevel[] {
  const map = obj(v);
  const levels: HeroLevel[] = [];
  for (const [k, raw] of Object.entries(map)) {
    const level = Number(k);
    if (!Number.isFinite(level)) continue;
    const e = obj(raw);
    levels.push({
      level,
      requiredGold: num(e["m_unRequiredGold"]),
      useStandardUpgrade: e["m_bUseStandardUpgrade"] === true,
      bonusCurrencies: Object.fromEntries(
        Object.entries(obj(e["m_mapBonusCurrencies"])).map(([ck, cv]) => [ck, num(cv)]),
      ),
    });
  }
  levels.sort((a, b) => a.level - b.level);
  return levels;
}

function parsePurchaseBonuses(v: Kv3Value | undefined): Record<ItemSlotType, PurchaseBonus[]> {
  const map = obj(v);
  const out = {} as Record<ItemSlotType, PurchaseBonus[]>;
  for (const slot of SLOT_TYPES) {
    out[slot] = arr(map[`EItemSlotType_${slot}`]).map((raw) => {
      const e = obj(raw);
      return {
        tier: num(e["m_nTier"]),
        value: num(e["m_strValue"]),
        valueType: String(e["m_ValueType"] ?? ""),
      };
    });
  }
  return out;
}

/**
 * m_MapModCostBonuses ― カテゴリへの累計投資額に応じたボーナス。
 * フィールド名に m_ 接頭辞が無い点に注意(nGoldThreshold / flBonus / flPercentOnGraph)。
 */
function parseCostBonuses(v: Kv3Value | undefined): Record<ItemSlotType, CostBonus[]> {
  const map = obj(v);
  const out = {} as Record<ItemSlotType, CostBonus[]>;
  for (const slot of SLOT_TYPES) {
    out[slot] = arr(map[`EItemSlotType_${slot}`])
      .map((raw) => {
        const e = obj(raw);
        return {
          goldThreshold: num(e["nGoldThreshold"]),
          bonus: num(e["flBonus"]),
          percentOnGraph: num(e["flPercentOnGraph"]),
        };
      })
      .sort((a, b) => a.goldThreshold - b.goldThreshold);
  }
  return out;
}

/**
 * 画像参照は panorama:"file://{images}/heroes/inferno_sm.psd" の形で入っている。
 * KV3パーサーは panorama: の型プレフィックスを落として文字列にしているので、
 * ここでは値をそのまま受け取る。
 */
function imageRef(v: Kv3Value | undefined): string | null {
  return typeof v === "string" && v.startsWith("file://") ? v : null;
}

function parseMaxPurchases(v: Kv3Value | undefined): Record<ItemSlotType, number[]> {
  const map = obj(v);
  const out = {} as Record<ItemSlotType, number[]>;
  for (const slot of SLOT_TYPES) {
    const info = obj(map[`EItemSlotType_${slot}`]);
    out[slot] = arr(info["m_arMaxPurchasesForTier"]).map((n) => num(n));
  }
  return out;
}

function parseStatGroup(v: Kv3Value | undefined): ShopStatDisplayGroup {
  const e = obj(v);
  return {
    display: strArr(e["m_vecDisplayStats"]),
    other: strArr(e["m_vecOtherDisplayStats"]),
  };
}

function parseBoundAbilities(v: Kv3Value | undefined): BoundAbility[] {
  return Object.entries(obj(v))
    .filter(([, ability]) => typeof ability === "string" && ability !== "")
    .map(([slot, ability]) => ({
      slot: stripEnumPrefix(slot, "ESlot_"),
      abilityKey: String(ability),
    }));
}

export function parseHeroes(vdataPath: string, upstreamCommit: string): HeroesFile {
  const root = readVdata(vdataPath);

  const heroes: Record<string, Hero> = {};
  for (const key of Object.keys(root)) {
    if (!key.startsWith("hero_") || key === "hero_base") continue;

    const h = resolveEntry(root, key);
    const id = num(h["m_HeroID"], -1);
    // 実IDを持たないエントリ(テンプレート等)は出力しない
    if (id <= 0) continue;

    const shop = obj(h["m_ShopStatDisplay"]);

    const playerSelectable = h["m_bPlayerSelectable"] === true;
    const disabled = h["m_bDisabled"] === true;
    const inDevelopment = h["m_bInDevelopment"] === true;

    const hero: Hero = {
      id,
      key,
      // ローカライズ側は "hero_inferno:n" の形式。キーそのままでは引けない。
      nameToken: `${key}:n`,
      roleToken: `${key}_role`,
      playstyleToken: `${key}_playstyle`,
      // 補足: "<key>_lore" にValveの設定文があるが、
      // 「Valve公式文章を丸写ししない」方針のため、意図的に取り込まない。
      playerSelectable,
      disabled,
      inDevelopment,
      released: playerSelectable && !disabled && !inDevelopment,
      complexity: num(h["m_nComplexity"]),
      startingStats: Object.fromEntries(
        Object.entries(obj(h["m_mapStartingStats"])).map(([k, v]) => [k, num(v)]),
      ),
      levels: parseLevels(h["m_mapLevelInfo"]),
      levelUpBonuses: Object.fromEntries(
        Object.entries(obj(h["m_mapStandardLevelUpUpgrades"])).map(([k, v]) => [k, num(v)]),
      ),
      purchaseBonuses: parsePurchaseBonuses(h["m_mapPurchaseBonuses"]),
      costBonuses: parseCostBonuses(h["m_MapModCostBonuses"]),
      maxPurchasesForTier: parseMaxPurchases(h["m_mapItemSlotInfo"]),
      shopStatDisplay: {
        weapon: parseStatGroup(shop["m_eWeaponStatsDisplay"]),
        vitality: parseStatGroup(shop["m_eVitalityStatsDisplay"]),
        spirit: parseStatGroup(shop["m_eSpiritStatsDisplay"]),
      },
      abilities: parseBoundAbilities(h["m_mapBoundAbilities"]),
      images: {
        iconSmall: imageRef(h["m_strIconImageSmall"]),
        heroCard: imageRef(h["m_strIconHeroCard"]),
        minimap: imageRef(h["m_strMinimapImage"]),
      },
    };

    const idKey = String(id);
    if (heroes[idKey]) {
      throw new Error(`ヒーローIDが重複しています: ${id} (${heroes[idKey].key} と ${key})`);
    }
    heroes[idKey] = hero;
  }

  return {
    schemaVersion: 1,
    upstreamCommit,
    generatedAt: new Date().toISOString(),
    heroes,
  };
}
