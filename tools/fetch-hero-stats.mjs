// @ts-check
/**
 * deadlock-api.com(有志運営の公開REST API)から、ランク帯ごとのヒーロー統計
 * (ピック率・勝率・BAN率)を取得して data/hero-stats.json に保存する。
 *
 * tools/fetch-item-stats.mjs と同じく、取り込むのは数値だけで文章は入れない。
 * ゲーム本体由来ではないので data/snapshots/ には混ぜず data/ 直下に置く。
 *
 * ■ ランク帯
 * APIの avg_badge は「tier×10 + subtier」(11 = tier1/subtier1 〜 116 = tier11/subtier6)。
 * サブティアまで分けると細かすぎるので tier(1〜11)にまとめる。
 * tier は ゲーム内のランク名トークン Citadel_ranks_rank<tier-1> に対応する
 * (tier1 = rank0 = オブスキュラス 〜 tier11 = rank10)。表示名は画面側でこのトークンから引く。
 * bucket=0 はランク情報が無い試合。ランク別には使わず、全体集計にだけ含める。
 *
 * ■ BAN率について(重要)
 * hero-ban-stats はデモ解析でBANを取り出せた試合だけが対象で、
 * 「BANデータのある試合数」はAPIから取得できない(全体127万試合に対しBAN総数は18万程度)。
 * 1試合あたりのBAN数もゲーム本体のデータには入っていない。
 * そのため「BANされた試合の割合」は算出できず、
 * ここで出すBAN率は【全BANのうちそのヒーローが占める割合】とする。
 * 定数倍の違いなので、ヒーローの並び順は本来のBAN率と一致する。
 *
 * ■ ピック率
 * hero-stats の matches は「そのヒーローが使われた試合数」。1試合12人(6v6)なので
 * 全ヒーローの合計 ÷ 12 が総試合数になる。これを分母にする。
 *
 * TODO: 集計期間はAPIの既定(直近30日)。パッチ単位で区切るなら min_unix_timestamp を渡す。
 *
 * 使い方:
 *   node tools/fetch-hero-stats.mjs             (dry-run)
 *   node tools/fetch-hero-stats.mjs --write     (data/hero-stats.json を書き出す)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_PATH = join(REPO_ROOT, "data", "hero-stats.json");
const API = "https://api.deadlock-api.com/v1";
/** 1試合の人数(6v6)。ピック率の分母を出すのに使う */
const PLAYERS_PER_MATCH = 12;
/**
 * これ未満の試合数のランク帯は、率がぶれるので画面側で「サンプル少」と出す。
 * 最上位(エターナス)は母数が数百試合しかなく、1ヒーローあたり百試合前後になるため。
 */
const LOW_SAMPLE = 1000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

/** 小数を 0.1% 刻みの整数にする(0.5034 → 503) */
const permille = (v) => Math.round(v * 1000);
/** avg_badge(11〜116) → ランクtier(1〜11) */
const tierOf = (badge) => Math.floor(badge / 10);

// --- 実装済みヒーローだけを対象にする ---
const latest = JSON.parse(readFileSync(join(REPO_ROOT, "data", "latest.json"), "utf8"));
const heroesFile = JSON.parse(
  readFileSync(join(REPO_ROOT, "data", "snapshots", latest.version, "heroes.json"), "utf8"),
);
const releasedIds = new Set(
  Object.values(heroesFile.heroes)
    .filter((h) => h.released)
    .map((h) => h.id),
);

console.error("ランク帯別のヒーロー統計を取得中...");
const [heroRows, banRows] = await Promise.all([
  getJson(`${API}/analytics/hero-stats?bucket=avg_badge`),
  getJson(`${API}/analytics/hero-ban-stats?bucket=avg_badge`),
]);
console.error(`  hero-stats ${heroRows.length}行 / hero-ban-stats ${banRows.length}行`);

/**
 * tier ごとに集計する。"all" は全ランク(bucket=0 のランク不明分も含む)。
 * @type {Map<string, {matches: Map<number, number>, wins: Map<number, number>, bans: Map<number, number>}>}
 */
