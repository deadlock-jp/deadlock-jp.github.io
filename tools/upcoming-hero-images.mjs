/**
 * 解禁前の新ヒーロー(heroes.json の preRelease)の肖像を public/images/heroes/upcoming/ へ置く。
 * アップデートのページの「近日追加」カードに使う。
 *
 * 解禁前ヒーローは heroes.vdata の m_strIconHeroCard(<キー>_card.psd)が VPK に無く、
 * 代わりにゲーム内の投票画面の絵がある:
 *   panorama/images/main_menu/hero_release_vote/hero_<キー>_psd.vtex_c (360x850)
 *     → 幅 WIDTH の WebP にして public/images/heroes/upcoming/<キー>.webp
 * (<キー> は heroes.json の key から "hero_" を除いたもの。6712 で6体とも一致を確認)
 *
 * 抽出は Source2Viewer-CLI で:
 *   Source2Viewer-CLI -i <Deadlock>/game/citadel/pak01_dir.vpk -o <出力先>
 *     -f panorama/images/main_menu/hero_release_vote/ -d
 *
 * WebP 変換に sharp を使う(hero-images.mjs と同じく devDependencies には入れない):
 *   npm i --no-save sharp
 *
 * 使い方:  node tools/upcoming-hero-images.mjs --src <出力先>/panorama/images/main_menu/hero_release_vote [--dry]
 */
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const srcIdx = args.indexOf("--src");
const SRC = srcIdx >= 0 ? args[srcIdx + 1] : null;
if (!SRC || !existsSync(SRC)) {
  console.error("--src に hero_release_vote の抽出フォルダを渡してください");
  process.exit(1);
}

const WIDTH = 240;
const QUALITY = 86;

const latestVersion = JSON.parse(readFileSync(join(repoRoot, "data/latest.json"), "utf8")).version;
const heroes = JSON.parse(readFileSync(join(repoRoot, "data/snapshots", latestVersion, "heroes.json"), "utf8"));

const jobs = [];
const problems = [];
for (const h of Object.values(heroes.heroes)) {
  if (!h.preRelease) continue;
  const key = h.key.replace(/^hero_/, "");
  const from = join(SRC, `hero_${key}_psd.png`);
  if (!existsSync(from)) problems.push(`${h.key}: 抽出物に hero_${key}_psd.png が無い`);
  else jobs.push({ from, to: join(repoRoot, `public/images/heroes/upcoming/${key}.webp`) });
}

console.log(`解禁前ヒーロー ${jobs.length + problems.length} 体 / 変換 ${jobs.length} 件 / 問題 ${problems.length} 件`);
for (const p of problems) console.log(`  ! ${p}`);
if (problems.length) process.exit(1);
if (dry) {
  console.log("(--dry のため実行はしていない)");
  process.exit(0);
}

const { default: sharp } = await import("sharp").catch(() => ({ default: null }));
if (!sharp) {
  console.error("sharp が無い。`npm i --no-save sharp` してから再実行してください");
  process.exit(1);
}
let size = 0;
for (const j of jobs) {
  mkdirSync(dirname(j.to), { recursive: true });
  await sharp(j.from).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(j.to);
  size += statSync(j.to).size;
}
console.log(`配置完了: ${jobs.length} 件 (${(size / 1e3).toFixed(0)}KB)`);
