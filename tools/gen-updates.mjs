// @ts-check
/**
 * 更新履歴(調整履歴)の生成。
 *
 * before / after の parse 済み data/*.json を突き合わせ、ヒーロー・アイテムの
 * バランス関連の数値がどう変わったかを 1 エントリにまとめて data/updates.json へ
 * 追記する。数値は人手で書かず、必ず parse 結果の差分から出す(CLAUDE.md ルール7)。
 *
 * 使い方:
 *   1. いまの data/ を退避:   cp -r data /tmp/data-old
 *   2. 上流を取り込んで再 parse: npm run parse -- --gt <GameTracking-Deadlock>
 *   3. 差分から履歴を生成:
 *        node tools/gen-updates.mjs --old /tmp/data-old \
 *          --date 2026-09-20 --commit <sha> --title "9/20 パッチ" --write
 *
 * --old <dir>     before の data ディレクトリ(必須)
 * --new <dir>     after の data ディレクトリ(既定: ./data)
 * --date <ISO>    エントリの日付(既定: 今日)
 * --commit <sha>  上流コミット(任意)
 * --title <str>   エントリ見出し(既定: "<date> データ更新")
 * --write         data/updates.json の先頭に書き込む(既定: stdout に JSON 出力のみ)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const OLD_DIR = opt("old");
const NEW_DIR = opt("new", "data");
if (!OLD_DIR) {
  console.error("--old <before の data ディレクトリ> が必要です");
  process.exit(1);
}
const DATE = opt("date", new Date().toISOString().slice(0, 10));
const COMMIT = opt("commit");
const TITLE = opt("title", `${DATE} データ更新`);

const load = (dir, file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
const oldH = load(OLD_DIR, "heroes.json").heroes;
const newH = load(NEW_DIR, "heroes.json").heroes;
const oldI = load(OLD_DIR, "items.json").items;
const newI = load(NEW_DIR, "items.json").items;
const oldA = load(OLD_DIR, "abilities.json").abilities;
const newA = load(NEW_DIR, "abilities.json").abilities;
/** ラベル用。無くても動く */
let jp = {};
try {
  jp = load(NEW_DIR, "localization.japanese.json").tokens ?? {};
} catch {
  /* localization は任意 */
}
const label = (token, fallback) => jp[token]?.text ?? fallback;

/** 小さいほど良いステータス(名前の一部で判定) */
const LOWER_IS_BETTER = [
  "cooldown",
  "reloadtime",
  "reloadduration",
  "chargetime",
  "castdelay",
  "castpoint",
  "spread",
  "recoil",
  "falloffdamage",
  "staminacost",
  "spiritcost",
  "chargedelay",
];
const dirOf = (name) =>
  LOWER_IS_BETTER.some((s) => name.toLowerCase().includes(s)) ? -1 : 1;

const EPS = 1e-6;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * 2 つの「フィールド名→数値」マップを比べ、増減した項目を返す。
 * good = ゲーム的に有利な向きに動いた数、bad = 不利な向きに動いた数。
 */
function diffNums(oldMap, newMap, opts = {}) {
  const prefix = opts.prefix ?? "";
  const keys = new Set([...Object.keys(oldMap ?? {}), ...Object.keys(newMap ?? {})]);
  const rows = [];
  for (const k of keys) {
    const a = oldMap?.[k];
    const b = newMap?.[k];
    if (!isNum(a) || !isNum(b)) continue;
    if (Math.abs(a - b) < EPS) continue;
    const dir = dirOf(k) * Math.sign(b - a); // +1 = 有利方向, -1 = 不利方向
    rows.push({ field: prefix + k, from: a, to: b, good: dir > 0 });
  }
  return rows;
}

/** ability.properties の {name: value} を取り出す */
const propValues = (ab) =>
  Object.fromEntries(
    Object.entries(ab?.properties ?? {}).map(([n, p]) => [n, p?.value]),
  );
