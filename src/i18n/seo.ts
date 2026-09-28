/**
 * 検索向けの言語の出し分け(hreflang・noindex・sitemap の alternate)。
 * どの言語を検索に出すかは src/lib/site.ts の INDEXED_LANGS の1か所で決める。
 */
import { INDEXED_LANGS } from "../lib/site.ts";
import { BUILT_LANGS, LANG_META, type Lang } from "./langs.ts";
import { isLocalizedPath, langPath } from "./routes.ts";

export const isIndexed = (lang: Lang): boolean => INDEXED_LANGS.includes(lang);

export interface Alternate {
  /** hreflang の値(ja / en / ko / zh-CN / x-default) */
  hreflang: string;
  /** サイトルートからの絶対パス */
  path: string;
}

/**
 * そのページの言語版(接頭辞を外したパスで渡す)。
 * 言語版が実在し、かつ検索に出す言語だけを並べる。検索に出す言語版が2つ未満なら
 * 何も出さない(比べる相手が無いので hreflang の意味が無い)。
 * x-default は英語版。英語を検索に出していないときは出さない。
 */
export function alternatesFor(path: string): Alternate[] {
  if (!isLocalizedPath(path)) return [];
  const langs = BUILT_LANGS.filter(isIndexed);
  if (langs.length < 2) return [];
  const out: Alternate[] = langs.map((lang) => ({ hreflang: LANG_META[lang].htmlLang, path: langPath(path, lang) }));
  if (langs.includes("en")) out.push({ hreflang: "x-default", path: langPath(path, "en") });
  return out;
}