const buckets = new Map();
const bucketFor = (key) => {
  if (!buckets.has(key)) buckets.set(key, { matches: new Map(), wins: new Map(), bans: new Map() });
  return buckets.get(key);
};
const addTo = (map, id, n) => map.set(id, (map.get(id) ?? 0) + n);

for (const r of heroRows) {
  if (!releasedIds.has(r.hero_id)) continue;
  const all = bucketFor("all");
  addTo(all.matches, r.hero_id, r.matches);
  addTo(all.wins, r.hero_id, r.wins);
  if (!r.bucket) continue; // bucket=0 はランク不明
  const t = bucketFor(String(tierOf(r.bucket)));
  addTo(t.matches, r.hero_id, r.matches);
  addTo(t.wins, r.hero_id, r.wins);
}
for (const r of banRows) {
  if (!releasedIds.has(r.hero_id)) continue;
  addTo(bucketFor("all").bans, r.hero_id, r.bans);
  if (!r.bucket) continue;
  addTo(bucketFor(String(tierOf(r.bucket))).bans, r.hero_id, r.bans);
}

/** 各バケットを [ピック率, 勝率, BAN率(全BANに占める割合), 試合数] に変換する */
const out = {};
for (const [key, b] of buckets) {
  const heroSlots = [...b.matches.values()].reduce((s, n) => s + n, 0);
  const totalMatches = heroSlots / PLAYERS_PER_MATCH;
  const totalBans = [...b.bans.values()].reduce((s, n) => s + n, 0);
  if (totalMatches < 1) continue;
  const heroes = {};
  for (const [id, matches] of b.matches) {
    heroes[id] = [
      permille(matches / totalMatches),
      permille((b.wins.get(id) ?? 0) / matches),
      totalBans > 0 ? permille((b.bans.get(id) ?? 0) / totalBans) : null,
      matches,
    ];
  }
  out[key] = { matches: Math.round(totalMatches), bans: totalBans, heroes };
}

// 妥当性の確認: ピック率の合計は「1試合の人数」に一致するはず
const allSum = Object.values(out.all.heroes).reduce((s, v) => s + v[0], 0) / 1000;
console.error(`  ピック率の合計: ${allSum.toFixed(2)} (期待値 ${PLAYERS_PER_MATCH} 前後)`);
if (Math.abs(allSum - PLAYERS_PER_MATCH) > 1) {
  console.error("  警告: ピック率の合計が想定とずれている。分母の取り方を確認すること");
}

const doc = {
  schemaVersion: 1,
  source: `${API}/analytics/hero-stats`,
  banSource: `${API}/analytics/hero-ban-stats`,
  fetchedAt: new Date().toISOString(),
  window: "last30days",
  lowSampleMatches: LOW_SAMPLE,
  /** heroes の値は [ピック率, 勝率, BAN率, 試合数]。率は 0.1% 刻みの整数 */
  format: "[pickPermille, winPermille, banSharePermille, matches]",
  /** BAN率の定義。画面にもこの旨を出す */
  banRateNote: "BANデータが取れた試合のうち、全BANに占めるそのヒーローの割合",
  /** キーは "all" と ランクtier(1〜11)。tier は Citadel_ranks_rank<tier-1> に対応 */
  buckets: out,
};

const tiers = Object.keys(out).filter((k) => k !== "all");
if (!out.all || tiers.length < 5) {
  console.error(`取得結果が少なすぎるので中止: ランク帯 ${tiers.length} 件`);
  process.exit(1);
}

if (flag("write")) {
  writeFileSync(OUT_PATH, JSON.stringify(doc) + "\n");
  console.error(
    `data/hero-stats.json を更新: ランク帯 ${tiers.length} + 全体 (${Math.round(JSON.stringify(doc).length / 1024)}KB)`,
  );
} else {
  for (const k of ["all", ...tiers.sort((a, b) => Number(a) - Number(b))]) {
    console.error(`  ${k.padStart(3)}: ${out[k].matches.toLocaleString("en-US")}試合 / BAN ${out[k].bans.toLocaleString("en-US")}`);
  }
  console.error(`(dry-run) --write で保存します`);
}
