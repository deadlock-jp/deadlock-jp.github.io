/** abilities.json のスキーマ定義(アイテム以外のスキル・武器) */

import type { AbilityProperty, PropertyUpgrade, TooltipSection } from "./property.ts";

/** abilities.vdata 上のキー文字列が実ID */
export type AbilityId = string;

export type AbilityKind =
  | "Weapon"
  | "Signature"
  | "Ultimate"
  | "Innate"
  | "Melee"
  | "Cosmetic"
  | "Unknown";

/**
 * 銃の性能。m_WeaponInfo から必要なものだけを抜き出したもの。
 * 連射速度(発/秒)は 1 / cycleTime で求める。
 */
export interface WeaponInfo {
  /** 1発あたりの基礎ダメージ */
  bulletDamage: number | null;
  /** 1トリガーで発射される弾数(ショットガン等) */
  bulletsPerShot: number | null;
  /** 1発の間隔(秒) */
  cycleTime: number | null;
  clipSize: number | null;
  reloadDuration: number | null;
  bulletSpeed: number | null;
  range: number | null;
  burstShotCount: number | null;
  burstShotCooldown: number | null;
  /** 距離減衰 */
  falloff: {
    startRange: number | null;
    endRange: number | null;
    startScale: number | null;
    endScale: number | null;
    bias: number | null;
  };
  /** ヘッドショット倍率 */
  crit: {
    bonusStart: number | null;
    bonusEnd: number | null;
    startRange: number | null;
    endRange: number | null;
    bonusAgainstNPCs: number | null;
  };
  spread: number | null;
  standingSpread: number | null;
  canZoom: boolean;
  /** 射撃中の移動速度倍率 */
  shootMoveSpeedPercent: number | null;
  reloadMoveSpeed: number | null;
  bulletGravityScale: number | null;
  bulletRadius: number | null;
  bulletLifetime: number | null;
}

export interface Ability {
  id: AbilityId;
  /** citadel_heroes のトークン。id と同じ */
  nameToken: string;
  descToken: string;
  kind: AbilityKind;
  /** PASSIVE / INSTANT_CAST / PRESS など */
  activation: string;
  /** スキルの最大レベル。持たなければ null */
  maxLevel: number | null;
  /** 習得に必要なアビリティポイント */
  abilityPointsCost: number | null;
  /** 解放に必要なアンロック数 */
  abilityUnlocksCost: number | null;
  /** 全数値プロパティ。scale にスピリットスケーリング係数が入る */
  properties: Record<string, AbilityProperty>;
  /** 常時乗るプロパティ名(m_AutoIntrinsicModifiers 由来) */
  passiveProperties: string[];
  /** 段階ごとの強化内容 */
  upgrades: PropertyUpgrade[][];
  tooltip: TooltipSection[];
  /** 武器スキルのみ。それ以外は null */
  weapon: WeaponInfo | null;
  image: string | null;
  /**
   * このアビリティが有効な間、一部スロットのアビリティが入れ替わる場合の対応表
   * (スロット名 → 実ID)。実データにあるのはシルバー(人狼)の変身のみ
   * (`ability_werewolf_transformation` の `m_WerewolfModifier.m_mapWerewolfAbilities`)。
   * 該当なしは null。他のヒーローが変身能力を持てば同じ仕組みで拾えるはず。
   */
  alternateFormAbilities: Record<string, string> | null;
}

export interface AbilitiesFile {
  schemaVersion: number;
  upstreamCommit: string;
  generatedAt: string;
  abilities: Record<AbilityId, Ability>;
}
