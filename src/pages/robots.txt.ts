/**
 * robots.txt。sitemap.xml.ts と同じく、ドメインを直書きしないために
 * public/ の静的ファイルではなくエンドポイントとして出す
 * (public/ に置くとそのままコピーされるので、site の値を参照できない)。
 */
import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  // site は astro.config.mjs の設定値。末尾スラッシュは足さない形に揃える
  const base = String(site).replace(/\/$/, "");
  return new Response(
    ["User-agent: *", "Allow: /", "", `Sitemap: ${base}/sitemap.xml`, ""].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
};
