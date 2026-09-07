/**
 * ヒーロー画像を deadlock-extract から public/images/heroes/ へ配置する。
 *
 *   正方形アイコン: <codename>_sm_psd.png (Vindicta のみ hornet_sm_png.png)
 *       → public/images/heroes/<codename>_sm.png
 *         (heroes.json の images.iconSmall を resolveImagePath した outPath と一致するので、
 *          HeroPortrait 側は無改造でこの実画像を拾う)
 *   詳細ページの肖像: <英語表示名>_Render.png (1440px 前後・数MB)
 *       → 幅 760 の WebP に縮小して public/images/heroes/render/<herokey>.webp
 *         (herokey = key から "hero_" を除いたもの)
 *
 * 数値と同じく画像も手作業で名前を付け替えない。対応は上の2規則だけで、
 * どちらも決め打ちの推測ではなく「iconSmall の参照パス」「公式英語表示名」から導いている。
 *
 * WebP 変換に sharp を使う。CI に載せたくないので devDependencies には入れず、
 * 実行前に:  npm i --no-save sharp
 *
 * 使い方:  node tools/hero-images.mjs [--src <extractのheroesフォルダ>] [--dry]
 */
import { readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const srcIdx = args.indexOf("--src");
const SRC =
  srcIdx >= 0 && args[srcIdx + 1]
    ? args[srcIdx + 1]
    : "C:/Users/nogud/OneDrive/ドキュメント/deadlock-extract/game-images/panorama/images/heroes";

const RENDER_WIDTH = 760;
const RENDER_QUALITY = 82;

/** file://{images}/heroes/x_sm.psd → public/images/heroes/x_sm.png (image-manifest と同じ規則) */
function smOutFor(ref) {
  const m = /^file:\/\/\{images\}\/(.+)$/.exec(ref ?? "");
  if (!m) return null;
  return `public/images/${m[1].replace(/\.[a-z0-9]+$/i, "")}.png`;
}
/** file://{images}/heroes/x_sm.psd → x_sm_psd.png (抽出物のファイル名。拡張子が _psd として残る) */
function smExtractFor(ref) {
  const m = /^file:\/\/\{images\}\/heroes\/(.+)$/.exec(ref ?? "");
  if (!m) return null;
  const ext = /\.([a-z0-9]+)$/i.exec(m[1])?.[1]?.toLowerCase() ?? "";
  return `${m[1].replace(/\.[a-z0-9]+$/i, "")}_${ext}.png`;
}

const heroes = JSON.parse(readFileSync(join(repoRoot, "data/heroes.json"), "utf8"));
const enLoc = JSON.parse(readFileSync(join(repoRoot, "data/localization.english.json"), "utf8"));
const enName = (nameToken) => enLoc.tokens[nameToken]?.text ?? null;

const srcFiles = existsSync(SRC) ? readdirSync(SRC) : [];
if (!srcFiles.length) {
  console.error(`抽出フォルダが空か見つからない: ${SRC}`);
  process.exit(1);
}

const copies = []; // { from, to }          そのままコピー
const renders = []; // { from, to, key }     WebP へ縮小
const problems = [];
for (const h of Object.values(heroes.heroes)) {
  if (!h.released) continue;
  const key = h.key.replace(/^hero_/, "");

  const smOut = smOutFor(h.images.iconSmall);
  const smSrc = smExtractFor(h.images.iconSmall);
  if (!smOut || !smSrc) problems.push(`${h.key}: iconSmall の参照が読めない (${h.images.iconSmall})`);
  else if (!srcFiles.includes(smSrc)) problems.push(`${h.key}: 抽出物に ${smSrc} が無い`);
  else copies.push({ from: join(SRC, smSrc), to: join(repoRoot, smOut) });

  const en = enName(h.nameToken);
  if (!en) problems.push(`${h.key}: 英語表示名が引けない (${h.nameToken})`);
  else {
    const renderSrc = `${en.replace(/ /g, "_")}_Render.png`;
    if (!srcFiles.includes(renderSrc)) problems.push(`${h.key} (${en}): 抽出物に ${renderSrc} が無い`);
    else
      renders.push({
        from: join(SRC, renderSrc),
        to: join(repoRoot, `public/images/heroes/render/${key}.webp`),
        key,
      });
  }
}

const releasedCount = Object.values(heroes.heroes).filter((h) => h.released).length;
console.log(`対象ヒーロー ${releasedCount} 体`);
console.log(`アイコン ${copies.length} 件 / 肖像 ${renders.length} 件 / 問題 ${problems.length} 件`);
for (const p of problems) console.log(`  ! ${p}`);
if (problems.length) process.exit(1);

if (dry) {
  console.log("(--dry のため実行はしていない)");
  process.exit(0);
}

for (const c of copies) {
  mkdirSync(dirname(c.to), { recursive: true });
  copyFileSync(c.from, c.to);
}

const { default: sharp } = await import("sharp").catch(() => ({ default: null }));
if (!sharp) {
  console.error("sharp が無い。`npm i --no-save sharp` してから再実行してください（肖像の縮小に必要）");
  process.exit(1);
}
let before = 0;
let after = 0;
for (const r of renders) {
  mkdirSync(dirname(r.to), { recursive: true });
  before += statSync(r.from).size;
  await sharp(r.from)
    .resize({ width: RENDER_WIDTH, withoutEnlargement: true })
    .webp({ quality: RENDER_QUALITY })
    .toFile(r.to);
  after += statSync(r.to).size;
}
console.log(
  `配置完了: アイコン ${copies.length} 件 / 肖像 ${renders.length} 件 ` +
    `(${(before / 1e6).toFixed(1)}MB → ${(after / 1e6).toFixed(1)}MB WebP)`,
);
