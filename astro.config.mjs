// @ts-check
import { defineConfig } from "astro/config";

/*
 * GitHub Pages(組織サイト)用。
 *
 * 2026-09-14 に独自ドメイン deadlock-jpdb.com へ移行(Cloudflare Registrar + Cloudflare DNS)。
 * 配信自体は引き続き GitHub Pages で、public/CNAME がカスタムドメインを指定している。
 * リポジトリ名が deadlock-jp.github.io なのでルート配信のままであり、base は "/"。
 *
 * ここの site が canonical・OGP・sitemap の基点になる。
 * Base.astro と sitemap.xml.ts もこの値を参照しているので、ドメインを変えるときは
 * ここ1箇所と public/CNAME を直せばよい。
 */
/*
 * 多言語版のページ(src/pages/[lang]/)は、日本語版のページ実装を import して描く。
 * すると src/pages/index.astro などが2つのページから共有されるモジュールになり、
 * Rolldown がそのチャンクをディレクトリ名(pages / heroes / items / build)で命名するため、
 * 日本語版のページが読む CSS のファイル名が index.<hash>.css から変わってしまう(中身は同じ)。
 * 日本語版の出力を変えないよう、この4つだけ元の名前(index)に戻す。
 * それ以外は Astro の既定(_astro/[name].[hash][extname])と同じ。
 */
const SHARED_INDEX_PAGE_CHUNKS = new Set(["pages.css", "heroes.css", "items.css", "build.css"]);

export default defineConfig({
  site: "https://deadlock-jpdb.com",
  base: "/",
  trailingSlash: "always",
  build: { format: "directory" },
  vite: {
    build: {
      rolldownOptions: {
        output: {
          assetFileNames(assetInfo) {
            const name = assetInfo.names?.[0] ?? "";
            if (SHARED_INDEX_PAGE_CHUNKS.has(name)) return "_astro/index.[hash][extname]";
            if (name.includes("@_@astro")) return `_astro/${name.split("@_@astro")[0]}.[hash][extname]`;
            return "_astro/[name].[hash][extname]";
          },
        },
      },
    },
  },
});
