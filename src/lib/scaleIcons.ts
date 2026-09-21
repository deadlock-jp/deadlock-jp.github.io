/**
 * スケーリング表示(スキルカードの「×0.6」のような係数表示)に使う実アイコンの参照。
 * skillcard.ts(重いdata.ts依存を持つ) と image-manifest.ts(CLIとしても実行される)の
 * 両方から参照するため、どちらにも依存しない独立ファイルに置く。
 *
 * 一時バフ（ルーン）のガン系／キャスト系アイコン(/mechanics/system/ でも使用)を流用している。
 * ブリッジのバフアイコンとスケーリング表示のアイコンはゲーム内でも同じ絵柄が使われている。
 */
export const SCALE_ICON_REFS: Record<"spirit" | "weapon", string> = {
  spirit: "file://{images}/hud/icons/powerup_spirit.svg",
  weapon: "file://{images}/hud/icons/powerup_gun.svg",
};
