/**
 * マップ(試合の流れ /mechanics/match/ の FarmMap)に置く目印のアイコン。
 * ゲーム内のミニマップ(panorama/images/minimap/)と同じ絵を使う。
 * image-manifest.ts(CLIとしても実行される)と mapView.ts の両方から参照するため、
 * どれにも依存しない独立ファイルに置く(scaleIcons.ts と同じ理由)。
 *
 * キーは map.json の landmarks[].kind。ここに無い目印(橋バフ・鐘楼)は丸印で描く。
 * 橋バフはゲーム内でも出るまで種類が決まらないので、種類別の絵(powerup_*.svg)は当てない。
 */
export const MAP_MARKER_ICON_REFS: Record<string, string> = {
  rift: "file://{images}/minimap/minimap_icon_koth.svg",
  urnReturn: "file://{images}/minimap/soul_jar_marker_return.psd",
  shop: "file://{images}/minimap/minimap_shop.psd",
  teleporter: "file://{images}/minimap/minimap_teleporter_highlight.svg",
  broker: "file://{images}/minimap/minimap_icon_broker.svg",
  snack: "file://{images}/minimap/health_pad.psd",
};
