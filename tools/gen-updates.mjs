// @ts-check
/**
 * バランス調整の履歴(data/updates.json)の生成。
 *
 * 公式マイナーアップデートの前後2版のスナップショットを突き合わせ、ヒーロー・アイテムの
 * 数値がどう動いたかを1エントリにまとめて data/updates.json の先頭に追記する。
 * 数値は人手で書かず、必ずパース結果の差分から出す(CLAUDE.md ルール6)。
 *
 * 比較の粒度とパス表記は tools/diff/fields.mjs、バフ/ナーフの分類は
 * src/lib/adjustments.ts。どちらも data/diffs/ を作る tools/gen-snapshot-diff.mjs や
 * サイトの表示と共有していて、ここには独自の実装を持たない。
 *
 * 使い方(node の型ストリップ経由で src/lib/*.ts を読むため npm script から):
 *   npm run gen:updates -- --old data/snapshots/6683 --new data/snapshots/6684 \
 *     --date 2026-08-22 --title "マイナー アップデート - 2026年8月22日" \
 *     --commit c34d25e8... --write
 *
 * --old <dir>     before のスナップショット(必須)
 * --new <dir>     after のスナップショット(必須)
 * --date <ISO>    エントリの日付。公式パッチノートの投稿日を入れる(既定: 今日)
 * --commit <sha>  上流コミット(任意)
 * --title <str>   エントリ見出し(既定: 近い公式ノートの題、無ければ "<date> データ更新")
 * --write         data/updates.json の先頭に書き込む(既定: stdout に JSON を出すだけ)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  heroFieldMap,
  itemFieldMap,
  economyFieldMap,
  diffFieldMaps,
  goodOf,
  fieldNameOf,
  isUpgradePath,
} from "./diff/fields.mjs";
import { classifyChanges, combineKinds, abilityKeyOf } from "../src/lib/adjustments.ts";
import { nearestPatchNote } from "../src/lib/patchNotes.ts";
import { economyFieldLabel, economyValueText } from "../src/lib/economyLabels.ts";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

const OLD_DIR = opt("old");
const NEW_DIR = opt("new");
if (!OLD_DIR || !NEW_DIR) {
  console.error("--old <before のスナップショット> と --new <after のスナップショット> が必要です");
  process.exit(1);
}
const DATE = opt("date", new Date().toISOString().slice(0, 10));
const COMMIT = opt("commit");
const sourceNote = nearestPatchNote(DATE);
const TITLE = opt("title", sourceNote?.title ?? `${DATE} データ更新`);

const load = (dir, file) => JSON.parse(readFileSync(join(REPO_ROOT, dir, file), "utf8"));
/** economy.json は後から追加したファイルなので無い版もある。無ければ null */
const tryLoad = (dir, file) => {
  try {
    return load(dir, file);
  } catch {
    return null;
  }
};
const oldH = load(OLD_DIR, "heroes.json").heroes;
const newH = load(NEW_DIR, "heroes.json").heroes;
const oldI = load(OLD_DIR, "items.json").items;
const newI = load(NEW_DIR, "items.json").items;
const oldA = load(OLD_DIR, "abilities.json").abilities;
const newA = load(NEW_DIR, "abilities.json").abilities;
const oldEconomy = tryLoad(OLD_DIR, "economy.json");
const newEconomy = tryLoad(NEW_DIR, "economy.json");

/**
 * note(1行の要約)に使う表示名。after 側のスナップショットから引く。
 * 日本語が無い版(GameTracking由来のバックフィル)では英語に落ちる。
 * サイトの表示は常に最新版のローカライズを使うので、ここはあくまで
 * updates.json を人が読むときの手掛かり。
 */
const tokens = (() => {
  for (const file of ["localization.japanese.json", "localization.english.json"]) {
    try {
      return load(NEW_DIR, file).tokens ?? {};
    } catch {
      /* その言語が無い版もある */
    }
  }
  return {};
})();
const label = (token, fallback) => tokens[token]?.text ?? fallback;

/** 差分1行を Adjustment.changes の要素にする */
const toChange = (row) => ({
  path: row.path,
  from: row.before,
  to: row.after,
  good: goodOf(row.path, row.before, row.after),
});

