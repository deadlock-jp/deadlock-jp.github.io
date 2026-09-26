/**
 * ミニマップの地上画像を、地面が灰色に見える絵に描き直す。
 *
 * ゲームのミニマップ画像(minimap_midtown_mid)は、道(歩ける地面)が不透明な黒、
 * 建物の部分が透明、輪郭線が半透明の灰緑で描かれていて、ゲーム内では濃い灰色の円
 * (minimap_bg)の上に重ねて表示される。そのままだと地面が黒い「穴」に見えるので、
 * 不透明度を「地面らしさ」として色を割り当て直す:
 *   地面(不透明) → 灰色 / 建物(透明) → 黒 / 輪郭線 → 明るい灰緑 / 円の外 → 透明
 * 色の値は見た目の調整値で、ゲームデータの数値ではない。
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodePng } from "./png.ts";

const GROUND: [number, number, number] = [84, 90, 87];
const BUILDING: [number, number, number] = [16, 19, 18];
const LINE: [number, number, number] = [150, 170, 156];
/** 円の半径(画像の一辺に対する比)。ゲームのミニマップの円に合わせる */
const RADIUS = 0.485;

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

export function renderGroundMinimap(srcPath: string, outPath: string): void {
  const src = decodePng(srcPath);
  const { width: w, height: h } = src;
  const out = Buffer.alloc(w * h * 4);
  const cx = w / 2;
  const cy = h / 2;
  const r = w * RADIUS;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r + 1) continue; // 円の外は透明のまま
      const [sr, sg, sb, sa] = src.pixel(x, y)!;
      const a = sa / 255;
      const lum = (sr + sg + sb) / 3;
      // 暗い画素: 不透明なほど地面。明るい画素: 輪郭線
      let rgb = [0, 1, 2].map((k) => lerp(BUILDING[k]!, GROUND[k]!, lum < 40 ? a : 0));
      if (lum >= 40) rgb = [0, 1, 2].map((k) => lerp(rgb[k]!, LINE[k]!, Math.min(1, a * 3)));
      out[i] = rgb[0]!;
      out[i + 1] = rgb[1]!;
      out[i + 2] = rgb[2]!;
      // 円の縁だけなめらかに
      out[i + 3] = d > r ? Math.round(255 * (r + 1 - d)) : 255;
    }
  }
  writeFileSync(outPath, encodePng(w, h, out));
}

/** 8bit RGBA の PNG を書き出す(フィルタなし) */
export function encodePng(w: number, h: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return c ^ 0xffffffff;
}
