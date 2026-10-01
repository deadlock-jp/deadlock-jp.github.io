/**
 * マウスオーバーの詳細カードのデータ(日本語版)。中身は src/lib/hoverData.ts。
 * 多言語版は src/pages/[lang]/hover/[kind].json.ts(言語は src/middleware.ts が URL から決める)
 */
import type { APIRoute } from "astro";
import { HOVER_KINDS, hoverData, type HoverKind } from "../../lib/hoverData.ts";

export function getStaticPaths() {
  return HOVER_KINDS.map((kind) => ({ params: { kind } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(hoverData(params.kind as HoverKind)), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