/** upgrades(段階強化)の {property: 合計bonus} */
const upgradeBonuses = (ab) => {
  const acc = {};
  for (const tier of ab?.upgrades ?? []) {
    for (const u of tier ?? []) {
      const n = Number.parseFloat(String(u.bonus));
      if (Number.isFinite(n)) acc[`↑${u.property}`] = (acc[`↑${u.property}`] ?? 0) + n;
    }
  }
  return acc;
};

/** 署名アビリティのキー一覧 */
const sigKeys = (hero) =>
  (hero.abilities ?? [])
    .filter((a) => String(a.slot).startsWith("Signature"))
    .map((a) => a.abilityKey);

function classify(rows) {
  const good = rows.filter((r) => r.good).length;
  const bad = rows.length - good;
  if (rows.length >= 6 || (good > 0 && bad > 0 && Math.min(good, bad) >= 2)) return "rework";
  if (good >= bad) return "buff";
  return "nerf";
}

const fmtN = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));
function noteFor(rows, max = 3) {
  return rows
    .slice(0, max)
    .map((r) => {
      const raw = r.field.replace(/^↑/, "").replace(/^[^.]+\./, "");
      const nm = label(`${raw}_label`, raw);
      return `${r.field.startsWith("↑") ? "強化 " : ""}${nm} ${fmtN(r.from)}→${fmtN(r.to)}`;
    })
    .join(" / ") + (rows.length > max ? " ほか" : "");
}

const adjustments = [];

// --- ヒーロー ---
for (const key of Object.keys(newH)) {
  const nh = newH[key];
  const oh = oldH[key];
  if (!oh || !nh.released) continue;
  let rows = [
    ...diffNums(oh.startingStats, nh.startingStats, { prefix: "stat." }),
    ...diffNums(oh.levelUpBonuses, nh.levelUpBonuses, { prefix: "growth." }),
  ];
  for (const ak of sigKeys(nh)) {
    const oa = oldA[ak];
    const na = newA[ak];
    if (!oa || !na) continue;
    const anm = label(ak, ak);
    rows = rows.concat(
      diffNums(propValues(oa), propValues(na), { prefix: `${anm}.` }),
      diffNums(upgradeBonuses(oa), upgradeBonuses(na), { prefix: `${anm}.` }),
    );
  }
  if (rows.length === 0) continue;
  adjustments.push({
    kind: classify(rows),
    target: "hero",
    key: nh.key,
    note: noteFor(rows),
  });
}

// --- アイテム ---
for (const id of Object.keys(newI)) {
  const ni = newI[id];
  const oi = oldI[id];
  if (!oi || !ni.inShop) continue;
  const rows = [
    ...diffNums({ cost: oi.cost }, { cost: ni.cost }),
    ...diffNums(propValues(oi), propValues(ni)),
    ...diffNums(upgradeBonuses(oi), upgradeBonuses(ni)),
  ];
  // cost は「上がると不利」なので向きを直す(dirOf は cost を良化方向に見てしまう)
  for (const r of rows) if (r.field === "cost") r.good = r.to < r.from;
  if (rows.length === 0) continue;
  adjustments.push({
    kind: classify(rows),
    target: "item",
    key: ni.id,
    note: noteFor(rows),
  });
}

adjustments.sort(
  (a, b) => a.target.localeCompare(b.target) || a.key.localeCompare(b.key),
);

const count = { buff: 0, nerf: 0, rework: 0 };
for (const a of adjustments) count[a.kind]++;
const changes = [
  `ヒーロー・アイテムの数値差分から自動生成 (強化 ${count.buff} / 弱体 ${count.nerf} / リワーク ${count.rework})`,
];

const entry = {
  date: DATE,
  upstreamCommit: COMMIT,
  title: TITLE,
  changes,
  adjustments,
};

if (flag("write")) {
  const path = join(NEW_DIR, "updates.json");
  const doc = JSON.parse(readFileSync(path, "utf8"));
  doc.entries.unshift(entry);
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  console.error(`updates.json に追記: ${adjustments.length} 件の調整`);
} else {
  console.log(JSON.stringify(entry, null, 2));
  console.error(
    `(dry-run) ${adjustments.length} 件の調整。--write で updates.json に追記します`,
  );
}
