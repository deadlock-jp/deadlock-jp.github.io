/**
 * 小さく表示する画像を、縮小版(tools/gen-thumbs.mjs が作る public/images/_t/ の WebP)に差し替える。
 *
 * 縮小版の幅は public/images/_t/index.json(元画像の相対パス → 幅の一覧)。表示サイズの 2.5 倍以上ある
 * 縮小版のうち一番小さいものを使う(デバイスピクセル比3のスマホでもぼやけないように)。
 * 縮小版が無い・どれも小さすぎるときは元画像のまま返す(開発中に縮小版を作っていなくても表示は壊れない)。
 *
 * public/ は process.cwd() 基準で読む(src/lib/data.ts と同じ理由。CLAUDE.md の落とし穴)。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import rulesJson from "./thumbRules.json" with { type: "json" };

const MIN_RATIO = 2.5;

let index: Record<string, number[]> | null = null;
function thumbIndex(): Record<string, number[]> {
  if (index) return index;
  const f = join(process.cwd(), "public/images/_t/index.json");
  index = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Record<string, number[]>) : {};
  return index;
}

const clean = (rel: string) => rel.replace(/^\/+/, "").replace(/^public\//, "");

/** 規則の幅の一覧(先頭が基本の幅) */
function ruleWidths(rel: string): number[] {
  const r = rulesJson.rules.find((x) => rel.startsWith(x.dir + "/") && (!("match" in x) || new RegExp(x.match as string).test(rel)));
  return r?.widths ?? [];
}

/**
 * 縮小版の相対パス。"images/items/a/b.png" → "images/_t/items/a/b.webp"
 * (規則の2つ目以降の幅は "images/_t/@96/items/a/b.webp")。tools/gen-thumbs.mjs と同じ形
 */
function thumbRel(rel: string, width: number): string {
  const stem = rel.slice("images/".length).replace(/\.[a-z]+$/i, "");
  const extra = ruleWidths(rel).indexOf(width) > 0;
  return `images/_t/${extra ? `@${width}/` : ""}${stem}.webp`;
}

/**
 * 表示サイズ displayPx(CSS px)で出す画像の相対パス。足りる縮小版があればそちら。
 * rel・戻り値とも "images/..." の形(呼ぶ側で base を前に付ける)
 */
export function smallImage(rel: string, displayPx: number): string {
  const r = clean(rel);
  const made = thumbIndex()[r];
  if (!made) return r;
  // 規則の幅(作ったときの指定)と、実際にできた幅(元が小さいと縮む)を対にして選ぶ
  const want = ruleWidths(r);
  const pairs = made.map((w, i) => ({ w, key: i === 0 ? want[0]! : want[i]! })).sort((a, b) => a.w - b.w);
  const hit = pairs.find((p) => p.w >= displayPx * MIN_RATIO);
  return hit ? thumbRel(r, hit.key) : r;
}

/** 決まった幅の縮小版(スマホだけ別の絵を出す <picture> 用)。無ければ null */
export function thumbAt(rel: string, width: number): string | null {
  const r = clean(rel);
  const made = thumbIndex()[r];
  const want = ruleWidths(r);
  const i = want.indexOf(width);
  return made && i >= 0 && made[i] !== undefined ? thumbRel(r, width) : null;
}
