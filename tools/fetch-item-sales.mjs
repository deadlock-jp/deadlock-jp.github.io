// @ts-check
/**
 * アイテムの「売却と強化」の統計を deadlock-api.com の試合データから集計し、data/item-sales.json に保存する。
 * アイテムページの「売却と強化」のセクションが読む(src/components/ItemSales.astro)。
 *
 * 取ってくるのは数値だけで、文章は取り込まない。統計なので Git には入れない(.gitignore。ほかの統計と同じ)。
 * デプロイのたびに tools/fetch-stats.mjs から呼ばれるが、SQL の上限(1時間20回)があるので、
 * 前回の取得から6時間たっていなければ fetch-stats.mjs 側で呼ばずに前回分を使う。
 *
 * ■ 分担
 *   tools/item-sales/sql-source.mjs … SQL を投げて集計済みの行を受け取る(取得部分。集計の定義もここ)
 *   このファイル                     … 期間・取り消しの基準・ランク帯を決めて取得部分を呼び、行をファイルの形に整える
 * SQL が廃止されたら、取得部分だけデータレイク(data.deadlock-api.com)版に替える。
 *
 * ■ 期間・帯・基準
 *   - 期間: 最新のバランス変更以降(tools/stats-window.mjs。ほかの統計と同じ起点)のランク戦
 *   - ランク帯: all + src/lib/rankBands.json の low / mid / high
 *   - 取り消しの基準秒数: convar citadel_autobuy_refund_time(購入直後の全額返金の猶予。最新スナップショットの convars.json)。
 *     convars.json に無ければ 10 秒
 *
 * 使い方:
 *   node tools/fetch-item-sales.mjs            (dry-run。件数と例だけ表示。SQL は1回投げる)
 *   node tools/fetch-item-sales.mjs --write    (data/item-sales.json を書き出す)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statsWindow } from "./stats-window.mjs";
import { fetchItemSalesRows } from "./item-sales/sql-source.mjs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_PATH = join(REPO_ROOT, "data", "item-sales.json");
const ASSETS = "https://api.deadlock-api.com/v1/assets";
/** 取り消しの基準を convar から取れなかったときの秒数 */
const DEFAULT_CANCEL_SECONDS = 10;
/** これ未満の件数は「サンプル少」として画面側で区別する(除外はしない。item-stats と同じ) */
const LOW_SAMPLE = 20;
const RANK_BANDS = JSON.parse(readFileSync(join(REPO_ROOT, "src", "lib", "rankBands.json"), "utf8")).bands;

const write = process.argv.includes("--write");

// --- 期間・取り消しの基準 ---
const WINDOW = statsWindow(REPO_ROOT);
const latest = JSON.parse(readFileSync(join(REPO_ROOT, "data", "latest.json"), "utf8"));
const snapDir = join(REPO_ROOT, "data", "snapshots", latest.version);
const convarsPath = join(snapDir, "convars.json");
const convarRefund = existsSync(convarsPath)
  ? JSON.parse(readFileSync(convarsPath, "utf8")).values?.citadel_autobuy_refund_time
  : undefined;
const cancelSeconds = typeof convarRefund === "number" ? convarRefund : DEFAULT_CANCEL_SECONDS;
const cancelSource = typeof convarRefund === "number" ? "convar:citadel_autobuy_refund_time" : "default";
console.error(`集計期間: ${WINDOW.startIso} 以降(${WINDOW.patch.date} ${WINDOW.patch.titleEn})`);
console.error(`取り消しの基準: ${cancelSeconds}秒(${cancelSource})`);

// --- こちらのアイテム・ヒーロー、数値ID ↔ 文字列ID ---
const itemsFile = JSON.parse(readFileSync(join(snapDir, "items.json"), "utf8"));
const heroesFile = JSON.parse(readFileSync(join(snapDir, "heroes.json"), "utf8"));
const shopItemIds = new Set(
  Object.values(itemsFile.items)
    .filter((i) => i.inShop)
    .map((i) => i.id),
);
const releasedHeroIds = new Set(
  Object.values(heroesFile.heroes)
    .filter((h) => h.released)
    .map((h) => h.id),
);
const assetsRes = await fetch(`${ASSETS}/items?type=upgrade`);
if (!assetsRes.ok) throw new Error(`HTTP ${assetsRes.status}: ${ASSETS}/items`);
/** @type {Map<number, string>} */
const idByNumeric = new Map();
for (const a of await assetsRes.json()) if (shopItemIds.has(a.class_name)) idByNumeric.set(a.id, a.class_name);
console.error(`アイテムIDの対応: ショップ掲載 ${shopItemIds.size} 件中 ${idByNumeric.size} 件を解決`);

