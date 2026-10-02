// @ts-check
/**
 * 統計4ファイルをまとめて取得する(デプロイのたびに .github/workflows/deploy.yml が実行する。
 * 手元では `npm run fetch:stats`)。
 *
 *   data/item-stats.json  … tools/fetch-item-stats.mjs  (アイテムの採用率・勝率)
 *   data/hero-stats.json  … tools/fetch-hero-stats.mjs  (ヒーローのピック率・勝率・BAN率)
 *   data/hero-builds.json … tools/fetch-hero-builds.mjs (人気のビルド)
 *   data/item-sales.json  … tools/fetch-item-sales.mjs  (アイテムの売却・強化)
 *
 * ■ 取得の間隔(item-sales だけ)
 * item-sales は SQL エンドポイント(上限 1時間20回・1分2回)を1回使う。デプロイのたびには投げず、
 *   - 前回分の fetchedAt から6時間たっていなければ、取得せずに前回分を使う(結果は「前回分」)
 *   - 取得に失敗してから60分は取り直さない(失敗の時刻は --fallback のフォルダの attempts.json。次回のキャッシュに入る)
 *
 * 統計は「今の値」だけあればよいので Git には入れない(.gitignore)。過去の値は残さない。
 *
 * ■ 失敗したとき
 * 各スクリプトは取得に失敗したり安全装置で止まったりすると、ファイルを書かずに非ゼロで終わる。
 * そのときはファイルごとに次の順で埋める:
 *   1. --fallback <dir> にある前回成功分(CI では actions/cache から復元したもの)
 *   2. それも無ければ「統計なし」(ファイルを置かない。サイトは統計の欄を出さずにビルドできる)
 * 手元で --fallback を付けずに実行したときは、失敗したファイルは手元にある前のファイルのまま残す。
 * どの場合も、このスクリプト自体は 0 で終わる(デプロイを止めない)。
 *
 * ■ CI 向けの出力
 *   - 各ファイルの結果(新規取得 / キャッシュ / 手元のまま / なし)と所要時間をログに出す
 *   - GITHUB_STEP_SUMMARY があれば、同じ表を Actions の要約に書く
 *   - GITHUB_OUTPUT があれば fresh=true/false(1つでも新規取得できたか)を書く。キャッシュの保存の条件に使う
 *   - --fallback を付けたときは、最後に今の3ファイルを --fallback のフォルダへ写す(次回のキャッシュの中身)
 *
 * ■ 失敗の経路を試すとき
 * 環境変数 STATS_SIMULATE_FAIL にファイル名(item-stats,hero-stats,hero-builds,item-sales のカンマ区切り。all で全部)を
 * 入れると、そのスクリプトは実行せずに失敗したものとして扱う。API を叩かずにキャッシュ・統計なしの経路を確かめる用。
 *
 * 使い方:
 *   node tools/fetch-stats.mjs                       (手元。失敗したファイルは手元の前のファイルのまま)
 *   node tools/fetch-stats.mjs --fallback .stats-cache (CI。失敗したらキャッシュ → なし)
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const fallbackDir = opt("fallback") ? join(REPO_ROOT, /** @type {string} */ (opt("fallback"))) : null;
const simulate = new Set(
  (process.env.STATS_SIMULATE_FAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/**
 * minIntervalHours … 前回の取得(ファイルの fetchedAt)からこの時間たっていなければ取得せず、前回分を使う。
 * retryAfterFailureMinutes … 取得に失敗してからこの時間は取り直さない(失敗の時刻は --fallback のフォルダに残す)。
 * item-sales は deadlock-api.com の SQL エンドポイントを使い、上限が 1時間20回・1分2回と厳しいので両方を付ける。
 */
const TARGETS = [
  { name: "item-stats", script: "tools/fetch-item-stats.mjs" },
  { name: "hero-stats", script: "tools/fetch-hero-stats.mjs" },
  { name: "hero-builds", script: "tools/fetch-hero-builds.mjs" },
  { name: "item-sales", script: "tools/fetch-item-sales.mjs", minIntervalHours: 6, retryAfterFailureMinutes: 60 },
];

/** ファイルの fetchedAt(ミリ秒)。読めなければ null */
function fetchedAtOf(/** @type {string} */ path) {
  try {
    const t = Date.parse(JSON.parse(readFileSync(path, "utf8")).fetchedAt);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}
/**
 * 失敗の記録。{ <name>: 失敗した時刻(ISO) }。CI では --fallback のフォルダ(= 次回のキャッシュ)に残す。
 * 手元(--fallback なし)では残さない(手で実行するときは、いつでも取り直せるように)
 */
const attemptsPath = fallbackDir ? join(fallbackDir, "attempts.json") : null;
/** @type {Record<string, string>} */
let attempts = {};
try {
  if (attemptsPath) attempts = JSON.parse(readFileSync(attemptsPath, "utf8"));
} catch {
  attempts = {};
}

/** @type {{ name: string, status: "fresh" | "reuse" | "cache" | "kept" | "none", seconds: number, note: string }[]} */
const results = [];
for (const t of TARGETS) {
  const file = join(REPO_ROOT, "data", `${t.name}.json`);
  const started = Date.now();
  const before = existsSync(file) ? statSync(file).mtimeMs : 0;
  let ok = false;
  let note = "";
  // 前回分(CI はキャッシュ、手元は data/ のファイル)
  const prevPath = fallbackDir ? join(fallbackDir, `${t.name}.json`) : file;
  const prevAt = existsSync(prevPath) ? fetchedAtOf(prevPath) : null;
  const failedAt = attempts[t.name] ? Date.parse(attempts[t.name]) : NaN;
  if (simulate.has(t.name) || simulate.has("all")) {
    note = "STATS_SIMULATE_FAIL で失敗扱い";
    console.error(`\n==== ${t.name}: 実行せずに失敗扱い(STATS_SIMULATE_FAIL)`);
  } else if (t.minIntervalHours && prevAt !== null && Date.now() - prevAt < t.minIntervalHours * 3600_000) {
    // 前回の取得から間がない: 取得せずに前回分を使う
    if (prevPath !== file) copyFileSync(prevPath, file);
    const h = Math.round(((Date.now() - prevAt) / 3600_000) * 10) / 10;
    console.error(`\n==== ${t.name}: 前回の取得から ${h}時間(${t.minIntervalHours}時間未満)なので取得せず前回分を使う`);
    results.push({ name: t.name, status: "reuse", seconds: 0, note: `前回の取得から${h}時間` });
    continue;
  } else if (t.retryAfterFailureMinutes && Date.now() - failedAt < t.retryAfterFailureMinutes * 60_000) {
    // 失敗した直後: 取り直すと上限を食うだけなので、今回は失敗扱いで前回分 → なし
    const m = Math.round((Date.now() - failedAt) / 60_000);
    note = `前回の失敗から${m}分(${t.retryAfterFailureMinutes}分未満)なので取得せず`;
    console.error(`\n==== ${t.name}: ${note}`);
  } else {
    console.error(`\n==== ${t.name}: node ${t.script} --write`);
    const r = spawnSync(process.execPath, [t.script, "--write"], { cwd: REPO_ROOT, stdio: "inherit" });
    // 成功 = 終了コード0 かつ、この実行でファイルが書き直されたこと
    ok = r.status === 0 && existsSync(file) && statSync(file).mtimeMs > before;
    if (!ok) note = r.status === 0 ? "ファイルが書かれなかった" : `終了コード ${r.status ?? r.signal}`;
    // 失敗の時刻を残す(retryAfterFailureMinutes の判定用)。成功したら消す
    if (t.retryAfterFailureMinutes) {
      if (ok) delete attempts[t.name];
      else attempts[t.name] = new Date().toISOString();
    }
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;

  if (ok) {
    results.push({ name: t.name, status: "fresh", seconds, note });
    continue;
  }
  const cached = fallbackDir ? join(fallbackDir, `${t.name}.json`) : null;
  if (cached && existsSync(cached)) {
    copyFileSync(cached, file);
    results.push({ name: t.name, status: "cache", seconds, note });
  } else if (!fallbackDir && existsSync(file)) {
    results.push({ name: t.name, status: "kept", seconds, note }); // 手元の前のファイルのまま
  } else {
    if (existsSync(file)) rmSync(file); // 中途半端なファイルを残さない
    results.push({ name: t.name, status: "none", seconds, note });
  }
}

const LABEL = { fresh: "新規取得", reuse: "前回分(間隔を空けるため取得せず)", cache: "キャッシュ(前回成功分)", kept: "手元の前のファイルのまま", none: "なし(統計なしでビルド)" };
const total = Math.round(results.reduce((s, r) => s + r.seconds, 0) * 10) / 10;
console.error("\n==== 統計の取得結果");
for (const r of results) console.error(`  ${r.name.padEnd(12)} ${LABEL[r.status]}  ${r.seconds}秒${r.note ? `  (${r.note})` : ""}`);
console.error(`  合計 ${total}秒`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results.map((r) => `| ${r.name} | ${LABEL[r.status]} | ${r.seconds}s | ${r.note} |`).join("\n");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### 統計の取得\n\n| ファイル | 結果 | 時間 | 備考 |\n| --- | --- | --- | --- |\n${rows}\n\n合計 ${total}s\n`,
  );
}
const fresh = results.some((r) => r.status === "fresh");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `fresh=${fresh}\n`);

// 次回のキャッシュの中身: 今そろっているファイル(新規取得分 + 前回のキャッシュから使った分)
if (fallbackDir) {
  mkdirSync(fallbackDir, { recursive: true });
  for (const t of TARGETS) {
    const file = join(REPO_ROOT, "data", `${t.name}.json`);
    if (existsSync(file)) copyFileSync(file, join(fallbackDir, `${t.name}.json`));
  }
  if (attemptsPath) writeFileSync(attemptsPath, JSON.stringify(attempts) + "\n");
}
