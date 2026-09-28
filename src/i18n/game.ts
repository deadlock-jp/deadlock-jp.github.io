/**
 * ゲーム本体のローカライズ(data/localization/<lang>.json)を引く。
 *
 * 訳文はゲーム本体から取り出したものをそのまま使い、こちらで訳し直さない。
 * その言語に無いトークンは英語、それも無ければフォールバックに落とす
 * (日本語でも同じ。日本語が用意されていないトークンが約100件ある)。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LocalizationFile } from "../types/localization.ts";
import { LANG_META, type Lang, type LangMeta } from "./langs.ts";
import { currentLang } from "./context.ts";

// import.meta.url ではなく process.cwd() を基準にする(src/lib/data.ts と同じ理由。
// Astro のビルドでこのモジュールは dist/.prerender/chunks/ 以下へ移される)
const LOCALIZATION_DIR = join(process.cwd(), "data", "localization");

const files = new Map<LangMeta["gameLang"], LocalizationFile>();

/** 1言語ぶんのローカライズ。初めて使うときに読む */
export function localizationFile(gameLang: LangMeta["gameLang"]): LocalizationFile {
  let f = files.get(gameLang);
  if (!f) {
    f = JSON.parse(readFileSync(join(LOCALIZATION_DIR, `${gameLang}.json`), "utf8")) as LocalizationFile;
    files.set(gameLang, f);
  }
  return f;
}

/** その言語のローカライズ(引数を省くといま描いているページの言語) */
export function gameLocalization(lang: Lang = currentLang()): LocalizationFile {
  return localizationFile(LANG_META[lang].gameLang);
}

/**
 * トークンID から表示テキストを引く。
 * その言語 → 英語 → フォールバックの順。lang を省くといま描いているページの言語
 * (描画の外では日本語)。
 */
export function t(token: string, fallback = "", lang: Lang = currentLang()): string {
  return (
    gameLocalization(lang).tokens[token]?.text ?? localizationFile("english").tokens[token]?.text ?? fallback
  );
}
