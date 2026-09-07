/**
 * ビルドのURLエンコード / デコード
 *
 * 共有URLはアカウント不要・サーバー不要で成立させるため、
 * ビルドの内容をURLのハッシュに埋め込む。
 *
 *   #h=1&i=clip_size,health,improved_spirit
 *
 * IDはゲーム内部の実IDをそのまま使う。連番などを使うと、アイテムの
 * 追加・削除のたびに既存の共有URLが別のビルドを指してしまい壊れる。
 * 冗長な "upgrade_" の接頭辞だけは、可逆な変換として省略する。
 */

const ID_PREFIX = "upgrade_";

export interface BuildState {
  /** ヒーローの実ID。未選択なら null */
  heroId: number | null;
  /** アイテムの実ID。購入順を保持する */
  itemIds: string[];
}

/** "upgrade_clip_size" → "clip_size" (接頭辞が無いものはそのまま) */
export function shortenId(id: string): string {
  return id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : `!${id}`;
}

/** shortenId の逆変換 */
export function expandId(short: string): string {
  return short.startsWith("!") ? short.slice(1) : ID_PREFIX + short;
}

export function encodeBuild(state: BuildState): string {
  const parts: string[] = [];
  if (state.heroId !== null) parts.push(`h=${state.heroId}`);
  if (state.itemIds.length > 0) {
    parts.push(`i=${state.itemIds.map(shortenId).join(",")}`);
  }
  return parts.join("&");
}

export function decodeBuild(hash: string): BuildState {
  const clean = hash.replace(/^#/, "");
  const params = new URLSearchParams(clean);
  const h = params.get("h");
  const i = params.get("i");
  const heroId = h !== null && /^\d+$/.test(h) ? Number(h) : null;
  const itemIds = i ? i.split(",").filter(Boolean).map(expandId) : [];
  return { heroId, itemIds };
}

/**
 * 累積ソウルからレベルを求める。
 * levels は heroes.json の levels(レベル昇順・requiredGold は累積必要ソウル)。
 *
 * 横軸を購入順にしているため、各時点の累積コストをその時点の獲得ソウル総額と
 * みなしている。詳細はプロジェクトの設計メモ(architecture.html、リポジトリ外)を参照。
 */
export function levelForSouls(
  levels: { level: number; requiredGold: number }[],
  souls: number,
): number {
  let current = levels[0]?.level ?? 1;
  for (const l of levels) {
    if (souls >= l.requiredGold) current = l.level;
    else break;
  }
  return current;
}
