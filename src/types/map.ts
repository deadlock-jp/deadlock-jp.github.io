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
  /** 出現する中立の体数(info_neutral_trooper_spawn の数) */
  units: number;
}

export interface MapBreakable extends MapPoint {
  /** "crate" = ソウルを落とす木箱 / "statue" = パワーアップを落とす黄金像 */
  kind: "crate" | "statue";
  /** 出現グループ。economy.json の breakableSpawnTimes の添字 */
  group: number;
}

export interface MapLandmark extends MapPoint {
  /** "patron" | "shrine" | "baseGuardian" | "walker" | "guardian" | "powerup" | "rift" | "urnReturn" | "midboss" */
  kind: string;
  /** 建造物のレーン(economy.json の lanes の添字)。レーンに属さないものは null */
  lane: number | null;
  /** 建造物のチーム。中立のものは null */
  team: "amber" | "sapphire" | null;
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
  /** base = 地上(地面を灰色に描き直したもの) / tunnels = 共用地下 / hiddenTunnels = 専用トンネル(推定。src/parsers/hiddenTunnels.ts) */
  images: { base: MapImage | null; tunnels: MapImage | null; hiddenTunnels?: MapImage | null };
  camps: MapCamp[];
  breakables: MapBreakable[];
  landmarks: MapLandmark[];
  /** レーンの経路(ベジェを折れ線にしたもの)。lane は economy.json の lanes の添字(色もそこから引く) */
  lanes: { lane: number; points: { x: number; y: number }[] }[];
  /** 小さい姿でだけ通れる壁(citadel_passthrough_fake_wall)の位置 */
  passages: { x: number; y: number; z: number }[];
  /**
   * 地下トンネル(3人専用)の入口。passages のうち、推定したトンネルに接するもの。
   * street = 道路の高さから入る入口 / midboss = ミッド・ボスの部屋からの入口
   */
  tunnelEntrances: { x: number; y: number; z: number; from: "street" | "midboss" }[];
}
