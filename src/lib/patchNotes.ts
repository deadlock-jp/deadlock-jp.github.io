/**
 * 公式パッチノート(data/patch-notes.json)の読み込みと、日付との対応付け。
 *
 * サイト側(トップ・パッチノートページ・ビルド比較)と tools/gen-updates.mjs の
 * 両方がここを使う。以前は gen-updates.mjs の中に findNearestPatchNote() が
 * 独自に書かれていて、サイト側には対応付けの実装が無かった。
 *
 * このモジュールは data/patch-notes.json 以外に依存しない。スナップショットを
 * 読む src/lib/data.ts を経由しないので、ビルド時でもツールからでも同じように動く
 * (ツールからは node --experimental-strip-types 経由で読む)。
 */
import patchNotesJson from "../../data/patch-notes.json" with { type: "json" };

export interface PatchNoteEntry {
  gid: string;
  date: string;
  title: string;
  url: string;
  /** BBCodeから変換済みの行。"## " で始まる行は見出し */
  lines: string[];
  /**
   * 英語の原文の題と本文(日本語以外のページで出す。翻訳はしない)。
   * title / lines は日本語版が公開されていれば日本語、無ければ英語。
   * 古い patch-notes.json には無いので undefined のことがある
   */
  titleEn?: string;
  linesEn?: string[];
  /** Steam のお知らせの投稿時刻(unix 秒)。統計の集計期間の起点に使う。古いファイルには無い */
  postedAt?: number | null;
}

/** その言語で出す題。日本語は title、それ以外は英語の原文の題 */
export function noteTitle(n: PatchNoteEntry, lang: string): string {
  return lang === "ja" ? n.title : (n.titleEn ?? n.title);
}

/** その言語で出す本文。日本語は lines、それ以外は英語の原文 */
export function noteLines(n: PatchNoteEntry, lang: string): string[] {
  return lang === "ja" ? n.lines : (n.linesEn ?? n.lines);
}

const file = patchNotesJson as unknown as { entries: PatchNoteEntry[] };

/** 新しい順 */
export function patchNotes(): PatchNoteEntry[] {
  return [...(file.entries ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function patchNoteByDate(dateISO: string): PatchNoteEntry | null {
  return patchNotes().find((n) => n.date === dateISO) ?? null;
}

const DAY = 86_400_000;

/**
 * その日付に最も近い公式パッチノート。maxGapDays より離れていれば null。
 *
 * 使い分け:
 *   出典の自動付与(gen-updates)     … 5日。生成日とノートの投稿日が多少ずれても拾う
 *   スナップショットのラベル付け      … 2日。「この版はこの公式アップデートのもの」と
 *                                      言い切れるときだけ結び付ける。手元の 6689 は
 *                                      2026-09-12 抽出で最新ノートが 2026-08-22 なので、
 *                                      ここで意図的に外れる(ClientVersion で表示する)
 */
export function nearestPatchNote(dateISO: string, maxGapDays = 5): PatchNoteEntry | null {
  const target = new Date(dateISO).getTime();
  if (!Number.isFinite(target)) return null;
  let best: PatchNoteEntry | null = null;
  let bestGap = Infinity;
  for (const n of patchNotes()) {
    const gap = Math.abs(new Date(n.date).getTime() - target);
    if (gap < bestGap) {
      best = n;
      bestGap = gap;
    }
  }
  return best && bestGap <= maxGapDays * DAY ? best : null;
}
