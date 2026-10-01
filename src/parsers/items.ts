/** abilities.vdata (EAbilityType_Item) + generic_data.vdata → items.json */

import type { Kv3Object } from "./kv3.ts";
import { readVdata, resolveEntry, num, tierNumber, stripEnumPrefix } from "./vdata.ts";
import { withModifierRefs } from "./modifiers.ts";
import {
  arr,
  str,
  strList,
  parseProperties,
  parsePassiveProperties,
  parseTooltip,
  parseUpgrades,
} from "./properties.ts";
import type { ItemSlotType } from "../types/hero.ts";
import type { Item, ItemsFile } from "../types/item.ts";

/**
 * 未実装ティアの目印。
 * m_nItemPricePerTier が T1〜T4 は 800/1600/3200/6400 と規則的なのに対し、
 * 未実装のティアだけ 9999 が入る。実装されれば実価格に変わるので、
 * ティア番号を直書きせずこの値で判定する。
 */
const PLACEHOLDER_PRICE = 9999;

/** "EShopFilterWeaponDamage | EShopFilterClipSize" → 配列 */
function parseShopFilters(v: string | null): string[] {
  if (!v) return [];
  return v.split("|").map((x) => x.trim()).filter(Boolean);
}

/** generic_data.vdata から ティア別価格 [0, 800, 1600, ...] を読む */
export function parseItemPrices(genericDataPath: string): number[] {
  const g = readVdata(genericDataPath);
  return arr(g["m_nItemPricePerTier"]).map((n) => num(n));
}

export function parseItems(
  abilitiesPath: string,
  genericDataPath: string,
  upstreamCommit: string,
): ItemsFile {
  const root = readVdata(abilitiesPath);
  const prices = parseItemPrices(genericDataPath);

  const items: Record<string, Item> = {};
  for (const key of Object.keys(root)) {
    const raw = root[key];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    if ((raw as Kv3Object)["m_eAbilityType"] !== "EAbilityType_Item") continue;

    const e = resolveEntry(root, key);
    const slotRaw = str(e["m_eItemSlotType"]);
    const slot = slotRaw ? stripEnumPrefix(slotRaw, "EItemSlotType_") : null;
    const tier = tierNumber(e["m_iItemTier"]);
    const cost = prices[tier] ?? 0;
    const shopIcon = str(e["m_strShopIconLarge"]);
    const unreleasedTier = cost === PLACEHOLDER_PRICE;

    items[key] = {
      id: key,
      nameToken: key,
      descToken: `${key}_desc`,
      // Invalid はショップに並ばない内部エントリ
      slotType: slot === "Invalid" || slot === null ? null : (slot as ItemSlotType),
      tier,
      cost,
      // ティアごと未実装。価格が入れば自動的に false に戻る
      unreleasedTier,
      activation: stripEnumPrefix(
        String(e["m_eAbilityActivation"] ?? ""),
        "CITADEL_ABILITY_ACTIVATION_",
      ),
      slotCost: num(e["m_nUpgradeSlotCost"]),
      isImbue: (str(e["m_TargetAbilityEffectsToApply"]) ?? "").includes("IMBUE"),
      shopFilters: parseShopFilters(str(e["m_eShopFilters"])),
      // ショップアイコンを持つものだけが購入できるアイテム。
      // 持たないものは継承用テンプレート(armor_upgrade_t1 など)やテスト用エントリ。
      // 未実装ティアのアイテムはアイコンを持っていても店頭には並ばない。
      inShop: shopIcon !== null && e["m_bDisabled"] !== true && !unreleasedTier,
      disabled: e["m_bDisabled"] === true,
      componentItems: strList(e["m_vecComponentItems"]),
      passiveProperties: parsePassiveProperties(e["m_AutoIntrinsicModifiers"]),
      properties: parseProperties(e["m_mapAbilityProperties"]),
      upgrades: parseUpgrades(e["m_vecAbilityUpgrades"]),
      tooltip: parseTooltip(e["m_vecTooltipSectionInfo"]),
      shopIcon,
      // 効果(状態異常・バフ)の判定材料。無ければ項目ごと付けない(src/parsers/modifiers.ts)
      ...withModifierRefs(e),
    };
  }

  return {
    schemaVersion: 1,
    upstreamCommit,
    generatedAt: new Date().toISOString(),
    itemPricePerTier: prices,
    items,
  };
}
