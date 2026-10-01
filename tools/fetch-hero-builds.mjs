// @ts-check
/**
 * ゲーム内で公開されているヒーロービルドのうち、最近の試合でよく使われているものを
 * deadlock-api.com から取得して data/hero-builds.json に保存する。ビルドページの「人気のビルド」で使う。
 *
 * ■ 取り込むもの・取り込まないもの
 * 取り込むのは数値と ID だけ(ビルドID・版・最終更新・使用数・アイテムの並び)。
 * ビルド名・説明・カテゴリー名・アイテムごとの注釈はプレイヤーが書いた文章なので一切保存しない
 * (CLAUDE.md の「第三者の文章は転載しない」)。カテゴリーは名前を捨てて「何番目のグループか」だけ残す。
 *
 * ■ 「人気」の決め方
 * お気に入り数ではなく、実際の試合で使われた数(analytics/hero-build-stats)で選ぶ。
 *   - 週間お気に入り数は 2026-10 時点で値が入っていない(null)
 *   - 累計お気に入り数は、何年も更新されていない古いビルドが上位に残る
 * hero-build-stats はデモ解析された試合だけが対象で、数えるのは「試合開始時に選んでいたビルド」。
 * パッチ直後は試合が少なすぎるので、集計期間は直近 WINDOW_DAYS 日にする(統計の「パッチ以降」とは別)。
 *
 * ■ ビルドの中身
 * /v1/builds?build_id=…&only_latest=true で最新版を引く(ゲーム内のビルド画面と同じ、ゲームコーディネーター由来)。
 * アイテムの数値IDは fetch-item-stats.mjs と同じ /v1/assets/items の class_name で、こちらの実IDに直す。
 * ショップに無いもの(販売終了したアイテムなど)は落とす。
 *
 * 使い方:
 *   node tools/fetch-hero-builds.mjs             (dry-run)
 *   node tools/fetch-hero-builds.mjs --write     (data/hero-builds.json を書き出す)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_PATH = join(REPO_ROOT, "data", "hero-builds.json");
const API = "https://api.deadlock-api.com/v1";

/** 集計期間(日)。直近この日数の試合での使用数で並べる */
const WINDOW_DAYS = 14;
/** 1ヒーローあたりに載せるビルドの数 */
const PER_HERO = 8;
/** これ未満の試合数のビルドは載せない */
const MIN_MATCHES = 10;
/** 分析系はレート制限 200req/min(全エンドポイント共通)。ビルド検索は 100req/s */
const ANALYTICS_DELAY_MS = 400;
const BUILDS_DELAY_MS = 50;

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

const end = Math.floor(Date.now() / 1000);
const start = end - WINDOW_DAYS * 86400;

// --- こちらのデータ側のヒーロー・ショップのアイテム ---
const latest = JSON.parse(readFileSync(join(REPO_ROOT, "data", "latest.json"), "utf8"));
const snapDir = join(REPO_ROOT, "data", "snapshots", latest.version);
const itemsFile = JSON.parse(readFileSync(join(snapDir, "items.json"), "utf8"));
const heroesFile = JSON.parse(readFileSync(join(snapDir, "heroes.json"), "utf8"));
const shopItemIds = new Set(
  Object.values(itemsFile.items)
    .filter((i) => i.inShop)
    .map((i) => i.id),
);
const heroes = Object.values(heroesFile.heroes)
  .filter((h) => h.released)
  .map((h) => ({ id: h.id, key: h.key }))
  .sort((a, b) => a.id - b.id);

// --- 数値ID ↔ 実ID の対応表(fetch-item-stats.mjs と同じ) ---
const assets = await getJson(`${API}/assets/items?type=upgrade`);
/** @type {Map<number, string>} */
const idByNumeric = new Map();
for (const a of assets) if (shopItemIds.has(a.class_name)) idByNumeric.set(a.id, a.class_name);

