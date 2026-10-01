/**
 * 言語ごとの URL。
 *
 * 多言語版があるのはトップ・ヒーロー・アイテム・スキル・ビルド・パッチノート・状態異常・効果の一覧だけで、
 * それ以外(攻略情報の他のページ・about・tools)は日本語のみ。
 * パッチノートの多言語版は、バランス調整をその言語で組み立て、公式の本文は英語の原文を出す
 * (手書きの補足は日本語のまま、lang="ja" と「日本語のみ」を付ける)。
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
    path.startsWith("/build/") ||
    path.startsWith("/patch-notes/") ||
    // 攻略情報のうち、状態異常・効果の一覧だけはゲームデータから組み立てるので全言語で出す
    path === "/mechanics/effects/"
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
