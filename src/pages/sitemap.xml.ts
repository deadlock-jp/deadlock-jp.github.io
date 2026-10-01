/**
 * サイトマップ。ヒーロー・アイテム・スキル・アップデートの詳細ページを含む全 URL を列挙する。
 * @astrojs/sitemap を足すと devDependency が増えて CI が遅くなるので自前で出す。
 * trailingSlash: "always" なので URL はすべて末尾スラッシュ付き。
 *
 * lastmod はページごとに出す。アップデートのページはその投稿日、それ以外は
 * データの生成日。全URLを同じ日付にすると、実際には動いていないページまで
 * 「更新された」と伝えることになる。
 *
 * 多言語版は、検索に出す言語(src/lib/site.ts の INDEXED_LANGS)のぶんだけ載せ、
 * 言語版どうしを xhtml:link の alternate で結ぶ(src/i18n/seo.ts の alternatesFor)。
 * 検索に出す言語が日本語だけのあいだは、多言語版も alternate も出さない。
 */
import type { APIRoute } from "astro";
import { releasedHeroes, shopItems, legendaryItems, itemsFile, abilityOwners, patchNotes } from "../lib/data.ts";
import { BUILT_LANGS } from "../i18n/langs.ts";
import { langPath, isLocalizedPath } from "../i18n/routes.ts";
import { alternatesFor, isIndexed } from "../i18n/seo.ts";

/** スキル詳細ページが生成される実ID(src/pages/abilities/[id].astro と同じ) */
function abilityIds(): string[] {
  return [...abilityOwners().keys()];
}

export const GET: APIRoute = ({ site }) => {
  /*
   * ドメインは astro.config.mjs の site から取る(ここに直書きしない)。
   * 直書きするとドメイン移行のたびに取りこぼす。末尾スラッシュは足さない形に揃える。
   */
  const SITE = String(site).replace(/\/$/, "");
  const dataDate = new Date(itemsFile.generatedAt || Date.now()).toISOString().slice(0, 10);

  const paths: { loc: string; priority: string; lastmod: string }[] = [
    { loc: "/", priority: "1.0", lastmod: dataDate },
    { loc: "/heroes/", priority: "0.9", lastmod: dataDate },
    { loc: "/items/", priority: "0.9", lastmod: dataDate },
    { loc: "/build/", priority: "0.8", lastmod: dataDate },
    { loc: "/patch-notes/", priority: "0.8", lastmod: patchNotes()[0]?.date ?? dataDate },
    { loc: "/mechanics/", priority: "0.7", lastmod: dataDate },
    { loc: "/mechanics/beginner/", priority: "0.8", lastmod: dataDate },
    { loc: "/mechanics/match/", priority: "0.8", lastmod: dataDate },
    { loc: "/mechanics/farm/", priority: "0.8", lastmod: dataDate },
    { loc: "/mechanics/objects/", priority: "0.7", lastmod: dataDate },
    { loc: "/mechanics/controls/", priority: "0.7", lastmod: dataDate },
  // 状態異常・効果は多言語(検索に出す ja / en)。用語集は日本語のみ
  { loc: "/mechanics/effects/", priority: "0.7", lastmod: dataDate },
  { loc: "/mechanics/glossary/", priority: "0.7", lastmod: dataDate },
    { loc: "/about/", priority: "0.3", lastmod: dataDate },
    ...releasedHeroes().map((h) => ({ loc: `/heroes/${h.id}/`, priority: "0.7", lastmod: dataDate })),
    ...shopItems().map((i) => ({ loc: `/items/${i.id}/`, priority: "0.6", lastmod: dataDate })),
    /*
     * レジェンダリーアイテム(ストリートブロール限定、tier===5)。items/[id].astro の
     * getStaticPaths は [...shopItems(), ...legendaryItems()] を使っており、
     * ページは実際に生成されているのにここに無く、sitemapから漏れていた。
     */
    ...legendaryItems().map((i) => ({ loc: `/items/${i.id}/`, priority: "0.5", lastmod: dataDate })),
    ...abilityIds().map((id) => ({ loc: `/abilities/${id}/`, priority: "0.6", lastmod: dataDate })),
    ...patchNotes().map((n) => ({
      loc: `/patch-notes/${n.date}/`,
      priority: "0.7",
      lastmod: n.date,
    })),
  ];

  /*
   * 多言語版。日本語版のパス1つにつき、検索に出す言語のぶんだけ URL を並べる。
   * 日本語のみのページ(攻略情報・パッチノート・about)は日本語版だけ。
   */
  const otherLangs = BUILT_LANGS.filter((l) => l !== "ja" && isIndexed(l));
  const entries = paths.flatMap((p) => [
    { ...p, alternates: alternatesFor(p.loc) },
    ...(isLocalizedPath(p.loc)
      ? otherLangs.map((lang) => ({ ...p, loc: langPath(p.loc, lang), alternates: alternatesFor(p.loc) }))
      : []),
  ]);
  const hasAlternates = entries.some((e) => e.alternates.length > 0);

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    (hasAlternates
      ? `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`
      : `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`) +
    entries
      .map(
        (p) =>
          `  <url><loc>${SITE}${p.loc}</loc>` +
          p.alternates
            .map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${SITE}${a.path}"/>`)
            .join("") +
          `<lastmod>${p.lastmod}</lastmod>` +
          `<priority>${p.priority}</priority></url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
