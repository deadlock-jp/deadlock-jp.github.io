/**
 * ミニマップに描かれていない地下トンネル(潜れるヒーロー専用)の範囲を、地形の当たり判定から割り出す。
 *
 * ゲームデータにトンネルの形そのものは無い。そこで world_physics(当たり判定のメッシュ。
 * extract-local.mjs が glb で書き出す)の「床」(ほぼ水平な面)を上から見たマスに投影し、
 *   1. 地面より低い床(z < 0)の上に、別の床(道路など)が重なっているマス = 地下
 *   2. そのうち、ミニマップの共用地下(トンネル画像)とミニマップの外側を除く
 *   3. トンネルの箱(出現グループ TUNNEL_BREAKABLE_GROUP)を含む、つながった範囲だけを残す
 * とする。3 で箱の位置を目印にしているので、建物の地下室など無関係な地下は落ちる。
 * 結果は推定で、形はおおよそ。半透明の紫で塗った PNG として書き出す。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, type DecodedPng } from "./png.ts";
import { encodePng } from "./minimapImage.ts";
import type { MapFile } from "../types/map.ts";

const N = 1024;
/** 1マスに覚えておく床の高さの数 */
const K = 8;
/** 同じ床とみなす高さの差 */
const SAME_FLOOR = 48;
/** 「上に別の床がある」とみなす高さの差 */
const ABOVE = 100;
/** 当たり判定のうち床として使わないもの(透明な壁・草・ガラスなど) */
const SKIP_MESH = /playerclip|npcclip|foliage|passbullets|window_glass|blocklos/i;
/** 箱からトンネルをたどるときに、隙間とみなして越える距離(マス) */
const LINK = 3;
/** 入口の判定: トンネルからこのマス数以内 */
const ENTRANCE_PX = 40;
/** 道路の高さとみなす下限 / ミッド・ボスの部屋の高さとみなす上限 */
const STREET_Z = 100;
const MIDBOSS_Z = -500;

type Glb = { json: any; bin: Buffer };

function readGlb(path: string): Glb {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const bin = buf.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen);
  return { json, bin };
}

function accessorData(glb: Glb, index: number): Float32Array | Uint32Array | Uint16Array {
  const a = glb.json.accessors[index];
  const v = glb.json.bufferViews[a.bufferView];
  const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const comps = a.type === "VEC3" ? 3 : 1;
  const slice = (bytes: number) => new Uint8Array(glb.bin.subarray(off, off + a.count * comps * bytes)).buffer;
  if (a.componentType === 5126) return new Float32Array(slice(4));
  if (a.componentType === 5125) return new Uint32Array(slice(4));
  return new Uint16Array(slice(2));
}

function isPublicTunnel(img: DecodedPng, x: number, y: number): boolean {
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const c = img.pixel(x + dx, y + dy);
      if (c && c[3] >= 218 && Math.abs(c[1] - c[0]) <= 4 && Math.abs(c[2] - c[0]) <= 4) return true;
    }
  }
  return false;
}

