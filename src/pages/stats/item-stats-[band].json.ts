/**
 * ランク帯ごとのヒーロー×アイテム統計(/stats/item-stats-<帯>.json)。
 * ビルドページは、ヒーローを選んだとき(と帯が選ばれたとき)に今の帯の分をここから読み込む
 * (全ランクも含め、ページやデータの JSON には埋め込まない)。中身は data/item-stats.json の bands.<帯>.heroes。
 * 言語に依存しないので、言語ごとの版は作らない。
 */
import type { APIRoute } from "astro";
import { itemStats, hasItemStats } from "../../lib/data.ts";
import { BAND_KEYS } from "../../lib/rankBands.ts";

export function getStaticPaths() {
  return (hasItemStats ? BAND_KEYS : []).filter((k) => itemStats.bands[k]).map((k) => ({ params: { band: k } }));
}

export const GET: APIRoute = ({ params }) => {
  const band = itemStats.bands[params.band as (typeof BAND_KEYS)[number]];
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
