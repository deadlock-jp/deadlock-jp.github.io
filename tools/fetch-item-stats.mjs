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
 * api.deadlock-api.com/v1/assets の class_name ↔ id 表を対応付けに使う
 * (旧 assets.deadlock-api.com は2026-09頃に廃止され、こちらに統合された)。
 * ショップ掲載アイテム156件は全件この表で解決できることを確認済み。
 *
 * ■ 集計期間
 * 「最新のバランス変更があったアップデート以降」(tools/stats-window.mjs が updates.json と
 * patch-notes.json の投稿時刻から毎回決める)。API には min_unix_timestamp で渡す
 * (hero-stats / item-stats とも効くことを 2026-09-30 に確認: インファーナスで 30日 1049万 → 27万)。
 * パッチ直後は試合数が少ないが、30日に戻したり隠したりはしない(サンプル少の印で区別する)。
 *
 * ■ ランク帯
 * 全ランク(all)に加えて、src/lib/rankBands.json の low / mid / high を
 * min_average_badge / max_average_badge で絞って取る。採用率の分母(そのヒーローの試合数)も、
 * 同じ条件で絞った hero-stats から取る(全ランクの試合数で割らない)。
 * 出力は bands: { all, low, mid, high }。all の中身は帯を分ける前の heroes と同じ。
 *
 * ■ リクエスト
 * item-stats は bucket=hero にすると、hero_ids を付けなくても全ヒーロー分が1回で返る
 * (bucket の値が hero_id)。ヒーローごとに取ったものと値が一致することを 2026-10-01 に確認済み。
 * 1帯あたり hero-stats と item-stats の2回 + 対応表1回で、4帯で計9回。
 *
 * 使い方:
 *   node tools/fetch-item-stats.mjs             (dry-run。件数だけ表示)
 *   node tools/fetch-item-stats.mjs --write     (data/item-stats.json を書き出す)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statsWindow } from "./stats-window.mjs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_PATH = join(REPO_ROOT, "data", "item-stats.json");

const API = "https://api.deadlock-api.com/v1";
const ASSETS = "https://api.deadlock-api.com/v1/assets";
/** これ未満の試合数は「サンプル少」として画面側で区別する(除外はしない) */
const LOW_SAMPLE = 20;
/** レート制限は 200req/min。9リクエストしか送らないが、連続で叩かないよう間を空ける */
const DELAY_MS = 400;
/** ランク帯の定義(画面側の src/lib/rankBands.ts と共有) */
const RANK_BANDS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "rankBands.json"), "utf8")).bands;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 失敗したら少し待って2回まで取り直す。それでも失敗すれば例外で止まる
 * (1件でも取れなかったヒーローがあるまま書き込まないため。書き込み前に中止される)
 */
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
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
const SINCE = `min_unix_timestamp=${WINDOW.start}`;
console.error(
  `集計期間: ${WINDOW.startIso} 以降(${WINDOW.patch.date} ${WINDOW.patch.titleEn} / 起点の取り方: ${WINDOW.source})`,
);

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

/**
 * 1つのランク帯の統計を取る。filter は API に付け足す絞り込み(全ランクなら空)。
 * 分母(ヒーローの試合数)と分子(アイテムを買った試合数)は同じ条件で絞る。
 */