export function renderHiddenTunnels(opts: {
  glbPath: string;
  map: Pick<MapFile, "bounds" | "breakables" | "passages">;
  /** 元のミニマップ(加工前)。描かれていない=ミニマップの外 */
  basePngPath: string;
  /** 共用地下のミニマップ */
  tunnelsPngPath: string | null;
  seedGroup: number;
  outPath: string;
}): { cells: number; seeds: number; seedsInside: number; entrances: MapFile["tunnelEntrances"] } {
  const { minX, minY, maxX, maxY } = opts.map.bounds;
  const toU = (x: number) => ((x - minX) / (maxX - minX)) * N;
  const toV = (y: number) => ((maxY - y) / (maxY - minY)) * N;

  // ---- 床の高さをマスに集める ----
  const heights = new Float32Array(N * N * K);
  const counts = new Uint8Array(N * N);
  const addFloor = (i: number, z: number) => {
    for (let k = 0; k < counts[i]!; k++) if (Math.abs(heights[i * K + k]! - z) < SAME_FLOOR) return;
    if (counts[i]! < K) heights[i * K + counts[i]!++] = z;
  };
  const glb = readGlb(opts.glbPath);
  for (const mesh of glb.json.meshes) {
    if (SKIP_MESH.test(mesh.name ?? "")) continue;
    for (const prim of mesh.primitives) {
      const pos = accessorData(glb, prim.attributes.POSITION) as Float32Array;
      const idx = accessorData(glb, prim.indices);
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const a = idx[t]! * 3, b = idx[t + 1]! * 3, c = idx[t + 2]! * 3;
        const ax = pos[a]!, ay = pos[a + 1]!, az = pos[a + 2]!;
        const bx = pos[b]!, by = pos[b + 1]!, bz = pos[b + 2]!;
        const cx = pos[c]!, cy = pos[c + 1]!, cz = pos[c + 2]!;
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (len === 0 || Math.abs(nz) / len < 0.7) continue; // ほぼ水平な面(床・天井)だけ
        const z = (az + bz + cz) / 3;
        const pu = [toU(ax), toU(bx), toU(cx)] as const;
        const pv = [toV(ay), toV(by), toV(cy)] as const;
        const d = (pv[1] - pv[2]) * (pu[0] - pu[2]) + (pu[2] - pu[1]) * (pv[0] - pv[2]);
        if (d === 0) continue;
        const x0 = Math.max(0, Math.floor(Math.min(...pu))), x1 = Math.min(N - 1, Math.ceil(Math.max(...pu)));
        const y0 = Math.max(0, Math.floor(Math.min(...pv))), y1 = Math.min(N - 1, Math.ceil(Math.max(...pv)));
        for (let yy = y0; yy <= y1; yy++) {
          for (let xx = x0; xx <= x1; xx++) {
            const px = xx + 0.5, py = yy + 0.5;
            const l1 = ((pv[1] - pv[2]) * (px - pu[2]) + (pu[2] - pu[1]) * (py - pv[2])) / d;
            const l2 = ((pv[2] - pv[0]) * (px - pu[2]) + (pu[0] - pu[2]) * (py - pv[2])) / d;
            if (l1 >= -0.02 && l2 >= -0.02 && 1 - l1 - l2 >= -0.02) addFloor(yy * N + xx, z);
          }
        }
      }
    }
  }

  // ---- 地下のマス(1・2) ----
  const base = decodePng(opts.basePngPath);
  const tunnels = opts.tunnelsPngPath ? decodePng(opts.tunnelsPngPath) : null;
  const under = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if ((base.pixel(x, y)?.[3] ?? 0) <= 20) continue; // ミニマップの外
      let low = Infinity;
      for (let k = 0; k < counts[i]!; k++) if (heights[i * K + k]! < 0) low = Math.min(low, heights[i * K + k]!);
      if (low === Infinity) continue;
      let above = false;
      for (let k = 0; k < counts[i]!; k++) if (heights[i * K + k]! > low + ABOVE) above = true;
      if (!above) continue;
      if (tunnels && isPublicTunnel(tunnels, x, y)) continue;
      under[i] = 1;
    }
  }

  // ---- トンネルの箱を種に、つながった範囲だけ残す(3) ----
  const keep = new Uint8Array(N * N);
  const queue: number[] = [];
  const seeds = opts.map.breakables.filter((b) => b.group === opts.seedGroup);
  for (const b of seeds) {
    const sx = Math.floor(toU(b.x)), sy = Math.floor(toV(b.y));
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const i = (sy + dy) * N + (sx + dx);
        if (i >= 0 && i < N * N && under[i] && !keep[i]) { keep[i] = 1; queue.push(i); }
      }
    }
  }
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % N, y = (i / N) | 0;
    for (let dy = -LINK; dy <= LINK; dy++) {
      for (let dx = -LINK; dx <= LINK; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const j = yy * N + xx;
        if (under[j] && !keep[j]) { keep[j] = 1; queue.push(j); }
      }
    }
  }

  // ---- 半透明の紫で書き出す(縁だけ少し濃く) ----
  const out = Buffer.alloc(N * N * 4);
  let cells = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!keep[i]) continue;
      cells++;
      const edge = !keep[i - 1] || !keep[i + 1] || !keep[i - N] || !keep[i + N];
      out[i * 4] = 176;
      out[i * 4 + 1] = 96;
      out[i * 4 + 2] = 236;
      out[i * 4 + 3] = edge ? 235 : 150;
    }
  }
  writeFileSync(opts.outPath, encodePng(N, N, out));

  const seedsInside = seeds.filter((b) => {
    const sx = Math.floor(toU(b.x)), sy = Math.floor(toV(b.y));
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (keep[(sy + dy) * N + (sx + dx)]) return true;
    return false;
  }).length;
  // ---- 入口: 小さい姿でだけ通れる壁のうち、トンネルに接するもの ----
  // 道路の高さ(z >= STREET_Z)にあってトンネルから ENTRANCE_PX マス以内 → 地上からの入口
  // ミッド・ボスの部屋の高さ(z <= MIDBOSS_Z)にあるもの → ミッド・ボスの部屋からの入口
  // それ以外(トンネルの途中の高さ)は内部の仕切りとみなし、入口にはしない
  const distTo = (px: number, py: number, limit: number) => {
    let best = Infinity;
    for (let dy = -limit; dy <= limit; dy++) {
      for (let dx = -limit; dx <= limit; dx++) {
        const x = px + dx, y = py + dy;
        if (x >= 0 && y >= 0 && x < N && y < N && keep[y * N + x]) best = Math.min(best, Math.hypot(dx, dy));
      }
    }
    return best;
  };
  const entrances: MapFile["tunnelEntrances"] = [];
  for (const p of opts.map.passages) {
    const d = distTo(Math.floor(toU(p.x)), Math.floor(toV(p.y)), ENTRANCE_PX);
    if (p.z <= MIDBOSS_Z && d <= ENTRANCE_PX) entrances.push({ ...p, from: "midboss" });
    else if (p.z >= STREET_Z && d <= ENTRANCE_PX) entrances.push({ ...p, from: "street" });
  }
  return { cells, seeds: seeds.length, seedsInside, entrances };
}