console.error(`集計期間: 直近${WINDOW_DAYS}日(${new Date(start * 1000).toISOString()} 〜)`);
const out = {};
let droppedSlots = 0;
let keptSlots = 0;
let requests = 1;
for (const hero of heroes) {
  const stats = await getJson(
    `${API}/analytics/hero-build-stats/${hero.id}?min_unix_timestamp=${start}&max_unix_timestamp=${end}&min_matches=${MIN_MATCHES}`,
  );
  requests++;
  await sleep(ANALYTICS_DELAY_MS);
  const top = [...stats].sort((a, b) => b.matches - a.matches).slice(0, PER_HERO);
  // ビルド検索は 100req/s まで使えるので、1ヒーロー分(最大 PER_HERO 件)はまとめて並行に引く
  const found = await Promise.all(
    top.map((s) => getJson(`${API}/builds?build_id=${s.hero_build_id}&only_latest=true&limit=1`)),
  );
  requests += top.length;
  await sleep(BUILDS_DELAY_MS);
  const builds = [];
  for (const [i, s] of top.entries()) {
    const b = found[i][0]?.hero_build;
    if (!b || b.hero_id !== hero.id) continue;
    // カテゴリーは名前を捨て、並びと「任意(optional)」の印だけ残す
    const groups = [];
    for (const c of b.details?.mod_categories ?? []) {
      const items = [];
      for (const m of c.mods ?? []) {
        const id = idByNumeric.get(m.ability_id);
        if (id) {
          items.push(id);
          keptSlots++;
        } else {
          droppedSlots++;
        }
      }
      if (items.length > 0) groups.push({ optional: c.optional === true, items });
    }
    if (groups.length === 0) continue;
    builds.push({
      id: b.hero_build_id,
      version: b.version,
      updated: b.last_updated_timestamp ?? null,
      matches: s.matches,
      players: s.players,
      groups,
    });
  }
  if (builds.length > 0) out[hero.id] = builds;
  console.error(`  ${hero.key} (id=${hero.id}): ${builds.length} 件 ${builds.map((b) => `#${b.id}:${b.matches}`).join(" ")}`);
}

const doc = {
  schemaVersion: 1,
  source: `${API}/analytics/hero-build-stats + ${API}/builds`,
  fetchedAt: new Date().toISOString(),
  /** 使用数を数えた期間 */
  windowDays: WINDOW_DAYS,
  windowStart: new Date(start * 1000).toISOString(),
  windowEnd: new Date(end * 1000).toISOString(),
  minMatches: MIN_MATCHES,
  /**
   * ヒーローID → 使用数の多い順のビルド。
   * matches / players は期間中にそのビルドで遊ばれた試合数・人数(デモ解析された試合のみ)。
   * groups はビルドのカテゴリー(名前は持たない)。items はショップのアイテムの実ID
   */
  heroes: out,
};

/*
 * 無人実行(GitHub Actions)で上書きするので、半端に落ちたときに既存ファイルを潰さない。
 * リクエストの失敗は getJson が例外にする。そのうえで、ビルドが1件以上あるヒーローが
 * 実装済みの半分未満なら中止する(新ヒーローや使用者の少ないヒーローは、そもそも10試合に届かないことがある)。
 */
const covered = Object.keys(out).length;
console.error(`ビルドのあるヒーロー ${covered}/${heroes.length} / アイテム枠 ${keptSlots}(ショップに無く落としたもの ${droppedSlots}) / リクエスト ${requests} 回`);
if (covered < heroes.length * 0.5) {
  console.error("ビルドの取れたヒーローが少なすぎるので書き込みを中止");
  process.exit(1);
}
const kb = Math.round(JSON.stringify(doc).length / 1024);
if (flag("write")) {
  writeFileSync(OUT_PATH, JSON.stringify(doc) + "\n");
  console.error(`data/hero-builds.json を更新 (${kb}KB)`);
} else {
  console.error(`(dry-run) ${kb}KB。--write で保存します`);
}
