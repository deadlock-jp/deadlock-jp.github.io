/**
 * ページの言語を URL の接頭辞(/en/ /ko/ /zh-cn/)で決め、そのページの描画全体を
 * その言語の中で走らせる(src/i18n/context.ts)。静的ビルドでもページごとに通る。
 * .astro から使う i18n の関数は Astro.locals.i18n に載せる(理由は src/i18n/locals.ts)。
 *
 * 攻略ページ(日本語)は、描き終えた HTML に用語集への自動リンクを埋め込む(src/lib/glossaryLinks.ts)。
 */
import type { MiddlewareHandler } from "astro";
import { runWithLang } from "./i18n/context.ts";
import { splitLangPath } from "./i18n/routes.ts";
import { i18nLocals } from "./i18n/locals.ts";
import { GLOSSARY_LINK_PAGES, addGlossaryLinks } from "./lib/glossaryLinks.ts";

// tsc(types: node)は import.meta.env を知らないので、Astro が入れる値を型を絞って読む
const BASE = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/").replace(/\/$/, "");

export const onRequest: MiddlewareHandler = (context, next) => {
  context.locals.i18n = i18nLocals;
  const { lang, path } = splitLangPath(context.url.pathname.slice(BASE.length) || "/");
  return runWithLang(lang, async () => {
    const res = await next();
    if (lang !== "ja" || !GLOSSARY_LINK_PAGES.has(path) || !(res.headers.get("content-type") ?? "").includes("text/html")) {
      return res;
    }
    const { html } = addGlossaryLinks(await res.text(), BASE);
    return new Response(html, { status: res.status, headers: res.headers });
  });
};
