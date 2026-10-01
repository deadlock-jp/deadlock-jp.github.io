/**
 * 統計(deadlock-api.com 由来)のランク帯。定義の本体は rankBands.json で、
 * 取得スクリプト(tools/fetch-item-stats.mjs / tools/fetch-hero-stats.mjs。素の Node で動くので .ts を読めない)と
 * 画面の両方がそれを読む。ここは画面側の入り口。
 *
 * 帯は「全ランク(all)」と、ランクtier(1〜11)を3つにまとめた low / mid / high。
 * tier ごとだとパッチ以降の試合数が数百〜千数百しかなく、ヒーロー×アイテムに分けると薄すぎるため。
 * avg_badge は「tier×10 + subtier(1〜6)」なので、tier a〜b は badge a×10+1 〜 b×10+6。
 * tier はゲーム内のランク名トークン Citadel_ranks_rank<tier-1> に対応する(表示名はそこから引く)。
 */
import def from "./rankBands.json" with { type: "json" };

export type RankBandKey = "all" | "low" | "mid" | "high";

export interface RankBand {
  key: Exclude<RankBandKey, "all">;
  minTier: number;
  maxTier: number;
  minBadge: number;
  maxBadge: number;
}

export const RANK_BANDS = def.bands as RankBand[];
/** 画面で選べる帯(全ランクが先頭) */
export const BAND_KEYS: RankBandKey[] = ["all", ...RANK_BANDS.map((b) => b.key)];

/** ランクtier(1〜11)を含む帯。どこにも入らなければ all */
export function bandOfTier(tier: number): RankBandKey {
  return RANK_BANDS.find((b) => tier >= b.minTier && tier <= b.maxTier)?.key ?? "all";
}
