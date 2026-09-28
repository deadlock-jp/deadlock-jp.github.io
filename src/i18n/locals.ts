/**
 * .astro ファイル(ページ・コンポーネント・レイアウト)に渡す i18n の関数一式。
 * src/middleware.ts が Astro.locals.i18n に載せる。
 *
 * .astro 側で import しないのは、Astro が <head> 内の CSS の並び順を
 * 「各 .astro ファイルの import 一覧の中での位置」から決めているため
 * (node_modules/astro/dist/core/build/graph.js の getParentExtendedModuleInfos)。
 * .astro に import を1行足すだけで既存ページの CSS の順序が変わり、
 * 日本語版の出力が変わってしまう。
 *
 * 中身はどれも「いま描いているページの言語」で動く(src/i18n/context.ts)。
 */
import { L, fill } from "./index.ts";
import { term } from "./terms.ts";
import { t } from "./game.ts";
import { currentLang } from "./context.ts";
import { langPath, isJaOnlyFrom, isLocalizedPath, splitLangPath } from "./routes.ts";
import { LANGS, LANG_META, BUILT_LANGS } from "./langs.ts";
import { alternatesFor, isIndexed } from "./seo.ts";

export const i18nLocals = {
  L,
  fill,
  term,
  t,
  currentLang,
  langPath,
  isJaOnlyFrom,
  isLocalizedPath,
  splitLangPath,
  LANGS,
  LANG_META,
  BUILT_LANGS,
  alternatesFor,
  isIndexed,
};
export type I18nLocals = typeof i18nLocals;
