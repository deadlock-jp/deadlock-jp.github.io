/**
 * サイトマップ。ヒーロー・アイテム・スキル・アップデートの詳細ページを含む全 URL を列挙する。
 * @astrojs/sitemap を足すと devDependency が増えて CI が遅くなるので自前で出す。
 * trailingSlash: "always" なので URL はすべて末尾スラッシュ付き。
 *
 * lastmod はページごとに出す。アップデートのページはその投稿日、それ以外は
 * データの生成日。全URLを同じ日付にすると、実際には動いていないページまで
 * 「更新された」と伝えることになる。
 */
import type { APIRoute } from "astro";
import { releasedHeroes, shopItems, itemsFile, ability, patchNotes } from "../lib/data.ts";

/**
 * スキル詳細ページが生成される実ID。src/pages/abilities/[id].astro の
 * getStaticPaths と同じ条件(実装済みヒーローの Signature スロット + 変身後の形態)。
 * あちらは Astro のバンドルの都合で関数を外に出せないため、条件はここに再掲する。
 */
function abilityIds(): string[] {
  const ids = new Set<string>();
  for (const hero of releasedHeroes()) {
    for (const a of hero.abilities) {
      if (a.slot.startsWith("Signature")) ids.add(a.abilityKey);
    }
    const transform = hero.abilities
      .map((a) => ability(a.abilityKey))
      .find((ab) => !!ab?.alternateFormAbilities);
    for (const [slot, key] of Object.entries(transform?.alternateFormAbilities ?? {})) {
      if (slot.startsWith("Signature")) ids.add(key);
    }
  }
  return [...ids];
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
    { loc: "/about/", priority: "0.3", lastmod: dataDate },
    ...releasedHeroes().map((h) => ({ loc: `/heroes/${h.id}/`, priority: "0.7", lastmod: dataDate })),
    ...shopItems().map((i) => ({ loc: `/items/${i.id}/`, priority: "0.6", lastmod: dataDate })),
    ...abilityIds().map((id) => ({ loc: `/abilities/${id}/`, priority: "0.6", lastmod: dataDate })),
    ...patchNotes().map((n) => ({
      loc: `/patch-notes/${n.date}/`,
      priority: "0.7",
      lastmod: n.date,
    })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths
      .map(
        (p) =>
          `  <url><loc>${SITE}${p.loc}</loc>` +
          `<lastmod>${p.lastmod}</lastmod>` +
          `<priority>${p.priority}</priority></url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
