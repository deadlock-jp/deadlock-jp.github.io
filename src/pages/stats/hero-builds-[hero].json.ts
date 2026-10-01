/**
 * ヒーローごとの人気のビルド(/stats/hero-builds-<ヒーローID>.json)。
 * ビルドページはヒーローを選んだときに、そのヒーローの分だけをここから読み込む
 * (全ヒーロー分を埋め込むと 400KB ほど重くなるため)。中身は data/hero-builds.json の heroes.<ID>。
 * 数値と ID だけで、ビルド名などの文章は元のファイルにも入っていない(tools/fetch-hero-builds.mjs)。
 */
import type { APIRoute } from "astro";
import { heroBuilds } from "../../lib/data.ts";

export function getStaticPaths() {
  return Object.keys(heroBuilds.heroes).map((hero) => ({ params: { hero } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(
    JSON.stringify({
      fetchedAt: heroBuilds.fetchedAt,
      windowDays: heroBuilds.windowDays,
      builds: heroBuilds.heroes[params.hero as string] ?? [],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
