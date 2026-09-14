// @ts-check
/**
 * deadlock-api.com(コミュニティ製の公開REST API)から、ヒーロー×アイテムの
 * 人気率・勝率を取得して data/item-stats.json に保存する。
 *
 * 取ってくるのは数値の統計だけで、文章は一切取り込まない
 * (CLAUDE.md ルール3「第三者サイトの文章は転載しない」に抵触しない)。
 * ゲーム本体から抽出する data/snapshots/ とは出所も更新周期も別物なので、
 * スナップショットには混ぜず data/ 直下に置く(patch-notes.json と同じ扱い)。
 *
 * ■ アイテムIDの対応について
 * APIは数値のアイテムID(7409189 など)を返すが、こちらのデータは
 * ゲーム内部の文字列ID(upgrade_ancient_shield)を使っている(CLAUDE.md ルール4)。
 * ゲーム本体の .vdata に数値IDは入っていない(実測: m_nID 系のフィールドは0件)ため、
 * assets.deadlock-api.com の class_name ↔ id 表を対応付けに使う。
 * ショップ掲載アイテム156件は全件この表で解決できることを確認済み。
 *
 * ■ 集計期間
 * APIの既定は「直近30日」。パッチ単位で区切りたくなったら
 * min_unix_timestamp / max_unix_timestamp を渡す(今はスコープ外)。
 * TODO: ランク帯(min_average_badge)や試合モードでの絞り込みも将来の拡張候補。
 *
 * 使い方:
 *   node tools/fetch-item-stats.mjs             (dry-run。件数だけ表示)
 *   node tools/fetch-item-stats.mjs --write     (data/item-stats.json を書き出す)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_PATH = join(REPO_ROOT, "data", "item-stats.json");

const API = "https://api.deadlock-api.com/v1";
const ASSETS = "https://assets.deadlock-api.com/v2";
/** これ未満の試合数は「サンプル少」として画面側で区別する(除外はしない) */
const LOW_SAMPLE = 20;
/** レート制限は 200req/min。40リクエスト程度だが余裕を持たせる */
const DELAY_MS = 150;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

/** 小数を 0.1% 刻みの整数にする(0.5034 → 503)。JSONを小さく保つため */
const permille = (v) => Math.round(v * 1000);

// --- 1. こちらのデータ側のアイテム・ヒーロー ---
const latest = JSON.parse(readFileSync(join(REPO_ROOT, "data", "latest.json"), "utf8"));
const snapDir = join(REPO_ROOT, "data", "snapshots", latest.version);
const itemsFile = JSON.parse(readFileSync(join(snapDir, "items.json"), "utf8"));
const heroesFile = JSON.parse(readFileSync(join(snapDir, "heroes.json"), "utf8"));
/** ビルドページが並べるのはショップ掲載アイテムだけ。それ以外は取り込まない */
const shopItemIds = new Set(
  Object.values(itemsFile.items)
    .filter((i) => i.inShop)
    .map((i) => i.id),
);
const heroes = Object.values(heroesFile.heroes)
  .filter((h) => h.released)
  .map((h) => ({ id: h.id, key: h.key }))
  .sort((a, b) => a.id - b.id);

// --- 2. 数値ID ↔ 文字列ID の対応表 ---
console.error("アイテムIDの対応表を取得中...");
const assets = await getJson(`${ASSETS}/items?type=upgrade`);
/** @type {Map<number, string>} 数値ID → 文字列ID(ショップ掲載分のみ) */
const idByNumeric = new Map();
for (const a of assets) {
  if (shopItemIds.has(a.class_name)) idByNumeric.set(a.id, a.class_name);
}
console.error(`  ショップ掲載 ${shopItemIds.size} 件中 ${idByNumeric.size} 件を解決`);
if (idByNumeric.size < shopItemIds.size) {
  const resolved = new Set(idByNumeric.values());
  const missing = [...shopItemIds].filter((id) => !resolved.has(id));
  console.error(`  警告: 対応表に無いアイテム ${missing.length} 件: ${missing.slice(0, 5).join(", ")}`);
}

// --- 3. ヒーローごとの総試合数(人気率の分母) ---
console.error("ヒーローの試合数を取得中...");
const heroStats = await getJson(`${API}/analytics/hero-stats`);
/** @type {Map<number, number>} */
const matchesByHero = new Map(heroStats.map((h) => [h.hero_id, h.matches]));

// --- 4. ヒーローごとのアイテム統計 ---
const out = {};
let totalRows = 0;
for (const hero of heroes) {
  const heroMatches = matchesByHero.get(hero.id);
  if (!heroMatches) {
    console.error(`  ${hero.key} (id=${hero.id}): APIに試合数が無いので飛ばす`);
    continue;
  }
  // bucket=hero にすると、返ってくる bucket の値が hero_id になる
  const rows = await getJson(
    `${API}/analytics/item-stats?hero_ids=${hero.id}&bucket=hero&min_matches=1`,
  );
  const itemsOut = {};
  for (const r of rows) {
    const itemId = idByNumeric.get(r.item_id);
    if (!itemId) continue; // ショップ外のアイテム(TIER5やスキル等)は載せない
    if (!r.matches) continue;
    itemsOut[itemId] = [
      permille(r.matches / heroMatches), // 人気率
      permille(r.wins / r.matches), // 勝率
      r.matches, // サンプル数
    ];
  }
  out[hero.id] = { matches: heroMatches, items: itemsOut };
  totalRows += Object.keys(itemsOut).length;
  console.error(`  ${hero.key} (id=${hero.id}): ${Object.keys(itemsOut).length} 件`);
  await sleep(DELAY_MS);
}

const doc = {
  schemaVersion: 1,
  source: `${API}/analytics/item-stats`,
  idSource: `${ASSETS}/items`,
  fetchedAt: new Date().toISOString(),
  /** APIの既定の集計期間。パッチ単位に変えるならここと取得URLを直す */
  window: "last30days",
  /** 画面側で「サンプル少」と出す境目 */
  lowSampleMatches: LOW_SAMPLE,
  /** items の値は [人気率, 勝率, サンプル試合数]。率は 0.1% 刻みの整数(503 = 50.3%) */
  format: "[pickPermille, winPermille, matches]",
  heroes: out,
};

/*
 * 無人実行(GitHub Actions)で上書きするので、APIが一部落ちていたときに
 * スカスカのデータで既存ファイルを潰さないよう下限を設ける。
 */
const okHeroes = Object.keys(out).length;
if (okHeroes < heroes.length * 0.9 || totalRows < 1000) {
  console.error(
    `取得結果が少なすぎるので書き込みを中止: ${okHeroes}/${heroes.length} ヒーロー, ${totalRows} 行`,
  );
  process.exit(1);
}

if (flag("write")) {
  writeFileSync(OUT_PATH, JSON.stringify(doc) + "\n");
  const kb = Math.round(JSON.stringify(doc).length / 1024);
  console.error(`data/item-stats.json を更新: ${heroes.length} ヒーロー / ${totalRows} 行 (${kb}KB)`);
} else {
  const kb = Math.round(JSON.stringify(doc).length / 1024);
  console.error(`(dry-run) ${Object.keys(out).length} ヒーロー / ${totalRows} 行 (${kb}KB)。--write で保存します`);
}