// --- 取得 ---
const { rows, seconds, bytes } = await fetchItemSalesRows({
  start: WINDOW.start,
  end: WINDOW.end,
  cancelSeconds,
  bands: RANK_BANDS,
});
console.error(`SQL: ${rows.length} 行 / ${Math.round(bytes / 1024)}KB / ${seconds.toFixed(1)}秒`);

// --- ファイルの形に整える ---
/** 秒の四分位。売却が無い件では null */
const q = (/** @type {number[]} */ v, /** @type {number} */ count) =>
  count > 0 && v.length === 3 && v.every(Number.isFinite) ? v.map((x) => Math.round(x)) : null;

/** @type {Record<string, { matches: number, items: Record<string, any> }>} */
const bands = {};
for (const key of ["all", ...RANK_BANDS.map((b) => b.key)]) bands[key] = { matches: 0, items: {} };
for (const r of rows) {
  const id = idByNumeric.get(r.itemId);
  const band = bands[r.band];
  if (!id || !band) continue; // ショップ外のアイテムは載せない
  const item = (band.items[id] ??= { n: 0, sold: 0, upgraded: 0, held: 0, canceled: 0, buy: null, sell: null, hold: null, heroes: [] });
  if (r.heroId === 0) {
    Object.assign(item, {
      n: r.n,
      sold: r.sold,
      upgraded: r.upgraded,
      held: r.held,
      canceled: r.canceled,
      buy: q(r.buy, r.n),
      sell: q(r.sell, r.sold),
      hold: q(r.hold, r.sold),
    });
  } else if (releasedHeroIds.has(r.heroId) && r.n > 0) {
    // ヒーロー別は件数だけ(よく売るヒーローの並べ替えに使う)。[ヒーローID, 件数, 売却, 強化, 保持]
    item.heroes.push([r.heroId, r.n, r.sold, r.upgraded, r.held]);
  }
}
for (const band of Object.values(bands)) {
  for (const item of Object.values(band.items)) item.heroes.sort((a, b) => b[1] - a[1]);
  // 帯の規模の目安(アイテムの件数の合計)。表示には使わず、空の帯を見分ける安全装置に使う
  band.matches = Object.values(band.items).reduce((s, i) => s + i.n, 0);
}

const doc = {
  schemaVersion: 1,
  source: "https://api.deadlock-api.com/v1/sql (match_player.items)",
  fetchedAt: new Date().toISOString(),
  window: "sincePatch",
  windowStart: WINDOW.startIso,
  windowEnd: WINDOW.endIso,
  windowPatch: WINDOW.patch,
  /** これ以内の売却は「買い間違いの取り消し」として除いた(秒) */
  cancelSeconds,
  cancelSource,
  lowSampleMatches: LOW_SAMPLE,
  /**
   * bands.<帯>.items.<アイテムID>:
   *   n = 購入された件数(1プレイヤー×1試合。売却 + 強化 + 保持)、canceled = 除いた取り消しの件数
   *   buy / sell / hold = [25%, 50%, 75%] の秒(購入時刻・売却時刻・保持時間)。売却が無ければ sell / hold は null
   *   heroes = [ヒーローID, 件数, 売却, 強化, 保持] の配列(件数の多い順)
   */
  bands,
};

// 安全装置: どの帯でもアイテムが半分以上そろっていること(SQL が空や途中までの応答を返したときに既存を潰さない)
const short = Object.entries(bands).filter(([, b]) => Object.keys(b.items).length < shopItemIds.size * 0.5);
if (short.length > 0) {
  console.error(`アイテムがそろっていない帯: ${short.map(([k, b]) => `${k}(${Object.keys(b.items).length}件)`).join(", ")}。書き込みを中止します`);
  process.exit(1);
}

const kb = Math.round(JSON.stringify(doc).length / 1024);
for (const [key, b] of Object.entries(bands)) {
  console.error(`  ${key.padEnd(4)} アイテム ${Object.keys(b.items).length} 件 / 購入 ${b.matches.toLocaleString("en-US")} 件`);
}
if (write) {
  writeFileSync(OUT_PATH, JSON.stringify(doc) + "\n");
  console.error(`data/item-sales.json を更新 (${kb}KB)`);
} else {
  console.error(`(dry-run) ${kb}KB。--write で保存します`);
}
