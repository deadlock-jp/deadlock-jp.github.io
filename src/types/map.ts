/**
 * map.json のスキーマ(src/parsers/map.ts)。マップ上の配置を、ゲーム内座標のまま持つ。
 * 座標は Source 2 の unit(1 unit = 1 inch)。x は東西、y は南北(上が +y)、z は高さ。
 * ミニマップ画像への変換は bounds を使ってページ側で行う。
 */

export interface MapPoint {
  x: number;
  y: number;
  z: number;
  /** 地下トンネル内か(高さとトンネル画像で判定。src/parsers/map.ts) */
  underground: boolean;
}

export interface MapCamp extends MapPoint {
  /** "weak" | "medium" | "strong" | "vaults" | "midboss"(economy.json の campSpawnTimes と同じキー) */
  type: string;
  /** マップ上の配置名(nw_bank_camp など)。表示には使わない */
  name: string | null;
}

export interface MapBreakable extends MapPoint {
  /** "crate" = ソウルを落とす木箱 / "statue" = パワーアップを落とす黄金像 */
  kind: "crate" | "statue";
  /** 出現グループ。economy.json の breakableSpawnTimes の添字 */
  group: number;
}

export interface MapLandmark extends MapPoint {
  /** "patron" | "walker" | "baseGuardian" | "powerup" | "rift" | "urnReturn" | "midboss" */
  kind: string;
}

export interface MapImage {
  /** VPK 内のパス(image-manifest に載せる) */
  vpkPath: string;
  /** public/ 以下の出力先 */
  outPath: string;
}

export interface MapFile {
  schemaVersion: number;
  map: string;
  /** ミニマップ画像が表す範囲(citadel_minimap_boundary の2点) */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  images: { base: MapImage | null; tunnels: MapImage | null };
  camps: MapCamp[];
  breakables: MapBreakable[];
  landmarks: MapLandmark[];
}
