// @ts-check
/**
 * 統計(tools/fetch-item-stats.mjs / tools/fetch-hero-stats.mjs)の集計期間の起点を決める。
 *
 * 起点は「data/updates.json で最新の、バランス変更があったアップデート」の公式のお知らせの投稿時刻。
 *   - 数値差分0件の版(updates.json にエントリが無い/adjustments が空)や、
 *     システム全体(target: "system")だけの変更では起点を動かさない
 *   - 時刻は data/patch-notes.json の postedAt(Steam のお知らせの投稿時刻。unix 秒)
 *   - 同じ日付の投稿が無い/postedAt が無い投稿だけ、その日付の 00:00 UTC にする(source で区別)
 * 実行のたびにここで決めるので、新しいバランス変更が updates.json に入れば、次の取得から自動で切り替わる。
 * 手で日付を書き換える運用にしない。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {string} repoRoot
 * @returns {{ start: number, startIso: string, source: "postedAt" | "dateMidnightUtc",
 *   patch: { date: string, titleEn: string | null, titleJa: string | null } }}
 */
export function statsWindow(repoRoot) {
  const updates = JSON.parse(readFileSync(join(repoRoot, "data", "updates.json"), "utf8"));
  const notes = JSON.parse(readFileSync(join(repoRoot, "data", "patch-notes.json"), "utf8"));
  const latest = [...(updates.entries ?? [])]
    // ヒーロー・アイテムの調整があるものだけ。システム全体(箱の出現時間など)だけの変更では
    // 統計の起点を動かさない(2026-09-30 の告知なし調整 6726 は箱の出現時間だけだった)
    .filter((u) => (u.adjustments ?? []).some((a) => a.target === "hero" || a.target === "item"))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  if (!latest) throw new Error("updates.json にバランス変更のあるアップデートがありません");

  const note = (notes.entries ?? []).find((n) => n.date === latest.date) ?? null;
  const posted = typeof note?.postedAt === "number" ? note.postedAt : null;
  const start = posted ?? Math.floor(Date.parse(`${latest.date}T00:00:00Z`) / 1000);
  /** 日本語の題(日本語版のお知らせがあるときだけ。英語と同じなら null) */
  const titleEn = note?.titleEn ?? note?.title ?? null;
  const titleJa = note && note.title !== titleEn ? note.title : null;
  return {
    start,
    startIso: new Date(start * 1000).toISOString(),
    source: posted !== null ? "postedAt" : "dateMidnightUtc",
    patch: { date: latest.date, titleEn, titleJa },
  };
}
