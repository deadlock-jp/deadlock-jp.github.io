/**
 * UI 文言の辞書の入口。
 *
 * 辞書は src/i18n/ui/<lang>.ts。日本語(ja.ts)が原本で、ほかの言語は
 * `Dict`(= ja の型)を満たす必要がある。キーの抜けは npm run typecheck で分かる。
 * ゲームのローカライズで引ける語は辞書に書かず、src/i18n/terms.ts の term() で引く。
 */
import { currentLang } from "./context.ts";
import type { Lang } from "./langs.ts";
import { ja, type Dict } from "./ui/ja.ts";
import { en } from "./ui/en.ts";
import { ko } from "./ui/ko.ts";
import { zhCn } from "./ui/zh-cn.ts";

const DICTS: Record<Lang, Dict> = { ja, en, ko, "zh-cn": zhCn };

/** その言語の辞書(引数を省くといま描いているページの言語) */
export function L(lang: Lang = currentLang()): Dict {
  return DICTS[lang];
}

/** "{n}件" のような置き換え付き文字列を埋める(クライアント側と同じ書式) */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type { Dict };
export { term } from "./terms.ts";
export { t } from "./game.ts";
export { currentLang } from "./context.ts";
export { langPath, isJaOnlyFrom, isLocalizedPath, splitLangPath } from "./routes.ts";
export { LANGS, LANG_META, BUILT_LANGS, PREFIXED_LANGS, type Lang } from "./langs.ts";
