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
export default defineConfig({
  site: "https://deadlock-jpdb.com",
  base: "/",
  trailingSlash: "always",
  build: { format: "directory" },
});