const fmtN = (n) => (n === null ? "—" : Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

/** 表示フォールバック用の1行要約。詳細は changes に入っているので3件まで */
function noteFor(changes, max = 3) {
  const head = changes
    .slice(0, max)
    .map((c) => {
      /* 構成素材の在否(components.<アイテムID> = 1/null)。素材名はアイテムIDがそのままトークン */
      const comp = /^components\.(.+)$/.exec(c.path);
      if (comp) {
        const itemName = label(comp[1], comp[1]);
        return c.to === null ? `構成素材 ${itemName} を除外` : `構成素材 ${itemName} を追加`;
      }
      const name = fieldNameOf(c.path);
      const nm = name === "cost" ? "価格" : label(`${name}_label`, name);
      const tier = isUpgradePath(c.path) ? `T${/upgrades\.T(\d+)\./.exec(c.path)?.[1]}強化 ` : "";
      if (c.from === null) return `${tier}${nm} ${fmtN(c.to)} を追加`;
      if (c.to === null) return `${tier}${nm} を削除`;
      return `${tier}${nm} ${fmtN(c.from)}→${fmtN(c.to)}`;
    })
    .join(" / ");
  return head + (changes.length > max ? " ほか" : "");
}

/**
 * システム全体(economy.json)の変更1件ぶんの要約文。
 * ヒーロー/アイテムの noteFor と違い、ゲーム側のトークンを持たないので
 * 表示名は economyFieldLabel(パス全体から引く)を使う。
 */
function noteForSystem(changes, max = 3) {
  const head = changes
    .slice(0, max)
    .map((c) => {
      const nm = economyFieldLabel(c.path) ?? c.path;
      if (c.from === null) return `${nm} ${economyValueText(c.path, c.to)} を追加`;
      if (c.to === null) return `${nm} を削除`;
      return `${nm} ${economyValueText(c.path, c.from)}→${economyValueText(c.path, c.to)}`;
    })
    .join(" / ");
  return head + (changes.length > max ? " ほか" : "");
}

/**
 * ヒーロー1体の分類。スキル(と基礎ステータス)ごとに分けて判定してから畳む。
 * 全項目をまとめて数えると、AP強化の小さな増減が基礎値の変化を打ち消してしまう。
 */
function classifyHero(changes) {
  const buckets = new Map();
  for (const c of changes) {
    const key = abilityKeyOf(c.path) ?? "__stat__";
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  }
  return combineKinds([...buckets.values()].map(classifyChanges));
}

const adjustments = [];
const skipped = [];

// --- ヒーロー ---
for (const id of Object.keys(newH)) {
  const nh = newH[id];
  const oh = oldH[id];
  if (!oh || !nh.released) continue;
  const rows = diffFieldMaps(heroFieldMap(oh, oldA, skipped), heroFieldMap(nh, newA, skipped));
  if (rows.length === 0) continue;
  const changes = rows.map(toChange);
  adjustments.push({
    kind: classifyHero(changes),
    target: "hero",
    key: nh.key,
    note: noteFor(changes),
    changes,
  });
}

// --- アイテム ---
for (const id of Object.keys(newI)) {
  const ni = newI[id];
  const oi = oldI[id];
  if (!oi || !ni.inShop) continue;
  const rows = diffFieldMaps(itemFieldMap(oi, skipped), itemFieldMap(ni, skipped));
  if (rows.length === 0) continue;
  const changes = rows.map(toChange);
  adjustments.push({
    kind: classifyChanges(changes),
    target: "item",
    key: ni.id,
    note: noteFor(changes),
    changes,
  });
}

// --- システム全体(economy.json。ヒーロー・アイテムどちらにも属さない全体調整) ---
if (oldEconomy && newEconomy) {
  const rows = diffFieldMaps(economyFieldMap(oldEconomy), economyFieldMap(newEconomy));
  if (rows.length > 0) {
    /*
     * good は常に null にする。どちらのチームにも同じルールで効く変更で、
     * 「有利/不利」の色分けは意味を持たない(誰か1人が得をする調整ではない)。
     * classifyChanges は good===null しか無ければ "neutral" に畳まれる。
     */
    const changes = rows.map((row) => ({ path: row.path, from: row.before, to: row.after, good: null }));
    adjustments.push({
      kind: classifyChanges(changes),
      target: "system",
      key: "economy",
      note: noteForSystem(changes),
      changes,
    });
  }
} else {
  console.error("※ economy.json が無い版を含むため、システム全体の調整は比較していません");
}

adjustments.sort((a, b) => a.target.localeCompare(b.target) || a.key.localeCompare(b.key));

const count = { buff: 0, nerf: 0, mixed: 0, neutral: 0, rework: 0 };
for (const a of adjustments) count[a.kind]++;
const changeCount = adjustments.reduce((n, a) => n + a.changes.length, 0);
const summary =
  `ヒーロー・アイテムの数値差分から自動生成 ` +
  `(バフ ${count.buff} / ナーフ ${count.nerf} / 混在 ${count.mixed}、変更項目 ${changeCount})`;

const entry = {
  date: DATE,
  upstreamCommit: COMMIT,
  title: TITLE,
  fromVersion: basename(OLD_DIR),
  toVersion: basename(NEW_DIR),
  changes: [summary],
  adjustments,
  ...(sourceNote ? { sourceTitle: sourceNote.title, sourceUrl: sourceNote.url } : {}),
};
if (sourceNote) {
  console.error(`出典パッチノートを自動で紐付け: ${sourceNote.date} ${sourceNote.title}`);
} else {
  console.error(`※ ${DATE} に近い公式パッチノートが見つからないので出典は付けません`);
}

if (flag("write")) {
  /* 書き込み先は常に data/updates.json。--new に渡したスナップショットではない */
  const path = join(REPO_ROOT, "data", "updates.json");
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const at = doc.entries.findIndex((e) => e.date === DATE);
  if (at >= 0) {
    doc.entries[at] = entry;
    console.error(`updates.json の ${DATE} を置き換え: ${adjustments.length} 件の調整`);
  } else {
    doc.entries.unshift(entry);
    console.error(`updates.json に追記: ${adjustments.length} 件の調整`);
  }
  doc.entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
} else {
  console.log(JSON.stringify(entry, null, 2));
  console.error(`(dry-run) ${adjustments.length} 件の調整 / ${changeCount} 件の変更項目。--write で data/updates.json に追記します`);
}
