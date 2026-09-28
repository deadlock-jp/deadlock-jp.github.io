/**
 * サイトの言語。日本語はルート(/)のまま、ほかの言語は /en/ /ko/ /zh-cn/ の下に置く。
 *
 * 言語コードはここだけで決める。URL の接頭辞・html lang・og:locale・
 * ゲームのローカライズ(data/localization/<gameLang>.json)の対応もここに持つ。
 * 検索に出すかどうかは src/lib/site.ts の INDEXED_LANGS。
 */

export const LANGS = ["ja", "en", "ko", "zh-cn"] as const;
export type Lang = (typeof LANGS)[number];

/**
 * 実際にページを生成する言語。ja 以外はここに入っていなければ /<lang>/ を作らない。
 * (多言語版の準備段階で、日本語版の出力を変えずに作りだけ入れるための切り替え)
 */
export const BUILT_LANGS: readonly Lang[] = ["ja", "en", "ko", "zh-cn"];

/** ja 以外で生成する言語(src/pages/[lang]/ の getStaticPaths が使う) */
export const PREFIXED_LANGS = BUILT_LANGS.filter((l): l is Exclude<Lang, "ja"> => l !== "ja");

export interface LangMeta {
  /** <html lang> と hreflang の値 */
  htmlLang: string;
  /** og:locale */
  ogLocale: string;
  /** data/localization/<gameLang>.json */
  gameLang: "japanese" | "english" | "koreana" | "schinese";
  /** URL の接頭辞。日本語は "" */
  prefix: string;
  /** 言語切り替えに出す自称 */
  nativeName: string;
  /** public/images/flags/ の国旗 */
  flag: string;
  /** その言語のページでだけ読み込む Google Fonts の書体。日本語版は既存の読み込みのまま */
  font?: string;
}

export const LANG_META: Record<Lang, LangMeta> = {
  ja: { htmlLang: "ja", ogLocale: "ja_JP", gameLang: "japanese", prefix: "", nativeName: "日本語", flag: "jp" },
  en: { htmlLang: "en", ogLocale: "en_US", gameLang: "english", prefix: "/en", nativeName: "English", flag: "us" },
  ko: { htmlLang: "ko", ogLocale: "ko_KR", gameLang: "koreana", prefix: "/ko", nativeName: "한국어", flag: "kr", font: "Noto Sans KR" },
  "zh-cn": {
    htmlLang: "zh-CN",
    ogLocale: "zh_CN",
    gameLang: "schinese",
    prefix: "/zh-cn",
    nativeName: "简体中文",
    flag: "cn",
    font: "Noto Sans SC",
  },
};

export const isLang = (s: string | undefined): s is Lang => (LANGS as readonly string[]).includes(s ?? "");
