/** items.json のスキーマ定義 */

import type { ItemSlotType } from "./hero.ts";
import type { ModifierRefs } from "../parsers/modifiers.ts";
import type { AbilityProperty, PropertyUpgrade, TooltipSection } from "./property.ts";

/**
 * アイテムのID。
 * アイテムには数値IDが存在しないため、abilities.vdata 上のキー文字列("upgrade_clip_size")が実ID。
 * 共有URLのキーになるので、独自の連番などに置き換えないこと。
 */
export type ItemId = string;

export interface Item {
  id: ItemId;
  /** citadel_gc_mod_names のトークン。id と同じ */
  nameToken: string;
  /** citadel_mods のトークン */
  descToken: string;
  slotType: ItemSlotType | null;
  /** 1〜5。EModTier_N に対応 */
  tier: number;
  /** ソウル価格。tier から itemPricePerTier で引いた値 */
  cost: number;
  /** そのティア自体がまだゲームに実装されていない(価格がプレースホルダ) */
  unreleasedTier: boolean;
  /** PASSIVE / INSTANT_CAST / PRESS / INSTANT_CAST_TOGGLE */
  activation: string;
  /**
   * インビュー(自分のスキル1つに付与するタイプ)かどうか。
   * m_TargetAbilityEffectsToApply が CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE_* のもの。
   * ショップでは ACTIVE とは別のバッジで区別される。
   */
  isImbue: boolean;
  /** 消費するアイテム枠の数 */
  slotCost: number;
  /** ショップの絞り込みタグ */
  shopFilters: string[];
  /** 実際にショップに並ぶアイテムなら true */
  inShop: boolean;
  disabled: boolean;
  /** このアイテムの素材になっているアイテムのID */
  componentItems: ItemId[];
  /**
   * 装備するだけで常時乗るプロパティ名。
   * m_AutoIntrinsicModifiers に登録されたものだけがここに入る。
   * 成長曲線に加算してよいのはこれだけで、それ以外は条件付き効果。
   */
  passiveProperties: string[];
  /** すべての数値プロパティ。キーはプロパティ名 */
  properties: Record<string, AbilityProperty>;
  /** アイテム自体の強化段階 */
  upgrades: PropertyUpgrade[][];
  tooltip: TooltipSection[];
  shopIcon: string | null;
  /** 効果(状態異常・バフ)の判定材料。src/parsers/modifiers.ts。無ければ項目ごと無い */
  modifiers?: ModifierRefs;
}

export interface ItemsFile {
  schemaVersion: number;
  upstreamCommit: string;
  generatedAt: string;
  /** 添字がティア。[0] は未使用。未実装ティアは 9999 のプレースホルダ */
  itemPricePerTier: number[];
  items: Record<ItemId, Item>;
}
