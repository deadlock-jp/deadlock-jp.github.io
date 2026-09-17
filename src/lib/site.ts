/**
 * サイト全体で使う外部サービスのIDと、計測まわりの設定。
 *
 * ここに置くのは「HTMLにそのまま出る公開値」だけ。秘密鍵の類は置かない
 * (静的サイトなので、ビルド結果に入る時点で公開値と同じ扱いになる)。
 * ドメインは astro.config.mjs の site が唯一の出どころなので、ここには書かない。
 */

/** Xのカードに発信元として出すアカウント。空なら twitter:site を出さない */
export const X_HANDLE = "@moromisocial";

/**
 * Cloudflare Web Analytics のトークン。
 *
 * 取得方法: Cloudflare にログイン → Web Analytics → Add a site で
 * deadlock-jpdb.com を登録すると、beacon の data-cf-beacon に入る
 * 32桁の16進文字列が発行される。それをそのまま貼る。
 * (Cloudflare のDNS配下に無くても、このビーコンを置くだけで計測できる)
 *
 * 空のあいだは計測タグを一切出さない。Cookie を使わないので同意バナーは要らない。
 */
export const CF_BEACON_TOKEN = "";

/**
 * Google Search Console の所有権確認用トークン。
 *
 * Search Console で「HTMLタグ」方式を選ぶと
 * <meta name="google-site-verification" content="..."> が案内されるので、
 * その content の中身だけを貼る。確認が済んだ後も外さないこと(再確認で失敗する)。
 */
export const GOOGLE_SITE_VERIFICATION = "";
