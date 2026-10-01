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
 * tier をまとめた帯(src/lib/rankBands.json の low / mid / high)も出す。
 * 帯は追加のリクエストをせず、同じ応答の avg_badge ごとの生の試合数・勝利数・BAN数を足して作る
 * (丸めた‰値を足すのではないので誤差は積み重ならない)。avg_badge で絞って API から取った値と
 * 一致することを 2026-10-01 に確認済み(上位帯: 36,077 ヒーロー枠)。
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
 * ■ 集計期間
 * 「最新のバランス変更があったアップデート以降」(tools/stats-window.mjs。fetch-item-stats.mjs と同じ起点)。
 * hero-stats・hero-ban-stats とも min_unix_timestamp が効くことを 2026-09-30 に確認
 * (hero-stats のヒーロー枠 30日 1548万 → 39万、BAN 6.7万 → 626)。
 *
 * 使い方:
 *   node tools/fetch-hero-stats.mjs             (dry-run)
 *   node tools/fetch-hero-stats.mjs --write     (data/hero-stats.json を書き出す)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statsWindow } from "./stats-window.mjs";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 失敗したら少し待って2回まで取り直す。それでも失敗すれば例外で止まる(書き込まない) */
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 3) throw e;
      console.error(`  取得に失敗(${attempt}回目)。取り直す: ${e instanceof Error ? e.message : e}`);
      await sleep(2000 * attempt);
    }
  }
}

/** 集計期間の起点(最新のバランス変更があったアップデートの投稿時刻) */
const WINDOW = statsWindow(REPO_ROOT);
/** 集計期間。終点(max_unix_timestamp)はすべての問い合わせで同じ値にする(理由は tools/stats-window.mjs) */
const SINCE = `min_unix_timestamp=${WINDOW.start}&max_unix_timestamp=${WINDOW.end}`;
console.error(
  `集計期間: ${WINDOW.startIso} 以降(${WINDOW.patch.date} ${WINDOW.patch.titleEn} / 起点の取り方: ${WINDOW.source})`,
);

/** 小数を 0.1% 刻みの整数にする(0.5034 → 503) */
const permille = (v) => Math.round(v * 1000);
/** avg_badge(11〜116) → ランクtier(1〜11) */
const tierOf = (badge) => Math.floor(badge / 10);
/** ランク帯の定義(画面側の src/lib/rankBands.ts と共有) */
const RANK_BANDS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "rankBands.json"), "utf8"),
).bands;
/** avg_badge → それを含む帯のキー(どこにも入らなければ null) */
const bandOf = (badge) => RANK_BANDS.find((b) => badge >= b.minBadge && badge <= b.maxBadge)?.key ?? null;

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
  getJson(`${API}/analytics/hero-stats?bucket=avg_badge&${SINCE}`),
  getJson(`${API}/analytics/hero-ban-stats?bucket=avg_badge&${SINCE}`),
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
  for (const key of [String(tierOf(r.bucket)), bandOf(r.bucket)]) {
    if (!key) continue;
    const t = bucketFor(key);
    addTo(t.matches, r.hero_id, r.matches);
    addTo(t.wins, r.hero_id, r.wins);
  }
}
for (const r of banRows) {
  if (!releasedIds.has(r.hero_id)) continue;
  addTo(bucketFor("all").bans, r.hero_id, r.bans);
  if (!r.bucket) continue;
  for (const key of [String(tierOf(r.bucket)), bandOf(r.bucket)]) {
    if (key) addTo(bucketFor(key).bans, r.hero_id, r.bans);
  }
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
  /** 集計期間。最新のバランス変更があったアップデート以降(tools/stats-window.mjs) */
  window: "sincePatch",
  windowStart: WINDOW.startIso,
  /** 集計の終点(取得した時刻)。分母と分子をこの時点にそろえて取っている */
  windowEnd: WINDOW.endIso,
  windowSource: WINDOW.source,
  windowPatch: WINDOW.patch,
  lowSampleMatches: LOW_SAMPLE,
  /** heroes の値は [ピック率, 勝率, BAN率, 試合数]。率は 0.1% 刻みの整数 */
  format: "[pickPermille, winPermille, banSharePermille, matches]",
  /** BAN率の定義。画面にもこの旨を出す */
  banRateNote: "BANデータが取れた試合のうち、全BANに占めるそのヒーローの割合",
  /**
   * キーは "all"、ランクtier("1"〜"11")、tier をまとめた帯(src/lib/rankBands.json の "low" / "mid" / "high")。
   * tier は Citadel_ranks_rank<tier-1> に対応
   */
  buckets: out,
};

/*
 * 無人実行で上書きするので、API が一部落ちていたときは書き込まない。
 *   - リクエストの失敗は getJson が取り直したうえで例外にする(ここまで来れば両方成功している)
 *   - 全体("all")と帯(low / mid / high)のそれぞれで、試合数が出ているヒーローが実装済みの9割未満なら中止
 *     (空に近い応答を見分ける)。1帯でも満たさなければ書き込まない
 * tier ごと(1〜11)は判定しない。パッチ直後は試合の少ない上位 tier がまだ無いことがあるため。
 */
const bandKeys = ["all", ...RANK_BANDS.map((b) => b.key)];
const tiers = Object.keys(out).filter((k) => !bandKeys.includes(k));
const short = bandKeys.filter((k) => Object.keys(out[k]?.heroes ?? {}).length < releasedIds.size * 0.9);
if (short.length > 0) {
  for (const k of short) {
    console.error(`[${k}] 試合数のあるヒーローが少なすぎる: ${Object.keys(out[k]?.heroes ?? {}).length}/${releasedIds.size}`);
  }
  console.error("取得結果が少なすぎるので中止");
  process.exit(1);
}

if (flag("write")) {
  writeFileSync(OUT_PATH, JSON.stringify(doc) + "\n");
  console.error(
    `data/hero-stats.json を更新: ランクtier ${tiers.length} + 帯 ${bandKeys.length - 1} + 全体 (${Math.round(JSON.stringify(doc).length / 1024)}KB)`,
  );
} else {
  for (const k of [...bandKeys, ...tiers.sort((a, b) => Number(a) - Number(b))]) {
    console.error(`  ${k.padStart(4)}: ${out[k].matches.toLocaleString("en-US")}試合 / BAN ${out[k].bans.toLocaleString("en-US")}`);
  }
  console.error(`(dry-run) --write で保存します`);
}
