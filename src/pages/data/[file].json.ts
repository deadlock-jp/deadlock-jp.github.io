/**
 * ビルドシミュレーター・ビルド比較のデータ(/data/build-<lang>.<ハッシュ>.json・/data/compare-<lang>.<ハッシュ>.json)。
 * 中身は src/lib/buildPayload.ts と src/lib/comparePayload.ts。
 * 言語は URL の接頭辞ではなくファイル名で決まるので、ここで言語を切り替えて作る
 * (src/middleware.ts は /data/ を日本語として通す)。
 */
import type { APIRoute } from "astro";
import { buildDataFile } from "../../lib/buildPayload.ts";
import { compareDataFile } from "../../lib/comparePayload.ts";
import { runWithLang } from "../../i18n/context.ts";
import { BUILT_LANGS } from "../../i18n/langs.ts";

// tsc(types: node)は import.meta.env を知らないので、Astro が入れる値を型を絞って読む
const BASE = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/").replace(/\/$/, "");

export function getStaticPaths() {
  return BUILT_LANGS.flatMap((lang) =>
    [buildDataFile, compareDataFile].map((make) => {
      const { file, json } = runWithLang(lang, () => make(BASE));
      return { params: { file }, props: { json } };
    }),
  );
}

export const GET: APIRoute = ({ props }) =>
  new Response((props as { json: string }).json, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
