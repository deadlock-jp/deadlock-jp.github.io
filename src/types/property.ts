/** アイテムとスキルで共通の「数値プロパティ」定義 */

import type { ModifierValueKey, StatKey } from "./hero.ts";

/**
 * スケーリング定義。
 * この値がスピリットパワー等のステータスに応じて増える場合の係数。
 * deadlock.wiki の「スピリットダメージ = 基礎値 + スピリットパワー × 係数」の係数が statScale。
 */
export interface PropertyScale {
  /** scale_function_tech_damage など */
  fn: string;
  /** 係数。無ければ null */
  statScale: number | null;
  /** どのステータスでスケールするか(ETechPower など) */
  statType: string | null;
  /** 複数ステータスでスケールする場合 */
  scalingStats: string[];
}

export interface AbilityProperty {
  /** プロパティ名。ローカライズのラベルキーにもなる */
  name: string;
  /** 生の値。"30" や "2.0m" のように単位付き文字列のことがある */
  rawValue: string;
  /** 数値化した値。解釈できなければ null */
  value: number | null;
  /** 加算先。ヒーロー基礎値・レベルボーナス・購入ボーナスと共通の名前空間 */
  providedType: ModifierValueKey | null;
  /** ショップ表示上のステータス種別 */
  displayType: StatKey | null;
  /** EDisplayUnit_Meters など */
  units: string | null;
  cssClass: string | null;
  /** スピリットパワー等によるスケーリング。無ければ null */
  scale: PropertyScale | null;
  /**
   * m_bIsAbilityDamageProperty。そのスキルの主ダメージであることを示す。
   * ゲーム内の「スピリットパワーの影響値」の一覧はこのフラグが立ったものを並べている。
   */
  isAbilityDamage: boolean;
  /**
   * m_strLocTokenOverride。ラベル・説明文中の{s:X}参照に使う別名。
   * 内部プロパティ名(name)とローカライズ上の呼び名が違うことがある
   * (例: ability_doorman_bomb の "ProjectileFuse" は表示上・説明文中では
   * "BellLifetime" として扱われ、"ProjectileFuse_label" は存在しない)。
   * 無ければ null(その場合は name をそのまま使う)。
   */
  labelOverride: string | null;
}

/** ツールチップの構成。表示順の再現に使う */
export interface TooltipSection {
  /** EArea_Innate など */
  area: string;
  properties: string[];
  elevatedProperties: string[];
}

/** レベルアップ1段階ぶんの強化内容 */
export interface PropertyUpgrade {
  property: string;
  bonus: string;
}
