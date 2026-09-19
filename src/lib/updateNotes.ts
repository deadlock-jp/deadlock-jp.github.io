/**
 * アップデート個別ページ(/patch-notes/<日付>/)に出す、全体の変更の手書きメモ。
 *
 * 公式パッチノートの General 節には、ヒーローにもアイテムにも属さない変更が入る。
 * そのうち economy.json に数値があるもの（建造物破壊のソウルなど）は
 * target: "system" としてバランス調整の差分に自動で出るが、パリィ中のリロードや
 * スロウの全体調整のように、パーサーが対応するフィールドを持たない挙動変更は
 * 差分にまったく現れない。それを data/update-notes.json に手書きで補う。
 *
 * 数値を手で書き写す場所ではない（CLAUDE.md ルール6）。スナップショットから
 * 取れる数値が差分に出ていないなら、ここに書くのではなくパーサーか
 * tools/diff/fields.mjs を直す。
 */
import updateNotesJson from "../../data/update-notes.json" with { type: "json" };

export interface UpdateNoteSection {
  title: string;
  lines: string[];
}

const notes = (updateNotesJson as unknown as { notes: Record<string, UpdateNoteSection[]> }).notes;

/** その日付の手書きメモ。無ければ空配列 */
export function updateNoteSections(date: string): UpdateNoteSection[] {
  return notes[date] ?? [];
}
