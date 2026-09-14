// @ts-check
/**
 * Steam の公開イベントAPI(store.steampowered.com/events/ajaxgetpartnereventspageable)
 * から Deadlock の公式パッチノート本文を取得し、data/patch-notes.json に保存する。
 *
 * ここで保存するのは Valve 公式の投稿本文そのもの(deadlock.wiki 等の第三者の文章では
 * ないので CLAUDE.md ルール4には抵触しない)。APIキー不要、認証不要の公開エンドポイント。
 *
 * 日本語版が公式に存在する(2026-09-13 に判明)。`&l=japanese` を付けて取得すると、
 * ゲーム内表記と同じくValveが用意した日本語をそのまま返す(未翻訳の古い投稿だけ
 * 英語のまま返ってくる。これはゲーム内ローカライズの t() と同じフォールバック)。
 * 自前で翻訳しない(ルール2)。
 *
 * このAPIはページングパラメータが無く、1回のリクエストで全履歴(2026-09時点で36件)
 * を返す。件数がこの先増えて全件返らなくなった場合は count を上げて様子を見ること。
 *
 * 判定: event_name(英語版)に "Update" を含むものだけをパッチノートとして扱う。
 * ヒーロー解禁などの読み物系イベント("Introducing The Dazzling Celeste" 等)は
 * 英語タイトルに検出できる共通パターンが無いため、ここでは拾わない。
 *
 * gid はそのまま store.steampowered.com/news/app/<appid>/view/<gid> の実URLに使える
 * (以前のISteamNews版と違い、リダイレクト解決が不要)。
 *
 * 使い方:
 *   node tools/fetch-patch-notes.mjs                  (dry-run。件数を表示)
 *   node tools/fetch-patch-notes.mjs --write           (data/patch-notes.json を書き出す)
 *   node tools/fetch-patch-notes.mjs --count 60 --write   (取得件数を増やす。既定60)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_PATH = join(REPO_ROOT, "data", "patch-notes.json");
const APPID = 1422450;

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const COUNT = Number(opt("count", "60"));

async function fetchEvents(lang) {
  const url =
    `https://store.steampowered.com/events/ajaxgetpartnereventspageable/` +
    `?appid=${APPID}&count=${COUNT}${lang ? `&l=${lang}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam APIエラー(l=${lang ?? "en"}): HTTP ${res.status}`);
  const data = await res.json();
  return data.events ?? [];
}

/** 1行分の後処理(タグ除去・エンティティ復元・先頭の "- " 除去)。空なら null */
function cleanLine(raw) {
  const text = raw
    .replace(/\[\/?[a-z*][^\]]*\]/gi, "") // 残りのBBCodeタグを全部落とす([i] [list] [*] [img] [url=] など)
    // 画像パスのプレースホルダ(見出し画像など)。{STEAM_CLAN_IMAGE} のほかに
    // 言語別画像の {STEAM_CLAN_LOC_IMAGE} もある。まとめて落とす
    .replace(/\{STEAM_CLAN_[A-Z_]*IMAGE\}\S*/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
    .replace(/^-\s*/, ""); // 表示側で箇条書きにするので、本文側の "- " 接頭辞は落とす
  return text || null;
}

/**
 * BBCode本文 → 表示用プレーンテキスト行の配列。
 * 新しめの投稿は [p]...[/p] で1行ずつ区切られているが、2024年の古い投稿は
 * [p] を使わず生の "\n" 区切りの文章(たまに [i]/[img] が混じる)なので、
 * [p] が1つも無ければ改行区切りにフォールバックする。
 */
function parseBody(contents) {
  const lines = [];
  const blockRe = /\[p\]([\s\S]*?)\[\/p\]/g;
  const blocks = [...contents.matchAll(blockRe)];
  const raw = blocks.length > 0 ? blocks.map((m) => m[1]) : contents.split(/\n+/);
  for (const block of raw) {
    const heading = /^\[[bu]\]\[?\s*(.*?)\s*\]?\[\/[bu]\]$/.exec(block.trim());
    if (heading) {
      const h = heading[1].trim();
      if (h) lines.push(`## ${h}`);
      continue;
    }
    const text = cleanLine(block);
    if (text) lines.push(text);
  }
  return lines;
}

console.error("公式パッチノートを取得中(英語版で対象を判定 → 日本語版を取得)...");
const [eventsEn, eventsJa] = await Promise.all([fetchEvents(null), fetchEvents("japanese")]);

const jaByGid = new Map(eventsJa.map((e) => [e.gid, e]));

const isPatchNote = (e) => /update/i.test(e.event_name ?? "") && e.announcement_body?.body;
const candidates = eventsEn.filter(isPatchNote);
console.error(`${eventsEn.length} 件中 ${candidates.length} 件がパッチノート候補`);

/**
 * rtime32_start_time は投稿日時とズレることがある(実測: 2026-05-22 と 2026-04-30 の
 * 2件が、どちらも別の日付(2026-05-28)を指していた)。英語タイトルには
 * "Minor Update - 08-22-2026" / "10-24-2024 Update" のように MM-DD-YYYY が
 * 埋め込まれているため、見つかればそちらを優先する。
 */
function dateFromTitle(title) {
  const m = /(\d{1,2})-(\d{1,2})-(\d{4})/.exec(title);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

const entries = candidates.map((en) => {
  // 日本語版が無い(未翻訳)場合は英語版のまま(t()と同じフォールバック)
  const ja = jaByGid.get(en.gid) ?? en;
  const body = ja.announcement_body?.body ?? en.announcement_body.body;
  const date = dateFromTitle(en.event_name) ?? new Date(en.rtime32_start_time * 1000).toISOString().slice(0, 10);
  return {
    gid: en.gid,
    date,
    title: (ja.event_name ?? en.event_name).trim(),
    url: `https://store.steampowered.com/news/app/${APPID}/view/${en.gid}`,
    lines: parseBody(body),
  };
});
entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

const doc = {
  schemaVersion: 1,
  source: `https://store.steampowered.com/events/ajaxgetpartnereventspageable/?appid=${APPID}`,
  fetchedAt: new Date().toISOString(),
  entries,
};

if (flag("write")) {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + "\n");
  console.error(`data/patch-notes.json を更新: ${entries.length} 件`);
} else {
  for (const e of entries) console.error(`  - ${e.date} ${e.title}`);
  console.error(`(dry-run) ${entries.length} 件。--write で保存します`);
}
