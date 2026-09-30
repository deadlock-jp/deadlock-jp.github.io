/**
 * マップ(data/snapshots/<版>/map.json)を画面に描くための共通データ。
 * 操作できる地図(src/components/FarmMap.astro)と、入口ページ用の静的な地図
 * (src/components/MapPreview.astro)の両方がここから描く。
 *
 * 見た目はゲーム内のミニマップに合わせる: 自チームを南(アンバー)側として、
 * 自陣のレーン・建造物はレーンの色、中央から先の敵陣は赤。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MapFile, MapLandmark } from "../types/map.ts";
import type { EconomyFile } from "../types/economy.ts";
import { campSpawnTimes, hauntName, hauntUnitInfo, vaultReward } from "./objects.ts";
import { TUNNEL_BREAKABLE_GROUP, isMapReady, hasTunnelGroup } from "../parsers/map.ts";
import { resolveImagePath } from "../parsers/image-manifest.ts";
import { MAP_MARKER_ICON_REFS } from "./mapIcons.ts";

const DATA_DIR = join(process.cwd(), "data");

function readLatestMap(): { version: string; map: MapFile } | null {
  const version = JSON.parse(readFileSync(join(DATA_DIR, "latest.json"), "utf8")).version as string;
  const mapPath = join(DATA_DIR, "snapshots", version, "map.json");
  if (!existsSync(mapPath)) return null;
  return { version, map: JSON.parse(readFileSync(mapPath, "utf8")) as MapFile };
}

/** 表示に使えるマップ。改修対応中(isMapReady が偽)の版は null */
export function loadMap(): { map: MapFile; economy: EconomyFile } | null {
  const latest = readLatestMap();
  if (!latest || !isMapReady(latest.map)) return null;
  return {
    map: latest.map,
    economy: JSON.parse(readFileSync(join(DATA_DIR, "snapshots", latest.version, "economy.json"), "utf8")) as EconomyFile,
  };
}

/** 最新版に map.json はあるが、表示に使えない(マップ改修に対応中) */
export function mapRenovating(): boolean {
  const latest = readLatestMap();
  return latest !== null && !isMapReady(latest.map);
}

/** 敵陣の色(ゲームのミニマップで敵側のレーン・建造物に使われる赤) */
export const ENEMY = "#d9553a";
/** 自陣のパトロン・シュラインの色(ゲームでは白っぽく描かれる) */
export const OWN_BASE = "#e6ddc8";

/** 建造物(レーンの上に並ぶもの)。それ以外の目印(橋バフ・裂け目・壺・ミッド・ボス)と分けて描く */
export const STRUCTURES = new Set(["patron", "shrine", "baseGuardian", "walker", "guardian"]);

export const campInfo = () => Object.fromEntries(campSpawnTimes().map((c) => [c.key, c]));

/** 地下トンネル(3人専用)の箱 */
let tunnelGroupOk: boolean | null = null;
export const isTunnelBreakable = (b: MapFile["breakables"][number]) => {
  if (tunnelGroupOk === null) {
    const loaded = loadMap();
    tunnelGroupOk = loaded ? hasTunnelGroup(loaded.map) : false;
  }
  return tunnelGroupOk && b.group === TUNNEL_BREAKABLE_GROUP;
};

