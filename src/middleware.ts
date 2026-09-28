/**
 * ページの言語を URL の接頭辞(/en/ /ko/ /zh-cn/)で決め、そのページの描画全体を
 * その言語の中で走らせる(src/i18n/context.ts)。静的ビルドでもページごとに通る。
 * .astro から使う i18n の関数は Astro.locals.i18n に載せる(理由は src/i18n/locals.ts)。
 */
import type { MiddlewareHandler } from "astro";
import { runWithLang } from "./i18n/context.ts";
import { splitLangPath } from "./i18n/routes.ts";
import { i18nLocals } from "./i18n/locals.ts";

export const onRequest: MiddlewareHandler = (context, next) => {
  context.locals.i18n = i18nLocals;
  return runWithLang(splitLangPath(context.url.pathname).lang, () => next());
};
