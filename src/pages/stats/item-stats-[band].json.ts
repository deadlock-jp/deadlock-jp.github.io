/**
 * ランク帯ごとのヒーロー×アイテム統計(/stats/item-stats-<帯>.json)。
 * ビルドページはページに全ランクの分だけを埋め込み、他の帯はここを選ばれたときに読み込む
 * (4帯分を丸ごと埋め込むとページが重くなるため)。中身は data/item-stats.json の bands.<帯>.heroes。
 * 言語に依存しないので、言語ごとの版は作らない。
 */
import type { APIRoute } from "astro";
import { itemStats } from "../../lib/data.ts";
import { RANK_BANDS } from "../../lib/rankBands.ts";

export function getStaticPaths() {
  return RANK_BANDS.filter((b) => itemStats.bands[b.key]).map((b) => ({ params: { band: b.key } }));
}

export const GET: APIRoute = ({ params }) => {
  const band = itemStats.bands[params.band as (typeof RANK_BANDS)[number]["key"]];
  return new Response(
    JSON.stringify({
      fetchedAt: itemStats.fetchedAt,
      band: params.band,
      lowSampleMatches: itemStats.lowSampleMatches,
      matches: band?.matches ?? 0,
      heroes: band?.heroes ?? {},
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
