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
 * ノートのソースは3つ(すべて省略可。1つも無ければ全差分が「ノート未記載」扱いになる):
 *   --patch-notes-json <file>  tools/fetch-patch-notes.mjsが生成したdata/patch-notes.json
 *                        (既定でこのパスを自動で見に行く。diffの対象スナップショットの
 *                         meta.json の extractedAt に最も近い1件を自動選択する)
 *   --local-root <dir>  tools/extract/extract-local.mjs の出力
 *                        (localization/citadel_patch_notes/*_japanese.txt を読む。
 *                         ヒーローラボの調整履歴のみ。範囲が狭いことに注意)
 *   --notes <file>       公式パッチノート本文を自分で保存したテキストファイル
 *                        (deadlock.wiki 等の転載ではなく、Valve公式の配信をそのまま。
 *                         --patch-notes-json の自動選択より優先したいときに使う)
 *
 * 使い方:
 *   node tools/reconcile-patch-notes.mjs --diff data/diffs/6687..6688.json
 *     (data/patch-notes.json から自動でノートを選んで突き合わせる)
 *   node tools/reconcile-patch-notes.mjs --diff data/diffs/6687..6688.json \
 *     --notes C:\path\to\official-patch-notes.txt
 *     (手元のテキストを優先したいとき)
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
/*
 * GameTracking からバックフィルした版には日本語ローカライズが無い(英語だけ)。
 * 日本語が無いと公式ノート(日本語)と名前で突き合わせられず、全件が
 * 「ノート未記載」に落ちてレポートの意味が無くなるので、最新版の日本語で補う。
 * 表示名はパッチ間でまず変わらないうえ、ここは人が読む確認用レポート専用。
 */
const readTokensFrom = (dir, name) =>
  existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), "utf8")).tokens : {};
const latestVersion = JSON.parse(
  readFileSync(join(REPO_ROOT, "data", "latest.json"), "utf8"),
).version;
const latestDir = join(REPO_ROOT, "data", "snapshots", latestVersion);
const loc = {
  ...readTokensFrom(latestDir, "localization.japanese.json"),
  ...readTokensFrom(snapDir, "localization.japanese.json"),
};
const locEn = readTokensFrom(snapDir, "localization.english.json");
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
} else {
  // --notes が無ければ data/patch-notes.json から自動選択する。
  // 選ぶ基準は「to のスナップショット(meta.json.extractedAt)に最も近い日付のノート」。
  const patchNotesPath = opt("patch-notes-json") ?? join(REPO_ROOT, "data", "patch-notes.json");
  if (existsSync(patchNotesPath)) {
    const notes = JSON.parse(readFileSync(patchNotesPath, "utf8")).entries ?? [];
    let extractedAt = null;
    try {
      extractedAt = JSON.parse(readFileSync(join(snapDir, "meta.json"), "utf8")).extractedAt;
    } catch {
      /* meta.json が無ければ日付の近さでは選べない */
    }
    if (extractedAt && notes.length > 0) {
      const target = new Date(extractedAt).getTime();
      const best = notes.reduce((a, b) =>
        Math.abs(new Date(a.date).getTime() - target) <= Math.abs(new Date(b.date).getTime() - target) ? a : b,
      );
      notesText += best.lines.filter((l) => !l.startsWith("## ")).join("\n") + "\n";
      console.error(`公式パッチノート(自動選択): ${best.date} ${best.title}`);
    } else {
      console.error("(data/patch-notes.json はあるが、自動選択に必要な情報が無い)");
    }
  }
}
if (!notesText.trim()) {
  console.error(
    "ノートのソースが1つもありません(--local-root / --notes)。全差分を「ノート未記載」として報告します。",
  );
}

/*
 * 公式ノートは日本語版が遅れて出ることがある(2026-09-16のマイナーアップデートは
 * 英語のまま公開された)。日本語名だけで突き合わせると1件も一致せず、
 * 「ノートにあるが差分に無い」が空になって検査が素通りしてしまうので、
 * 日本語名と英語名の両方で照合する。
 */
const tEn = (token) => locEn[token]?.text ?? "";
const namesOf = (token) => [t(token), tEn(token)].filter(Boolean);

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

/** その差分エントリの対象(ヒーロー/アイテム)が、日英どちらかの名前でノートに出てくるか */
function mentionedEntry(entry) {
  const tokens =
    entry.type === "hero"
      ? [heroes[entry.id]?.nameToken]
      : [items[entry.id]?.nameToken];
  return tokens
    .filter(Boolean)
    .flatMap(namesOf)
    .some((name) => notesText.includes(name));
}

// --- 1) 差分にあるがノートに無い = サイトの独自価値 ---
const undocumented = diff.entries
  .map((e) => ({ ...e, label: labelFor(e) }))
  .filter((e) => !mentionedEntry(e));

// --- 2) ノートにある名前で、差分に1件も無いもの = 要確認(サーバー側調整 or 抽出漏れ) ---
const allNames = [
  ...Object.values(heroes).map((h) => ({
    type: "hero",
    id: h.id,
    name: t(h.nameToken),
    names: namesOf(h.nameToken),
  })),
  ...Object.values(items).map((i) => ({
    type: "item",
    id: i.id,
    name: t(i.nameToken),
    names: namesOf(i.nameToken),
  })),
].filter((n) => n.names.length > 0);

const diffedIds = new Set(diff.entries.map((e) => `${e.type}:${e.id}`));
const mentionedButNotDiffed = allNames.filter(
  (n) => n.names.some((name) => notesText.includes(name)) && !diffedIds.has(`${n.type}:${n.id}`),
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
