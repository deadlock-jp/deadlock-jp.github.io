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
 * Cloudflare Web Analytics のトークン。HTMLにそのまま出る公開値。
 *
 * このドメインはネームサーバーこそ Cloudflare だが、レコードはプロキシを通さない
 * DNSのみ(グレークラウド)で、配信は GitHub Pages が直接している
 * (レスポンスの Server が GitHub.com で cf-ray が付かない)。
 * Cloudflare の「自動インストール」はプロキシを通った応答にビーコンを差し込む
 * 仕組みなので、この構成では効かない。だからこのスニペットを自前で出す。
 *
 * 将来オレンジクラウド(プロキシ)に切り替えるなら、自動インストールと二重に
 * なって数字が膨らむので、そのときはここを空に戻すこと。
 *
 * 空のあいだは計測タグを一切出さない。Cookie を使わないので同意バナーは要らない。
 */
export const CF_BEACON_TOKEN = "09761cb7721343ce9631aeacc2453e81";

/**
 * Google Search Console の所有権確認用トークン。HTMLタグ方式の content の中身。
 *
 * 貼るのはトークン部分だけで、"google-site-verification=" の接頭辞は含めない
 * (接頭辞まで含んだ形は、ドメイン単位で確認するときのDNS TXTレコード用の書き方)。
 * 確認が済んだ後も外さないこと。定期的に再確認されるので、消すと所有権が外れる。
 */
export const GOOGLE_SITE_VERIFICATION = "_0Ob03SSbUXeNn3kvJsB7tsVm1Pcdft_uRLYQVX9ZDI";
