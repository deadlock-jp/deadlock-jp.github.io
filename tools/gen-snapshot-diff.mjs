// @ts-check
/**
 * data/snapshots/<from> と data/snapshots/<to> を比べ、data/diffs/<from>..<to>.json を作る。
 *
 * スナップショットが唯一の真実の源で、差分は常にそこから再生成できる生成物
 * (architecture.html「データレイアウト」)。data/diffs/ を消しても、このコマンドを
 * 各バージョンペアに対して再実行すれば全期間分を作り直せる。
 *
 * 使い方:
 *   node tools/gen-snapshot-diff.mjs --from 6686 --to 6687            (dry-run。stdout にJSON)
 *   node tools/gen-snapshot-diff.mjs --from 6686 --to 6687 --write    (data/diffs/ に保存)
 *   node tools/gen-snapshot-diff.mjs --to 6687 --write                (--from 省略 = 前のバージョン。
 *                                                                       data/snapshots/ を新しい順に
 *                                                                       並べて to の1つ前を使う)
 *
 * 比較対象フィールドは tools/diff/fields.mjs のホワイトリスト。
 * kind は added / removed / changed の3種。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  heroFieldMap,
  itemFieldMap,
  diffFieldMaps,
} from "./diff/fields.mjs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SNAP_DIR = join(REPO_ROOT, "data", "snapshots");
const DIFF_DIR = join(REPO_ROOT, "data", "diffs");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(`--${name}`);

function listVersions() {
  if (!existsSync(SNAP_DIR)) return [];
  return readdirSync(SNAP_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // ClientVersion は単調増加する数値なので数値ソートできる。数値でなければ文字列ソートに落ちる
    .sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b));
}

const TO = opt("to");
if (!TO) {
  console.error("--to <version> が必要です(比較先のスナップショットバージョン)");
  process.exit(1);
}
const versions = listVersions();
const FROM =
  opt("from") ?? versions[versions.indexOf(TO) - 1] ?? versions.filter((v) => v !== TO).at(-1);
if (!FROM) {
  console.error(`--from を決められません。data/snapshots/ にバージョンが1つしかありません: [${versions}]`);
  process.exit(1);
}

const loadSnap = (version) => {
  const dir = join(SNAP_DIR, version);
  if (!existsSync(dir)) {
    console.error(`スナップショットが見つかりません: ${dir}`);
    process.exit(1);
  }
  const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  return { heroes: read("heroes.json").heroes, items: read("items.json").items, abilities: read("abilities.json").abilities };
};

const before = loadSnap(FROM);
const after = loadSnap(TO);

const entries = [];
const skipped = [];

// --- ヒーロー ---
const heroIds = new Set([...Object.keys(before.heroes), ...Object.keys(after.heroes)]);
for (const id of heroIds) {
  const bh = before.heroes[id];
  const ah = after.heroes[id];
  if (!bh && ah) {
    entries.push({ kind: "added", type: "hero", id });
    continue;
  }
  if (bh && !ah) {
    entries.push({ kind: "removed", type: "hero", id });
    continue;
  }
  if (!bh?.released && !ah?.released) continue; // 未実装ヒーロー同士は比較しない
  const bMap = heroFieldMap(bh, before.abilities, skipped);
  const aMap = heroFieldMap(ah, after.abilities, skipped);
  for (const row of diffFieldMaps(bMap, aMap)) {
    entries.push({ kind: "changed", type: "hero", id, path: row.path, before: row.before, after: row.after });
  }
}

// --- アイテム ---
const itemIds = new Set([...Object.keys(before.items), ...Object.keys(after.items)]);
for (const id of itemIds) {
  const bi = before.items[id];
  const ai = after.items[id];
  if (!bi && ai) {
    entries.push({ kind: "added", type: "item", id });
    continue;
  }
  if (bi && !ai) {
    entries.push({ kind: "removed", type: "item", id });
    continue;
  }
  if (!bi?.inShop && !ai?.inShop) continue; // ショップ非掲載同士は比較しない
  const bMap = itemFieldMap(bi, skipped);
  const aMap = itemFieldMap(ai, skipped);
  for (const row of diffFieldMaps(bMap, aMap)) {
    entries.push({ kind: "changed", type: "item", id, path: row.path, before: row.before, after: row.after });
  }
}

entries.sort(
  (a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id) || (a.path ?? "").localeCompare(b.path ?? ""),
);

const doc = {
  from: FROM,
  to: TO,
  generatedAt: new Date().toISOString(),
  entries,
  excludedFieldCount: skipped.length,
};

if (flag("write")) {
  mkdirSync(DIFF_DIR, { recursive: true });
  const path = join(DIFF_DIR, `${FROM}..${TO}.json`);
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  console.error(
    `data/diffs/${FROM}..${TO}.json: ${entries.length} 件(added ${entries.filter((e) => e.kind === "added").length} / ` +
      `removed ${entries.filter((e) => e.kind === "removed").length} / changed ${entries.filter((e) => e.kind === "changed").length}), ` +
      `除外フィールド ${skipped.length} 件`,
  );
} else {
  console.log(JSON.stringify(doc, null, 2));
  console.error(`(dry-run) ${entries.length} 件。--write で data/diffs/ に保存します`);
}
