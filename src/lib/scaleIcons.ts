/**
 * スケーリング表示(スキルカード/アイテムページの「×0.6」「+25」のような係数表示)に
 * 使う実アイコンの参照・種別判定。skillcard.ts(重いdata.ts依存を持つ)、
 * items/[id].astro、image-manifest.ts(CLIとしても実行される)の複数箇所から参照するため、
 * どれにも依存しない独立ファイルに置く(resolveImagePathの解決は呼び出し側で行う)。
 *
 * 一時バフ（ルーン）のガン系／キャスト系アイコン(試合の流れ /mechanics/match/ でも使用)を流用している。
 * ブリッジのバフアイコンとスケーリング表示のアイコンはゲーム内でも同じ絵柄が使われている。
 */
export const SCALE_ICON_REFS: Record<"spirit" | "weapon", string> = {
  spirit: "file://{images}/hud/icons/powerup_spirit.svg",
  weapon: "file://{images}/hud/icons/powerup_gun.svg",
};

/**
 * スケーリング係数が何由来かを、vdata の m_eSpecificStatScaleType から判定する。
 * "Weapon"(武器ダメージそのもの)か "MeleeDamage"(軽/重近接ダメージの基礎値)を含む値は
 * 武器由来。それ以外(大多数の ETechPower や、statType が空でも
 * scale_function_tech_damage を使うもの)はスピリット由来として扱う。
 * 実例: citadel_ability_chrono_kinetic_carbine(パラドックスのキネティックカービン)の
 * ダメージは EWeaponPower(武器パワーで上昇、と説明文に明記)。
 * viscous_telepunch(パドルパンチ)は ELightMeleeDamage/EHeavyMeleeDamage。
 * アイテム側は今のところ Weapon/MeleeDamage 系の statType を持つものが無く、
 * 確認できている範囲では常にスピリット由来(ETechPower)。
 */
export function scaleKindOf(statType: string | null): "spirit" | "weapon" {
  return statType && /Weapon|MeleeDamage/.test(statType) ? "weapon" : "spirit";
}
