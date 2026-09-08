/**
 * サイトマップ。ヒーロー・アイテムの詳細ページを含む全 URL を列挙する。
 * @astrojs/sitemap を足すと devDependency が増えて CI が遅くなるので自前で出す。
 * trailingSlash: "always" なので URL はすべて末尾スラッシュ付き。
 */
import type { APIRoute } from "astro";
import { releasedHeroes, shopItems, itemsFile } from "../lib/data.ts";

const SITE = "https://deadlock-jp.github.io";

export const GET: APIRoute = () => {
  const lastmod = new Date(itemsFile.generatedAt || Date.now()).toISOString().slice(0, 10);

  const paths: { loc: string; priority: string }[] = [
    { loc: "/", priority: "1.0" },
    { loc: "/heroes/", priority: "0.9" },
    { loc: "/items/", priority: "0.9" },
    { loc: "/build/", priority: "0.8" },
    { loc: "/about/", priority: "0.3" },
    ...releasedHeroes().map((h) => ({ loc: `/heroes/${h.id}/`, priority: "0.7" })),
    ...shopItems().map((i) => ({ loc: `/items/${i.id}/`, priority: "0.6" })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths
      .map(
        (p) =>
          `  <url><loc>${SITE}${p.loc}</loc>` +
          `<lastmod>${lastmod}</lastmod>` +
          `<priority>${p.priority}</priority></url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
