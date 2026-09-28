/**
 * サイトの画面に出すゲーム用語のうち、ゲームのローカライズのトークンで引けるもの。
 *
 * 訳はゲーム側のものをそのまま使う(こちらで訳さない)。辞書(src/i18n/ui/)には書かない。
 * ja は、このサイトが以前から使っている日本語表記がゲームの表記と違うものだけ持つ
 * (例: カテゴリはゲームでは「ウェポン/バイタリティ」だが、サイトは「武器/生命力」)。
 * 日本語版の表示を変えないための上書きで、ほかの言語には影響しない。
 *
 * トークンで引けない語は辞書(ui/<lang>.ts の gameTerms)に置く。
 */
import { t } from "./game.ts";
import { currentLang } from "./context.ts";
import type { Lang } from "./langs.ts";

interface TermDef {
  token: string;
  /** 日本語版だけの表記(ゲームの日本語と違うときだけ) */
  ja?: string;
  /** トークン側の末尾の「：」などを落とす */
  trimColon?: boolean;
}

const TERMS = {
  // --- アイテムのカテゴリ ---
  weapon: { token: "CitadelCategoryWeapon", ja: "武器" },
  vitality: { token: "CitadelCategoryArmor", ja: "生命力" },
  spirit: { token: "CitadelCategoryTech" },

  // --- ステータス欄の見出し(ゲーム内のステータス画面) ---
  weaponStats: { token: "CitadelHeroStats_Weapon", ja: "武器ステータス" },
  vitalityStats: { token: "CitadelHeroStats_Vitality", ja: "生命力ステータス" },
  spiritStats: { token: "CitadelHeroStats_Spirit" },

  // --- ステータス(ゲーム内のステータス画面 StatDesc_*) ---
  dps: { token: "StatDesc_DPS" },
  bulletDamage: { token: "StatDesc_BulletDamage" },
  bulletsPerSec: { token: "StatDesc_RoundsPerSecond" },
  ammo: { token: "StatDesc_ClipSizeBonus" },
  reloadTime: { token: "StatDesc_ReloadTime" },
  bulletVelocity: { token: "StatDesc_BulletSpeed" },
  lightMelee: { token: "StatDesc_LightMeleeDamage" },
  heavyMelee: { token: "StatDesc_HeavyMeleeDamage" },
  meleeDamage: { token: "StatDesc_MeleeDamage" },
  maxHealth: { token: "StatDesc_MaxHealth" },
  healthRegen: { token: "StatDesc_BaseHealthRegen" },
  moveSpeed: { token: "StatDesc_RunSpeed" },
  sprintSpeed: { token: "StatDesc_SprintSpeed" },
  stamina: { token: "StatDesc_Stamina" },
  staminaCooldown: { token: "StatDesc_StaminaCooldown" },
  staminaRecovery: { token: "StatDesc_StaminaRegenPerSecond" },
  dashSpeed: { token: "StatDesc_DashSpeedInMeters" },
  abilityDuration: { token: "StatDesc_TechDuration" },
  abilityRange: { token: "StatDesc_TechRange" },
  spiritPower: { token: "StatDesc_TechPower" },
  weaponDamage: { token: "StatDesc_WeaponPower" },
  bulletResist: { token: "StatDesc_BulletArmorDamageReduction" },
  spiritResist: { token: "StatDesc_TechArmorDamageReduction" },
  debuffResist: { token: "StatDesc_DebuffResist" },

  // --- ヒーロー一覧・ティア表の短い表記(日本語版は以前からの略記) ---
  bulletDamageShort: { token: "StatDesc_BulletDamage", ja: "1発ダメージ" },
  fireRateShort: { token: "StatDesc_RoundsPerSecond", ja: "連射" },
  ammoShort: { token: "StatDesc_ClipSizeBonus", ja: "装弾数" },
  reloadShort: { token: "StatDesc_ReloadTime", ja: "リロード" },
  lightMeleeShort: { token: "StatDesc_LightMeleeDamage", ja: "軽近接" },
  heavyMeleeShort: { token: "StatDesc_HeavyMeleeDamage", ja: "重近接" },
  healthRegenShort: { token: "StatDesc_BaseHealthRegen", ja: "HP回復" },
  staminaCooldownShort: { token: "StatDesc_StaminaCooldown", ja: "スタミナCD" },

  // --- スキルの見出し(ゲーム内のスキルカードの項目) ---
  charges: { token: "AbilityCharges_label" },
  cooldown: { token: "AbilityCooldown_label" },
  castRange: { token: "AbilityCastRange_label", ja: "射程" },
  duration: { token: "AbilityDuration_label", ja: "効果時間" },
  castDelay: { token: "AbilityCastDelay_label", ja: "詠唱ディレイ" },
  channelTime: { token: "AbilityChannelTime_label", ja: "チャネル時間" },

  // --- アイテム ---
  passive: { token: "Citadel_Mod_Tooltip_Passive" },
  active: { token: "Citadel_Mod_Tooltip_Active" },
  innate: { token: "Citadel_Mod_Tooltip_Innate", ja: "常時" },
  componentsOf: { token: "Citadel_ComponentRequired", ja: "素材", trimColon: true },
  upgradesTo: { token: "Citadel_IsComponentOf", ja: "上位", trimColon: true },
  souls: { token: "Citadel_Hero_Stats_Souls" },

  // --- ヒーロー ---
  boon: { token: "Citadel_Player_Level_PowerIncrease" },
  complexity: { token: "Citadel_HeroPage_Complexity", ja: "複雑さ" },

  // --- 建造物・オブジェクト(システム全体の調整の表示名) ---
  guardian: { token: "Citadel_Hud_KillFeedGuardian" },
  walker: { token: "Citadel_Hud_KillFeedWalker" },
  baseGuardians: { token: "Citadel_LaneStats_Guardians" },
  shrine: { token: "Citadel_Hud_KillFeedShieldName" },
  patron: { token: "Citadel_Hud_KillFeedTitan" },
  rejuvenator: { token: "Item_Rejuvenator" },
  trooper: { token: "Citadel_AttackerClass_CLASS_TROOPER" },
} satisfies Record<string, TermDef>;

export type TermKey = keyof typeof TERMS;

/** ゲーム用語の表示名。lang を省くといま描いているページの言語 */
export function term(key: TermKey, lang: Lang = currentLang()): string {
  const def: TermDef = TERMS[key];
  if (lang === "ja" && def.ja) return def.ja;
  const text = t(def.token, def.ja ?? key, lang);
  return def.trimColon ? text.replace(/\s*[:：]\s*$/, "") : text;
}
