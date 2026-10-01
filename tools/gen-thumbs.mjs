/**
 * 小さく表示する画像の縮小版(WebP)を、public/images/ の元画像から作る。
 * 元画像(ゲームから抽出して置いたもの)は変えない。縮小版は public/images/_t/ に、元と同じ相対パスで置く
 * (拡張子だけ .webp)。2つ目以降の幅は public/images/_t/@<幅>/ の下。
 * _t/ は gitignore 済みで、ビルドのたびにここで作る(npm run build / dev の前に自動で走る)。
 *
 *   node tools/gen-thumbs.mjs          足りない・古いものだけ作る
 *   node tools/gen-thumbs.mjs --force  全部作り直す
 *
 * どの画像をどの幅にするかは src/lib/thumbRules.json(画面側の src/lib/thumbs.ts と共有)。
 * 幅は「その画像を出す表示サイズ × 2.5 前後」(デバイスピクセル比3のスマホでもぼやけない大きさ)。
 * 元画像のほうが小さければ拡大はせず、形式だけ WebP にする。
 *
 * 作った縮小版の幅(元画像の相対パス → 幅の一覧)は public/images/_t/index.json に書く。画面側はこれを見て、
 * 縮小版を使うか決める(縮小版が無い・小さすぎるときは元画像のまま。開発中にこのスクリプトを回していなくても表示は壊れない)。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const outRoot = path.join(pub, "images/_t");

/*
 * sharp は astro が入れる(optionalDependencies)。万一入っていなくてもビルドは止めず、縮小版なし(元画像のまま)で進める
 */
let sharp;
try {
  sharp = (await import("sharp")).default;
} catch (e) {
  console.warn(`gen-thumbs: sharp を読み込めないので縮小版を作らない(表示は元画像のまま): ${e.message}`);
  fs.mkdirSync(outRoot, { recursive: true });
  if (!fs.existsSync(path.join(outRoot, "index.json"))) fs.writeFileSync(path.join(outRoot, "index.json"), "{}");
  process.exit(0);
}
const rules = JSON.parse(fs.readFileSync(path.join(root, "src/lib/thumbRules.json"), "utf8")).rules;
const force = process.argv.includes("--force");

const walk = (d) =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
    : [];

/** "images/items/a/b.png" に当てはまる規則 */
function ruleFor(rel) {
  return rules.find((r) => rel.startsWith(r.dir + "/") && (!r.match || new RegExp(r.match).test(rel)));
}

/**
 * 縮小版の相対パス。"images/items/a/b.png" → "images/_t/items/a/b.webp"
 * (2つ目以降の幅は "images/_t/@96/items/a/b.webp")。src/lib/thumbs.ts と同じ形
 */
function thumbRel(rel, extraWidth) {
  const stem = rel.slice("images/".length).replace(/\.[a-z]+$/i, "");
  return `images/_t/${extraWidth ? `@${extraWidth}/` : ""}${stem}.webp`;
}

const t0 = Date.now();
const index = {};
let made = 0;
let kept = 0;
let bytesIn = 0;
let bytesOut = 0;
for (const r of rules) {
  for (const abs of walk(path.join(pub, r.dir))) {
    const rel = path.relative(pub, abs).split(path.sep).join("/");
    if (!/\.(png|jpe?g|webp)$/i.test(rel) || ruleFor(rel) !== r) continue;
    const srcStat = fs.statSync(abs);
    let srcWidth = null;
    const widths = [];
    for (const [k, want] of r.widths.entries()) {
      const outAbs = path.join(pub, thumbRel(rel, k === 0 ? null : want));
      let width;
      if (!force && fs.existsSync(outAbs) && fs.statSync(outAbs).mtimeMs >= srcStat.mtimeMs) {
        width = (await sharp(outAbs).metadata()).width;
        kept++;
      } else {
        srcWidth ??= (await sharp(abs).metadata()).width;
        // 元より大きくはしない。2つ目以降の幅が元以上なら作らない
        if (k > 0 && want >= srcWidth) continue;
        width = Math.min(srcWidth, want);
        fs.mkdirSync(path.dirname(outAbs), { recursive: true });
        await sharp(abs).resize({ width, withoutEnlargement: true }).webp({ quality: r.quality ?? 82, effort: 5 }).toFile(outAbs);
        made++;
      }
      if (k === 0) bytesOut += fs.statSync(outAbs).size;
      widths.push(width);
    }
    bytesIn += srcStat.size;
    index[rel] = widths;
  }
}
fs.mkdirSync(outRoot, { recursive: true });
fs.writeFileSync(path.join(outRoot, "index.json"), JSON.stringify(index));
console.log(
  `gen-thumbs: 元画像 ${Object.keys(index).length} 枚 → 縮小版 ${made + kept} 枚(新規 ${made} / 再利用 ${kept})` +
    ` 元 ${(bytesIn / 1048576).toFixed(1)}MB → 基本の幅 ${(bytesOut / 1048576).toFixed(1)}MB  ${((Date.now() - t0) / 1000).toFixed(1)}秒`,
);
