/**
 * 最小限の PNG デコーダ(8bit の RGB / RGBA / グレースケールだけ)。
 * マップの地下判定で、ミニマップのトンネル画像の画素を見るためだけに使う。
 * 依存を増やさないよう node:zlib だけで書いている。
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

export interface DecodedPng {
  width: number;
  height: number;
  /** (x, y) の画素を [R, G, B, A] で返す。範囲外は null */
  pixel(x: number, y: number): [number, number, number, number] | null;
}

export function decodePng(path: string): DecodedPng {
  const buf = readFileSync(path);
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const bpp = ({ 6: 4, 2: 3, 0: 1, 4: 2 } as Record<number, number>)[colorType];
  if (bitDepth !== 8 || !bpp) throw new Error(`対応していない PNG です(colorType=${colorType}, bitDepth=${bitDepth}): ${path}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp]! : 0;
      let v = line[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }

  return {
    width,
    height,
    pixel(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      const i = y * stride + x * bpp;
      if (bpp === 4) return [out[i]!, out[i + 1]!, out[i + 2]!, out[i + 3]!];
      if (bpp === 3) return [out[i]!, out[i + 1]!, out[i + 2]!, 255];
      if (bpp === 2) return [out[i]!, out[i]!, out[i]!, out[i + 1]!];
      return [out[i]!, out[i]!, out[i]!, 255];
    },
  };
}
