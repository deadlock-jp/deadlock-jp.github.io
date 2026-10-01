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

/**
 * 地下トンネル(地下に潜れるヒーローだけが入れる)の箱が属する出現グループ。
 * ゲームデータは出現グループに名前を持たないので、公式ノートで対応を確かめている:
 * 2026-09-16 のノート「Breakables in the underground tunnels initial spawn time increased
 * from 3m to 5m / respawn rate increased from 3m to 5m」と、economy.json の
 * breakableSpawnTimes[1](初回300秒・再出現300秒)が一致する。
 * 6712(2026-09-29 のマップ改修)でこのグループは一度 180秒に戻り、6726 で再び 300秒に
 * 直された。配置は中央付近の新しい地下通路(大半が z < 0)で、ミニマップのトンネル画像には
 * 描かれていないため underground フラグは立たないが、グループごと地下トンネルの箱として扱う。
 */
export const TUNNEL_BREAKABLE_GROUP = 1;

/**
 * サイトの表示に使える map.json か。ミニマップの背景(地上)が取れていない版は
 * 地上・地下の判定も崩れる(トンネル画像で判定するため)ので、使わずに「改修対応中」と出す。
 * 6712(2026-09-29 のマップ改修)で、画像を取り出すツールが新しいシェーダー形式に
 * 未対応だったのが最初の実例。
 */
export function isMapReady(map: MapFile): boolean {
  return map.images.base !== null;
}

type Ent = Record<string, string>;

function readEntities(path: string): Ent[] {
  return readFileSync(path, "utf8")
    .split(/====\d+====\r?\n/)
    .map((block) => {
      const e: Ent = {};
      const lines = block.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i]!.match(/^(\S+)\s+(.*)$/);
        if (!m) continue;
        // 値が """ で始まるものは複数行(pathnodes など)。次の """ までをつなげる
        if (m[2] === '"""') {
          const buf: string[] = [];
          while (++i < lines.length && lines[i] !== '"""') buf.push(lines[i]!);
          e[m[1]!] = buf.join("\n");
          continue;
        }
        e[m[1]!] = m[2]!.replace(/^"|"$/g, "");
      }
      return e;
    })
    .filter((e) => e.classname);
}

/**
 * lane_marker_path の pathnodes(KV3 の数値配列の配列)を読む。1点は
 * [x, y, z, 入り接線 x, y, z, 出接線 x, y, z] で、座標はエンティティの origin からの相対。
 * 隣り合う2点の間は 3次ベジェ(制御点 = 点 + 出接線 / 次の点 + 次の入り接線)。
 */
function lanePoints(e: Ent): { x: number; y: number }[] {
  const nums = (e.pathnodes ?? "").match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [];
  const o = origin(e);
  const nodes: number[][] = [];
  for (let i = 0; i + 9 <= nums.length; i += 9) nodes.push(nums.slice(i, i + 9));
  const out: { x: number; y: number }[] = [];
  const STEPS = 6;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    const p0 = [a[0]!, a[1]!];
    const p1 = [a[0]! + a[6]!, a[1]! + a[7]!];
    const p2 = [b[0]! + b[3]!, b[1]! + b[4]!];
    const p3 = [b[0]!, b[1]!];
    for (let k = i === 0 ? 0 : 1; k <= STEPS; k++) {
      const t = k / STEPS;
      const u = 1 - t;
      const x = u * u * u * p0[0]! + 3 * u * u * t * p1[0]! + 3 * u * t * t * p2[0]! + t * t * t * p3[0]!;
      const y = u * u * u * p0[1]! + 3 * u * u * t * p1[1]! + 3 * u * t * t * p2[1]! + t * t * t * p3[1]!;
      out.push({ x: Math.round(o.x + x), y: Math.round(o.y + y) });
    }
  }
  return out;
}

/** レーンごとに描く経路の番号。4本並行(laneslot 0〜3)のうち内側の1本を代表にする */
const LANE_SLOT = "1";

function origin(e: Ent): { x: number; y: number; z: number } {
  // 6701 までは "x y z" の文字列、6711 以降は [ x, y, z ] の配列で出てくる。どちらも数値だけ拾う
  const [x = 0, y = 0, z = 0] = (e.origin ?? "").match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)?.map(Number) ?? [];
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
const BREAKABLE_KIND: Record<string, "crate" | "statue" | "tough"> = {
  citadel_breakable_prop_wooden_crate: "crate",
  citadel_breakable_item_container: "statue",
  // 頑丈な箱(Tough Crate)。近接強攻撃でしか壊せない。6712 で追加
  citadel_breakable_prop_tough_crate: "tough",
};

const LANDMARK_KIND: Record<string, string> = {
  npc_boss_tier3: "patron",
  npc_boss_tier2: "walker",
  npc_barrack_boss: "baseGuardian",
  citadel_item_powerup_spawner: "powerup",
  info_koth_spawn_location: "rift",
  citadel_trigger_idol_return: "urnReturn",
  destroyable_building: "shrine",
  // 以下 6712(2026-09-29)から載せる施設
  citadel_shop_prop_dynamic: "shop", // レーン沿いの商店(拠点の商店はこの形では置かれていない)
  citadel_trigger_teleport: "teleporter",
  citadel_trigger_corrupted_item_shop: "broker", // ブローカー(期間限定の商人)の店が出る場所
};

/** subclass_name で種類が決まるもの(classname だけでは区別できない) */
const LANDMARK_SUBCLASS: Record<string, string> = {
  citadel_pickup_floating_health: "snack", // ヒーリングスナック
  citadel_breakable_bell_chinatown: "bell", // チャイナタウンの鐘楼の鐘(鳴らすとソウル)
};