export function mapView(map: MapFile, economy: EconomyFile) {
  /** ゲーム座標 → 地図上の割合(0〜1) */
  const frac = (p: { x: number; y: number }) => {
    const { minX, minY, maxX, maxY } = map.bounds;
    return { u: (p.x - minX) / (maxX - minX), v: (maxY - p.y) / (maxY - minY) };
  };
  const pos = (p: { x: number; y: number }) => {
    const { u, v } = frac(p);
    return `left:${(u * 100).toFixed(2)}%;top:${(v * 100).toFixed(2)}%`;
  };
  const laneColor = (lane: number | null) => {
    const c = lane !== null ? economy.lanes[lane]?.color : null;
    return c && (c[0] || c[1] || c[2]) ? `rgb(${c[0]} ${c[1]} ${c[2]})` : OWN_BASE;
  };
  const structureColor = (l: MapLandmark) =>
    l.team === "sapphire" ? ENEMY : l.kind === "patron" || l.kind === "shrine" ? OWN_BASE : laneColor(l.lane);

  /**
   * レーンの線(viewBox 0 0 1000 1000 の polyline)。自陣側(南)はレーンの色、中央(y=0)を越えた先は敵陣として赤。
   * 経路は南の拠点から北の拠点へ向かっているので、最初に y が 0 以上になった点で分ける。
   */
  const laneLines = map.lanes.flatMap((l) => {
    const toStr = (pts: { x: number; y: number }[]) =>
      pts.map((p) => { const { u, v } = frac(p); return `${(u * 1000).toFixed(1)},${(v * 1000).toFixed(1)}`; }).join(" ");
    const cut = l.points.findIndex((p) => p.y >= 0);
    const own = cut < 0 ? l.points : l.points.slice(0, cut + 1);
    const enemy = cut < 0 ? [] : l.points.slice(cut);
    return [
      { key: `${l.lane}-own`, color: laneColor(l.lane), points: toStr(own) },
      ...(enemy.length > 1 ? [{ key: `${l.lane}-enemy`, color: ENEMY, points: toStr(enemy) }] : []),
    ];
  });

  return {
    pos,
    structureColor,
    laneLines,
    structures: map.landmarks.filter((l) => STRUCTURES.has(l.kind)),
    markers: map.landmarks.filter((l) => !STRUCTURES.has(l.kind)),
  };
}

/** キャンプに出るホーントの内訳(「スペシメン I ×3、ガターグール II ×2」)。種類が分からない版は空文字 */
export function campHauntText(c: MapFile["camps"][number]): string {
  return Object.entries(c.haunts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([unit, n]) => `${hauntName(unit) ?? unit} ×${n}`)
    .join("、");
}

/** キャンプ1つぶんのカード(ホバーと、クリックで地図の下に出す詳細)の中身 */
export interface CampCard {
  /** 内訳1行 = 出現するユニット1種類 */
  rows: { name: string; icon: string | null; count: number; maxHealth: number | null; gold: number | null }[];
  /** 種類の絵(重複を除く)。多い順 */
  pictures: string[];
  /** キャンプ全体の試合開始時の獲得ソウル。内訳が分からなければ null */
  totalGold: number | null;
  /** 獲得ソウルの毎分の増加率(%) */
  growthPct: number | null;
}

export function campCard(c: MapFile["camps"][number]): CampCard {
  if (c.type === "vaults") {
    const v = vaultReward();
    return { rows: [], pictures: [], totalGold: v.gold, growthPct: v.growthPct };
  }
  const rows = Object.entries(c.haunts ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([unit, count]) => {
      const info = hauntUnitInfo(unit);
      return { name: info?.name ?? unit, icon: info?.icon ?? null, count, maxHealth: info?.maxHealth ?? null, gold: info?.gold ?? null };
    });
  const pictures = [...new Set(rows.map((r) => r.icon).filter((x): x is string => !!x))];
  const known = rows.length > 0 && rows.every((r) => r.gold !== null);
  const totalGold = known ? rows.reduce((sum, r) => sum + r.count * r.gold!, 0) : null;
  const firstUnit = Object.keys(c.haunts ?? {})[0];
  return { rows, pictures, totalGold, growthPct: firstUnit ? (hauntUnitInfo(firstUnit)?.goldGrowthPct ?? null) : null };
}

/**
 * 箱・黄金像の識別番号(data/breakable-labels.json。tools/gen-breakable-labels.mjs が作る)。
 * 味方陣営の分だけあり、それ以外は null
 */
const breakableLabels: Record<string, string> = (() => {
  const p = join(DATA_DIR, "breakable-labels.json");
  return existsSync(p) ? ((JSON.parse(readFileSync(p, "utf8")) as { labels: Record<string, string> }).labels ?? {}) : {};
})();
export const breakableLabel = (b: MapFile["breakables"][number]): string | null => (b.hid ? breakableLabels[b.hid] ?? null : null);

/** 目印(landmarks[].kind)のアイコン。public/ からの相対パス。絵が無い目印は null(丸印で描く) */
export function markerIcon(kind: string): string | null {
  const ref = MAP_MARKER_ICON_REFS[kind];
  const resolved = ref ? resolveImagePath(ref) : null;
  return resolved && existsSync(join(process.cwd(), resolved.outPath)) ? resolved.outPath.replace(/^public\//, "") : null;
}
