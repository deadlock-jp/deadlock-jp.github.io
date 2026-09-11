// @ts-check
/**
 * data/diffs/<from>..<to>.json と公式パッチノートを突き合わせ、ズレを報告する
 * (architecture.html 第8章)。パイプライン(抽出→差分→push)には依存させない、
 * 完全に別の・人手で流すコマンド。ノートが手に入らなくても他は止まらない。
 *
 * このコマンドの出力は database ではなく、あくまで人間向けの確認レポート
 * (stdoutに出すだけで data/ には何も書かない)。CLAUDE.md ルール1(考察・攻略を
 * 書かない)は database 側(サイトが表示するJSON)の話で、ここでの一時的な
 * 突き合わせ出力には及ばない。
 *
 * ノートのソースは2つ(両方省略可。1つも無ければ全差分が「ノート未記載」扱いになる):
 *   --local-root <dir>  tools/extract/extract-local.mjs の出力
 *                        (localization/citadel_patch_notes/*_japanese.txt を読む。
 *                         ヒーローラボの調整履歴のみ。範囲が狭いことに注意)
 *   --notes <file>       公式パッチノート本文を自分で保存したテキストファイル
 *                        (deadlock.wiki 等の転載ではなく、Valve公式の配信をそのまま)
 *
 * 使い方:
 *   node tools/reconcile-patch-notes.mjs --diff data/diffs/6687..6688.json \
 *     --local-root "C:\Users\nogud\Downloads\deadlock-extract\local-6688" \
 *     --notes C:\path\to\official-patch-notes.txt
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * citadel_patch_notes_*.txt 専用の緩いトークン読み取り。
 * src/parsers/localization.ts の parseLocalizationText は「値は1行」を前提にしていて
 * (壊れたファイルの検出のため、生の改行が来たら読み取りを打ち切る)、これはサイトが
 * 実際に表示する localization グループ(citadel_heroes 等)では正しい前提。
 * だが citadel_patch_notes だけは Valve 側が値の途中に生の改行を挟む
 * (`"<b>日付</b><br>\n\t<li>…</li>"`)ため、strict なパーサーでは 0 件になる。
 * ここではこの1ファイル専用に、値が複数行にまたがってもよい緩い読み方をする。
 * サイトの database には使わない(この照合コマンドの中だけ)ので、
 * strict なパーサー側の前提は変えない。
 */
function readPatchNotesTokensLoose(text) {
  const out = [];
  const re = /"([A-Za-z0-9_]+)"\s*"((?:[^"\\]|\\.)*)"/g;
  for (const m of text.matchAll(re)) {
    if (!m[1].startsWith("Citadel_PatchNotes")) continue;
    out.push(m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'));
  }
  return out;
}
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
};

const DIFF_PATH = opt("diff");
if (!DIFF_PATH) {
  console.error("--diff <data/diffs/<from>..<to>.json> が必要です");
  process.exit(1);
}
const diff = JSON.parse(readFileSync(DIFF_PATH, "utf8"));
const { from, to } = diff;

const snapDir = join(REPO_ROOT, "data", "snapshots", to);
const read = (name) => JSON.parse(readFileSync(join(snapDir, name), "utf8"));
const heroes = read("heroes.json").heroes;
const items = read("items.json").items;
const abilities = read("abilities.json").abilities;
const loc = read("localization.japanese.json").tokens;
const locEn = existsSync(join(snapDir, "localization.english.json"))
  ? read("localization.english.json").tokens
  : {};
const t = (token) => loc[token]?.text ?? locEn[token]?.text ?? token;

// --- ノート本文を集める ---
let notesText = "";
const localRoot = opt("local-root");
if (localRoot) {
  const p = join(localRoot, "localization", "citadel_patch_notes", "citadel_patch_notes_japanese.txt");
  if (existsSync(p)) {
    const bodies = readPatchNotesTokensLoose(readFileSync(p, "utf8"));
    notesText += bodies.join("\n") + "\n";
    console.error(`ヒーローラボ調整履歴: ${bodies.length} 件を読み込み(範囲は限定的)`);
  } else {
    console.error(`(--local-root を指定しましたが見つかりません: ${p})`);
  }
}
const notesFile = opt("notes");
if (notesFile) {
  if (!existsSync(notesFile)) {
    console.error(`--notes のファイルが見つかりません: ${notesFile}`);
    process.exit(1);
  }
  notesText += readFileSync(notesFile, "utf8") + "\n";
  console.error(`公式パッチノート: ${notesFile} を読み込み`);
}
if (!notesText.trim()) {
  console.error(
    "ノートのソースが1つもありません(--local-root / --notes)。全差分を「ノート未記載」として報告します。",
  );
}

// --- 差分エントリに人が読めるラベルを付ける ---
function labelFor(entry) {
  if (entry.type === "hero") {
    const h = heroes[entry.id];
    const heroName = h ? t(h.nameToken) : entry.id;
    const abilityKey = entry.path?.split(".")[0];
    const ab = abilityKey ? abilities[abilityKey] : null;
    return ab ? `${heroName}(${t(ab.nameToken)})` : heroName;
  }
  const i = items[entry.id];
  return i ? t(i.nameToken) : entry.id;
}

const mentioned = (label) => label && notesText.includes(label);

// --- 1) 差分にあるがノートに無い = サイトの独自価値 ---
const undocumented = diff.entries
  .map((e) => ({ ...e, label: labelFor(e) }))
  .filter((e) => !mentioned(e.label));

// --- 2) ノートにある名前で、差分に1件も無いもの = 要確認(サーバー側調整 or 抽出漏れ) ---
const allNames = [
  ...Object.values(heroes).map((h) => ({ type: "hero", id: h.id, name: t(h.nameToken) })),
  ...Object.values(items).map((i) => ({ type: "item", id: i.id, name: t(i.nameToken) })),
].filter((n) => n.name);

const diffedIds = new Set(diff.entries.map((e) => `${e.type}:${e.id}`));
const mentionedButNotDiffed = allNames.filter(
  (n) => notesText.includes(n.name) && !diffedIds.has(`${n.type}:${n.id}`),
);

// --- レポート ---
console.log(`=== ${from} -> ${to} 照合レポート ===`);
console.log(`差分エントリ総数: ${diff.entries.length}`);
console.log("");
console.log(`【ノート未記載の変更】(サイトの独自価値。${undocumented.length} 件)`);
for (const e of undocumented) {
  const detail = e.kind === "changed" ? `${e.path}: ${e.before} -> ${e.after}` : e.kind;
  console.log(`  - [${e.type}] ${e.label} — ${detail}`);
}
console.log("");
console.log(`【ノートにあるが差分に無い】(要確認。${mentionedButNotDiffed.length} 件)`);
for (const n of mentionedButNotDiffed) {
  console.log(`  - [${n.type}] ${n.name} (id=${n.id})`);
}
console.log("");
console.log(
  "※「ノートにあるが差分に無い」は、サーバー側だけの調整(クライアントデータ未反映)か、" +
    "抽出・パーサー側の見落としのどちらか。前者なら注記、後者ならパーサーを直す(architecture.html 第8章)。",
);
