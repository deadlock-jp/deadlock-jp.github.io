/** マウスオーバーの詳細カードのデータ(多言語版)。説明は src/pages/hover/[kind].json.ts */
import type { APIRoute } from "astro";
import { HOVER_KINDS, hoverData, type HoverKind } from "../../../lib/hoverData.ts";
import { PREFIXED_LANGS } from "../../../i18n/langs.ts";

export function getStaticPaths() {
  return PREFIXED_LANGS.flatMap((lang) => HOVER_KINDS.map((kind) => ({ params: { lang, kind } })));
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(hoverData(params.kind as HoverKind)), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
