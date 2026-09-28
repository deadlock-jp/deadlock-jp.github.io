/**
 * 言語ごとの URL。
 *
 * 多言語版があるのはトップ・ヒーロー・アイテム・スキル・ビルドだけで、
 * それ以外(攻略情報・パッチノート・about・tools)は日本語のみ。
 * 日本語のみのページへのリンクは、どの言語から張っても日本語版の URL のまま。
 */
import { BUILT_LANGS, LANG_META, LANGS, type Lang } from "./langs.ts";
import { currentLang } from "./context.ts";

/** 多言語版を作るパス(サイトルートからの絶対パス) */
export function isLocalizedPath(path: string): boolean {
  return (
    path === "/" ||
    path.startsWith("/heroes/") ||
    path.startsWith("/items/") ||
    path.startsWith("/abilities/") ||
    path.startsWith("/build/")
  );
}

/** URL の pathname から言語と、接頭辞を外したパスを取り出す */
export function splitLangPath(pathname: string): { lang: Lang; path: string } {
  for (const lang of LANGS) {
    const prefix = LANG_META[lang].prefix;
    if (prefix && (pathname === prefix || pathname.startsWith(prefix + "/"))) {
      return { lang, path: pathname.slice(prefix.length) || "/" };
    }
  }
  return { lang: "ja", path: pathname };
}

/**
 * 指定言語でのパス。多言語版が無いページ(日本語のみ)は日本語版のパスのまま返す。
 * 日本語なら何もしない(日本語版の出力を変えないため)。
 */
export function langPath(path: string, lang: Lang = currentLang()): string {
  if (lang === "ja" || !isLocalizedPath(path) || !BUILT_LANGS.includes(lang)) return path;
  return LANG_META[lang].prefix + path;
}

/** いまの言語から見て、そのパスが日本語版にしか無いか(リンクに「日本語のみ」を添える判定) */
export function isJaOnlyFrom(path: string, lang: Lang = currentLang()): boolean {
  return lang !== "ja" && !isLocalizedPath(path);
}
