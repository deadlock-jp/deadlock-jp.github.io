/** heroes.json のスキーマ定義。パーサーとフロントエンドで共有する */

/** MODIFIER_VALUE_* 形式のキー。アイテム・レベルボーナス・購入ボーナスで共通の名前空間 */
export type ModifierValueKey = string;

/** E* 形式のステータスキー(EMaxHealth, EBulletDamage など)。基礎ステータスと表示に使う */
export type StatKey = string;

export type ItemSlotType = "WeaponMod" | "Armor" | "Tech";

/**
 * 旧: アイテムのティアに応じたボーナスとして解釈していたもの。
 *
 * 2026-09-05 の実測で、ゲームが実際に使っているのはこれではなく
 * costBonuses(m_MapModCostBonuses)であることが判明した。
 * このフィールドが何を制御しているのかは未調査のため、消さずに残している。
 * 計算には使わないこと。
 */
export interface PurchaseBonus {
  /** 1〜5 (EModTier_1〜5 に対応) */
  tier: number;
  /** 加算値 */
  value: number;
  /** 加算先のキー(MODIFIER_VALUE_*) */
  valueType: ModifierValueKey;
}

/**
 * カテゴリへの累計投資額に応じたボーナス(m_MapModCostBonuses)。
 *
 * アイテムの個数・種類・ティアは無関係で、そのカテゴリに使った累計ソウル額だけで決まる。
 * 2026-09-05 のゲーム内実測で全33値(3カテゴリ×11段)の一致を確認済み。
 * テーブルは全ヒーローで同一。
 *
 * 引き方は「投資額以下で最大の goldThreshold の段」。中間値を補間してはいけない。
 */
export interface CostBonus {
  /** この段が適用される最低の累計投資額 */
  goldThreshold: number;
  /** ボーナス値。WeaponMod と Armor は%、Tech は平坦値(下記 COST_BONUS_TARGET 参照) */
  bonus: number;
  /** データ側に併記されている別系列の値。用途未調査 */
  percentOnGraph: number;
}

export interface HeroLevel {
  /** 1〜36 */
  level: number;
  /** このレベルに到達するのに必要な累積ソウル */
  requiredGold: number;
  /** true ならこのレベルで levelUpBonuses が加算される */
  useStandardUpgrade: boolean;
  /** EAbilityPoints / EAbilityUnlocks など */
  bonusCurrencies: Record<string, number>;
}

export interface ShopStatDisplayGroup {
  /** 主要表示ステータス */
  display: StatKey[];
  /** 折りたたみ側の表示ステータス */
  other: StatKey[];
}

export interface BoundAbility {
  /** スロット名(ESlot_Signature_1 など) */
  slot: string;
  /** abilities.vdata のキー */
  abilityKey: string;
}

export interface Hero {
  /** ゲーム内部の実ID。共有URLのキーになるので絶対に振り直さない */
  id: number;
  /** heroes.vdata 上のキー(hero_inferno など) */
  key: string;
  /** ヒーロー名のトークン。"hero_inferno:n" のように :n が付く形式 */
  nameToken: string;
  /** 役割(Carry など)のトークン */
  roleToken: string;
  /** プレイスタイル説明のトークン */
  playstyleToken: string;
  playerSelectable: boolean;
  disabled: boolean;
  inDevelopment: boolean;
  /**
   * 実際にゲームで遊べるヒーローか。
   * playerSelectable が true でも開発中・無効のものがあるため、この3つを合わせて判定する。
   */
  released: boolean;
  /** 1〜3 の難易度表記 */
  complexity: number;
  /** 基礎ステータス。キーは E* 形式 */
  startingStats: Record<StatKey, number>;
  /** レベル1〜36の情報 */
  levels: HeroLevel[];
  /** m_bUseStandardUpgrade のレベルで加算される固定値。キーは MODIFIER_VALUE_* */
  levelUpBonuses: Record<ModifierValueKey, number>;
  /**
   * 旧フィールド。計算には使わない(上記 PurchaseBonus のコメント参照)。
   */
  purchaseBonuses: Record<ItemSlotType, PurchaseBonus[]>;
  /** カテゴリへの累計投資額に応じたボーナス。goldThreshold 昇順 */
  costBonuses: Record<ItemSlotType, CostBonus[]>;
  /** TYPEごとのティア別購入上限 */
  maxPurchasesForTier: Record<ItemSlotType, number[]>;
  /** ショップ画面のカテゴリ別表示ステータス。成長曲線の縦軸選択肢にそのまま使う */
  shopStatDisplay: {
    weapon: ShopStatDisplayGroup;
    vitality: ShopStatDisplayGroup;
    spirit: ShopStatDisplayGroup;
  };
  /** スロット → abilities.vdata のキー */
  abilities: BoundAbility[];
  /**
   * ヒーローの画像参照(file://{images}/... 形式)。
   * item/ability と同じく image-manifest 経由で実ファイルに解決する。
   *   iconSmall: 一覧カード用の小さい肖像
   *   heroCard:  詳細ページの見出し用の大きい絵
   *   minimap:   ミニマップ用の小アイコン(現在は未使用だが対応表には載せる)
   */
  images: {
    iconSmall: string | null;
    heroCard: string | null;
    minimap: string | null;
  };
}

export interface HeroesFile {
  schemaVersion: number;
  /** 抽出元のコミット。更新検知と変更履歴の突き合わせに使う */
  upstreamCommit: string;
  generatedAt: string;
  /** キーは実IDの文字列 */
  heroes: Record<string, Hero>;
}

/**
 * costBonuses の適用先。
 *
 * データ側は数値しか持たないため、2026-09-05 のゲーム内実測から決めたもの。
 *   WeaponMod: 武器ダメージに対する % (Rapid Rounds 1個で「9% 武器ダメージ」の行が出現)
 *   Armor:     最大HPに対する %      (830 → 905 = 830 × 1.09)
 *   Tech:      スピリットパワーの平坦加算 (0 → 7)
 */
export const COST_BONUS_TARGET: Record<
  ItemSlotType,
  { valueType: ModifierValueKey; kind: "percent" | "flat" }
> = {
  WeaponMod: { valueType: "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE", kind: "percent" },
  Armor: { valueType: "MODIFIER_VALUE_BASE_HEALTH_PERCENT", kind: "percent" },
  Tech: { valueType: "MODIFIER_VALUE_TECH_POWER", kind: "flat" },
};