async function fetchBand(key, filter) {
  console.error(`[${key}] ヒーローの試合数とアイテムの統計を取得中...`);
  const heroStats = await getJson(`${API}/analytics/hero-stats?${SINCE}${filter}`);
  await sleep(DELAY_MS);
  /** @type {Map<number, number>} */
  const matchesByHero = new Map(heroStats.map((h) => [h.hero_id, h.matches]));
  // bucket=hero にすると、返ってくる bucket の値が hero_id になる(hero_ids 無しで全ヒーロー分)
  const rows = await getJson(`${API}/analytics/item-stats?bucket=hero&min_matches=1&${SINCE}${filter}`);
  await sleep(DELAY_MS);
  /** @type {Map<number, any[]>} */
  const rowsByHero = new Map();
  for (const r of rows) {
    if (!rowsByHero.has(r.bucket)) rowsByHero.set(r.bucket, []);
    rowsByHero.get(r.bucket).push(r);
  }

  const out = {};
  let totalRows = 0;
  for (const hero of heroes) {
    const heroMatches = matchesByHero.get(hero.id);
    if (!heroMatches) {
      console.error(`  ${hero.key} (id=${hero.id}): APIに試合数が無いので飛ばす`);
      continue;
    }
    const itemsOut = {};
    for (const r of rowsByHero.get(hero.id) ?? []) {
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
  }
  /** 集計期間の全体の試合数(各ヒーローの試合数の合計 ÷ 1試合の人数12) */
  const matches = Math.round([...matchesByHero.values()].reduce((s, n) => s + n, 0) / 12);
  const okHeroes = Object.values(out).filter((h) => Object.keys(h.items).length > 0).length;
  console.error(
    `  ${matches.toLocaleString("en-US")}試合 / アイテムの統計があるヒーロー ${okHeroes}/${heroes.length} / ${totalRows} 行`,
  );
  return { band: { matches, heroes: out }, okHeroes, totalRows };
}

// --- 3. 帯ごとの統計(全ランク + src/lib/rankBands.json の帯) ---
const targets = [
  { key: "all", filter: "" },
  ...RANK_BANDS.map((b) => ({
    key: b.key,
    filter: `&min_average_badge=${b.minBadge}&max_average_badge=${b.maxBadge}`,
  })),
];
const started = Date.now();
const results = {};
for (const tg of targets) results[tg.key] = await fetchBand(tg.key, tg.filter);
console.error(`  取得にかかった時間: ${((Date.now() - started) / 1000).toFixed(1)}秒`);

const doc = {
  schemaVersion: 2,
  source: `${API}/analytics/item-stats`,
  idSource: `${ASSETS}/items`,
  fetchedAt: new Date().toISOString(),
  /** 集計期間。最新のバランス変更があったアップデート以降(tools/stats-window.mjs) */
  window: "sincePatch",
  windowStart: WINDOW.startIso,
  /** 起点の取り方。postedAt = お知らせの投稿時刻 / dateMidnightUtc = 投稿時刻が無く日付の 00:00 UTC */
  windowSource: WINDOW.source,
  /** 起点のアップデート。titleEn は英語の原題、titleJa は日本語の題(英語と別のときだけ) */
  windowPatch: WINDOW.patch,
  /** 画面側で「サンプル少」と出す境目 */
  lowSampleMatches: LOW_SAMPLE,
  /** items の値は [人気率, 勝率, サンプル試合数]。率は 0.1% 刻みの整数(503 = 50.3%) */
  format: "[pickPermille, winPermille, matches]",
  /**
   * ランク帯ごとの統計。キーは all(全ランク)と src/lib/rankBands.json の帯。
   * matches はその帯の全体の試合数(各ヒーローの試合数の合計 ÷ 12)、heroes はヒーローID → { matches, items }
   */
  bands: Object.fromEntries(targets.map((tg) => [tg.key, results[tg.key].band])),
};

/*
 * 無人実行(GitHub Actions)で上書きするので、APIが一部落ちていたときに
 * スカスカのデータで既存ファイルを潰さないようにする。
 *   - リクエストの失敗は getJson が取り直したうえで例外にするので、ここまで来れば全リクエストは成功している
 *   - そのうえで帯ごとに「アイテムの行が1件以上取れたヒーローの割合」を見て、
 *     1帯でも9割未満なら中止する(API が空の配列を返すような半端な落ち方を見分けるため)
 * 以前は合計1000行未満でも中止していたが、パッチ直後(起点から数時間)は試合が少なく
 * 正常でも行数が伸びないので、行数の絶対値では判定しない。
 */
const short = targets.filter((tg) => results[tg.key].okHeroes < heroes.length * 0.9);
if (short.length > 0) {
  for (const tg of short) {
    console.error(
      `[${tg.key}] アイテムの統計が取れたヒーローが少なすぎる: ${results[tg.key].okHeroes}/${heroes.length} ヒーロー, ${results[tg.key].totalRows} 行`,
    );
  }
  console.error("書き込みを中止します");
  process.exit(1);
}

const totalRows = targets.reduce((s, tg) => s + results[tg.key].totalRows, 0);
const kb = Math.round(JSON.stringify(doc).length / 1024);
if (flag("write")) {
  writeFileSync(OUT_PATH, JSON.stringify(doc) + "\n");
  console.error(`data/item-stats.json を更新: ${heroes.length} ヒーロー × ${targets.length} 帯 / ${totalRows} 行 (${kb}KB)`);
} else {
  // 帯ごとの試合数を、ヒーローを何人か例に出して確かめられるようにする
  const sample = heroes.slice(0, 3);
  for (const tg of targets) {
    const b = results[tg.key].band;
    const per = sample.map((h) => `${h.key} ${(b.heroes[h.id]?.matches ?? 0).toLocaleString("en-US")}`).join(" / ");
    console.error(`  ${tg.key.padEnd(4)} ${b.matches.toLocaleString("en-US")}試合  (${per})`);
  }
  console.error(`(dry-run) ${targets.length} 帯 / ${totalRows} 行 (${kb}KB)。--write で保存します`);
}
