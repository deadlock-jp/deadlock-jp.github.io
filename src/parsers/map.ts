/**
 * マップの配置データ(default_ents.vents) → map.json
 *
 * tools/extract/extract-local.mjs が maps/<map>.vpk から取り出して decompile した
 * エンティティ一覧(====N==== 区切りの「キー 値」の並び)を読み、ファーミングに関わる
 * 配置(中立キャンプ・箱・黄金像)と、地図の目印になる建造物だけを座標つきで拾う。
 * 座標はすべてゲームデータのまま(CLAUDE.md ルール6)。
 */

import { readFileSync } from "node:fs";
import { decodePng, type DecodedPng } from "./png.ts";
import type { MapFile, MapCamp, MapBreakable, MapLandmark, MapImage } from "../types/map.ts";

/**
 * 地下トンネルの判定。高さだけでは、掘り下がった道など地上の低い場所(z ≈ -128)と
 * 区別できない。そこで「z が UNDERGROUND_Z より低い」かつ「ミニマップのトンネル画像で
 * その位置がトンネルの床」のものを地下とする。トンネルの床は無彩色で不透明
 * (周りのぼかしは緑がかって半透明、それ以外はほぼ透明)。点が壁際にあることもあるので、
 * 周囲 TUNNEL_PROBE_PX ピクセルのどこかが床なら床とみなす。
 * トンネル画像が無い版は高さだけで判定する。
 */
export const UNDERGROUND_Z = 0;
const TUNNEL_PROBE_PX = 3;

function isTunnelFloor(img: DecodedPng, px: number, py: number): boolean {
  for (let dy = -TUNNEL_PROBE_PX; dy <= TUNNEL_PROBE_PX; dy++) {
    for (let dx = -TUNNEL_PROBE_PX; dx <= TUNNEL_PROBE_PX; dx++) {
      const c = img.pixel(Math.round(px + dx), Math.round(py + dy));
      if (!c) continue;
      const [r, g, b, a] = c;
      if (a >= 218 && Math.abs(g - r) <= 4 && Math.abs(b - r) <= 4) return true;
    }
  }
  return false;
}

type Ent = Record<string, string>;

function readEntities(path: string): Ent[] {
  return readFileSync(path, "utf8")
    .split(/====\d+====\r?\n/)
    .map((block) => {
      const e: Ent = {};
      for (const line of block.split(/\r?\n/)) {
        const m = line.match(/^(\S+)\s+(.*)$/);
        if (m) e[m[1]!] = m[2]!.replace(/^"|"$/g, "");
      }
      return e;
    })
    .filter((e) => e.classname);
}

function origin(e: Ent): { x: number; y: number; z: number } {
  const [x = 0, y = 0, z = 0] = (e.origin ?? "").split(" ").map(Number);
  return { x, y, z };
}

const CAMP_TYPE: Record<string, string> = {
  neutral_camp_weak: "weak",
  neutral_camp_medium: "medium",
  neutral_camp_strong: "strong",
  neutral_camp_vaults: "vaults",
  neutral_camp_midboss: "midboss",
};

/** 箱の種類。misc.vdata で wooden_crate はソウル、item_container はパワーアップを落とす */
const BREAKABLE_KIND: Record<string, "crate" | "statue"> = {
  citadel_breakable_prop_wooden_crate: "crate",
  citadel_breakable_item_container: "statue",
};

const LANDMARK_KIND: Record<string, string> = {
  npc_boss_tier3: "patron",
  npc_boss_tier2: "walker",
  npc_barrack_boss: "baseGuardian",
  citadel_item_powerup_spawner: "powerup",
  info_koth_spawn_location: "rift",
  citadel_trigger_idol_return: "urnReturn",
};

export function parseMap(
  entitiesPath: string,
  mapName: string,
  images: { base: MapImage | null; tunnels: MapImage | null },
  /** 地下判定に使うトンネル画像(抽出した PNG の実ファイル)。無ければ高さだけで判定 */
  tunnelsPngPath: string | null,
): MapFile {
  const ents = readEntities(entitiesPath);

  const bounds = ents.filter((e) => e.classname === "citadel_minimap_boundary").map(origin);
  if (bounds.length < 2) throw new Error(`citadel_minimap_boundary が2つ見つかりません: ${entitiesPath}`);
  const minX = Math.min(...bounds.map((b) => b.x));
  const minY = Math.min(...bounds.map((b) => b.y));
  const maxX = Math.max(...bounds.map((b) => b.x));
  const maxY = Math.max(...bounds.map((b) => b.y));

  const tunnelImg = tunnelsPngPath ? decodePng(tunnelsPngPath) : null;
  const underground = (p: { x: number; y: number; z: number }): boolean => {
    if (p.z >= UNDERGROUND_Z) return false;
    if (!tunnelImg) return true;
    const px = ((p.x - minX) / (maxX - minX)) * tunnelImg.width;
    const py = ((maxY - p.y) / (maxY - minY)) * tunnelImg.height;
    return isTunnelFloor(tunnelImg, px, py);
  };

  const camps: MapCamp[] = [];
  const breakables: MapBreakable[] = [];
  const landmarks: MapLandmark[] = [];
  for (const e of ents) {
    const p = origin(e);
    if (e.classname === "info_neutral_trooper_camp") {
      const type = CAMP_TYPE[e.subclass_name ?? ""];
      if (!type) continue;
      if (type === "midboss") landmarks.push({ kind: "midboss", underground: true, ...p });
      else camps.push({ type, name: e.campname ?? null, underground: underground(p), ...p });
    } else if (e.classname === "citadel_breakable_prop") {
      const kind = BREAKABLE_KIND[e.subclass_name ?? ""];
      if (!kind) continue;
      breakables.push({ kind, group: Number(e.breakable_spawn_group ?? 0), underground: underground(p), ...p });
    } else if (LANDMARK_KIND[e.classname]) {
      landmarks.push({ kind: LANDMARK_KIND[e.classname]!, underground: underground(p), ...p });
    }
  }

  const round = (n: number) => Math.round(n);
  const roundPoint = <T extends { x: number; y: number; z: number }>(o: T): T => ({ ...o, x: round(o.x), y: round(o.y), z: round(o.z) });
  const byXY = (a: { x: number; y: number }, b: { x: number; y: number }) => a.y - b.y || a.x - b.x;

  return {
    schemaVersion: 1,
    map: mapName,
    bounds: { minX, minY, maxX, maxY },
    images,
    // 並びを固定して、版ごとの差分を読みやすくする
    camps: camps.map(roundPoint).sort((a, b) => a.type.localeCompare(b.type) || byXY(a, b)),
    breakables: breakables.map(roundPoint).sort((a, b) => a.kind.localeCompare(b.kind) || a.group - b.group || byXY(a, b)),
    landmarks: landmarks.map(roundPoint).sort((a, b) => a.kind.localeCompare(b.kind) || byXY(a, b)),
  };
}
