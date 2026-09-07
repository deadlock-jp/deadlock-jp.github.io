// @ts-check
import { defineConfig } from "astro/config";

/*
 * GitHub Pages(組織サイト)用。
 *
 * リポジトリ名が deadlock-jp.github.io なので、サブパスではなくルートで配信される。
 * そのため base は "/"。
 * 独自ドメインに移す場合も base は "/" のままで、site だけ差し替えればよい。
 */
export default defineConfig({
  site: "https://deadlock-jp.github.io",
  base: "/",
  trailingSlash: "always",
  build: { format: "directory" },
});