/** teamnumber → チーム。2 がアンバー(南)、3 がサファイア(北) */
const TEAM: Record<string, "amber" | "sapphire"> = { "2": "amber", "3": "sapphire" };

/** 建造物のレーン・チーム(無いものは null) */
function laneTeam(e: Ent): { lane: number | null; team: "amber" | "sapphire" | null } {
  return {
    lane: e.lanenum !== undefined ? Number(e.lanenum) : null,
    team: TEAM[e.teamnumber ?? ""] ?? null,
  };
}

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

  /*
   * プレハブから置かれた名前には "[PR#]" が付く(6712)。出現地点側だけ付いていてキャンプ側には
   * 付いていないことがある(四隅の中キャンプ: "[PR#]nw_bank_camp" と "nw_bank_camp")ので外して比べる
   */
  const nameKey = (s: string | undefined): string => (s ?? "").replace(/^\[PR#\]/, "");

  // キャンプごとの体数。info_neutral_trooper_spawn が campname でキャンプを指している
  const unitsByCamp = new Map<string, number>();
  const hauntsByCamp = new Map<string, Record<string, number>>();
  for (const e of ents) {
    const k = nameKey(e.campname);
    if (e.classname === "info_neutral_trooper_spawn" && k) {
      unitsByCamp.set(k, (unitsByCamp.get(k) ?? 0) + 1);
      // 6712 から出現地点がホーントの種類(npc_units のキー)を指定する
      if (e.neutralsubclass) {
        const h = hauntsByCamp.get(k) ?? {};
        h[e.neutralsubclass] = (h[e.neutralsubclass] ?? 0) + 1;
        hauntsByCamp.set(k, h);
      }
    }
  }
  /*
   * 出現地点(campname)とキャンプの結び付け。6701 まではキャンプ側の campname、
   * 6712 からはキャンプ側の targetname が出現地点の campname と一致する
   * (6712 でキャンプの campname は空か別名で、そのままだと全キャンプ0体になっていた)
   */
  const campKey = (e: Ent): string =>
    [nameKey(e.targetname), nameKey(e.campname)].find((k) => k && unitsByCamp.has(k)) ?? "";

  const camps: MapCamp[] = [];
  const breakables: MapBreakable[] = [];
  const landmarks: MapLandmark[] = [];
  for (const e of ents) {
    const p = origin(e);
    if (e.classname === "info_neutral_trooper_camp") {
      const type = CAMP_TYPE[e.subclass_name ?? ""];
      if (!type) continue;
      if (type === "midboss") landmarks.push({ kind: "midboss", lane: null, team: null, underground: true, ...p });
      else {
        const key = campKey(e);
        camps.push({
          type,
          name: key || e.campname || null,
          units: unitsByCamp.get(key) ?? 0,
          haunts: hauntsByCamp.get(key) ?? {},
          underground: underground(p),
          ...p,
        });
      }
    } else if (LANDMARK_SUBCLASS[e.subclass_name ?? ""]) {
      landmarks.push({ kind: LANDMARK_SUBCLASS[e.subclass_name!]!, lane: null, team: null, underground: underground(p), ...p });
    } else if (e.classname === "citadel_breakable_prop") {
      const kind = BREAKABLE_KIND[e.subclass_name ?? ""];
      if (!kind) continue;
      breakables.push({ kind, group: Number(e.breakable_spawn_group ?? 0), hid: e.hammeruniqueid ?? null, underground: underground(p), ...p });
    } else if (e.classname === "info_super_trooper_spawn" && /_t1_/.test(e.bossname ?? "")) {
      // ガーディアン(Tier1)は配置データに本体が無く、倒されたあとに強化トルーパーが出る地点
      // (bossname=boss_<陣営>_t1_<レーン色>)がその場所になっている
      landmarks.push({ kind: "guardian", ...laneTeam(e), underground: underground(p), ...p });
    } else if (LANDMARK_KIND[e.classname]) {
      landmarks.push({ kind: LANDMARK_KIND[e.classname]!, ...laneTeam(e), underground: underground(p), ...p });
    }
  }

  const round = (n: number) => Math.round(n);
  const roundPoint = <T extends { x: number; y: number; z: number }>(o: T): T => ({ ...o, x: round(o.x), y: round(o.y), z: round(o.z) });
  const byXY = (a: { x: number; y: number }, b: { x: number; y: number }) => a.y - b.y || a.x - b.x;

  // レーンの経路(ミニマップに描かれる黄・青・緑の線)。lanenum は economy.json の lanes の添字
  const lanes = ents
    .filter((e) => e.classname === "lane_marker_path" && e.laneslot === LANE_SLOT)
    .map((e) => ({ lane: Number(e.lanenum), points: lanePoints(e) }))
    .filter((l) => l.points.length > 1)
    .sort((a, b) => a.lane - b.lane);

  return {
    schemaVersion: 1,
    map: mapName,
    bounds: { minX, minY, maxX, maxY },
    images,
    // 並びを固定して、版ごとの差分を読みやすくする
    camps: camps.map(roundPoint).sort((a, b) => a.type.localeCompare(b.type) || byXY(a, b)),
    breakables: breakables.map(roundPoint).sort((a, b) => a.kind.localeCompare(b.kind) || a.group - b.group || byXY(a, b)),
    landmarks: landmarks.map(roundPoint).sort((a, b) => a.kind.localeCompare(b.kind) || byXY(a, b)),
    lanes,
  };
}
