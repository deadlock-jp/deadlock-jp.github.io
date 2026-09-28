/**
 * ローカライズファイル(Valve KeyValues形式) → data/localization/<lang>.json
 *
 *   "lang"
 *   {
 *     "Language"  "english"
 *     "Tokens"
 *     {
 *       "upgrade_clip_size"  "Extended Magazine"
 *     }
 *   }
 *
 * 英語版は GameTracking-Deadlock に含まれる。
 * 日本語版はリポジトリに無く、ゲーム本体のインストールフォルダ
 * (…/game/citadel/resource/localization/) にある *_japanese.txt を使う。
 * 形式は同じなので、同じパーサーでそのまま読める。
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { LocalizationFile, LocalizedToken } from "../types/localization.ts";

/**
 * 取り込むファイルグループ。
 * citadel_generated_vo(3MB のボイス字幕)と citadel_patch_notes は、
 * データベースとしての用途が無く、Valveの文章そのものなので取り込まない。
 */
export const LOCALIZATION_GROUPS = [
  "citadel_gc_hero_names", // ヒーロー名
  "citadel_gc_mod_names", // アイテム名
  "citadel_mods", // アイテム説明・数値ラベル
  "citadel_heroes", // スキル名・説明
  "citadel_attributes", // ステータス名・状態異常名
  "citadel_gc", // 各種UI
  "citadel_main", // UI文言
] as const;

/** 表示テキストの短いハッシュ。翻訳の陳腐化検出に使う */
export function textHash(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex").slice(0, 12);
}

/** ダブルクォート文字列を1つ読む。開始位置は開きクォート */
function readQuoted(s: string, start: number): { value: string; next: number } | null {
  if (s[start] !== '"') return null;
  let out = "";
  let i = start + 1;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") {
      const e = s[i + 1];
      i += 2;
      switch (e) {
        case "n": out += "\n"; break;
        case "t": out += "\t"; break;
        case "r": out += "\r"; break;
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        default: out += e ?? ""; break;
      }
      continue;
    }
    if (c === '"') return { value: out, next: i + 1 };
    // 生の改行が来たら文字列が閉じていない = 壊れた行なので打ち切る
    if (c === "\n") return null;
    out += c;
    i++;
  }
  return null;
}

/**
 * 1ファイルをパースして トークンID → テキスト を返す。
 * "Tokens" ブロックの中だけを見る。
 */
export function parseLocalizationText(source: string): {
  language: string;
  tokens: Map<string, string>;
} {
  // BOM除去
  const s = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const tokens = new Map<string, string>();
  let language = "";

  const tokensAt = s.indexOf('"Tokens"');
  // "Tokens" ブロックの開始波括弧
  const blockStart = tokensAt >= 0 ? s.indexOf("{", tokensAt) : -1;

  let i = 0;
  let depth = 0;
  while (i < s.length) {
    const c = s[i];

    // コメントを読み飛ばす
    if (c === "/" && s[i + 1] === "/") {
      const nl = s.indexOf("\n", i);
      i = nl < 0 ? s.length : nl + 1;
      continue;
    }
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      i++;
      // Tokens ブロックを抜けたら終了
      if (blockStart >= 0 && i > blockStart && depth === 0) break;
      continue;
    }
    if (c !== '"') {
      i++;
      continue;
    }

    const key = readQuoted(s, i);
    if (!key) {
      i++;
      continue;
    }
    // キーの後ろの空白を飛ばして値を読む
    let j = key.next;
    while (j < s.length && (s[j] === " " || s[j] === "\t")) j++;
    const val = readQuoted(s, j);
    if (!val) {
      i = key.next;
      continue;
    }

    if (key.value === "Language" && language === "") {
      language = val.value;
    } else if (blockStart >= 0 && i > blockStart) {
      // 検索用の重複トークンは持たない
      if (!key.value.endsWith("_search")) tokens.set(key.value, val.value);
    }
    i = val.next;
  }

  return { language, tokens };
}

/**
 * localization ディレクトリから指定言語のファイル群を読み込む。
 * ディレクトリ構成は <root>/<group>/<group>_<lang>.txt
 */
export function parseLocalization(
  localizationRoot: string,
  language: string,
  upstreamCommit: string,
): LocalizationFile {
  const tokens: Record<string, LocalizedToken> = {};
  const groupCounts: Record<string, number> = {};
  let detectedLanguage = language;

  for (const group of LOCALIZATION_GROUPS) {
    const path = join(localizationRoot, group, `${group}_${language}.txt`);
    if (!existsSync(path)) {
      groupCounts[group] = 0;
      continue;
    }
    const parsed = parseLocalizationText(readFileSync(path, "utf8"));
    if (parsed.language) detectedLanguage = parsed.language;
    let n = 0;
    for (const [id, text] of parsed.tokens) {
      // 先に読んだグループを優先する(重複トークンは稀だが順序を固定する)
      if (tokens[id]) continue;
      tokens[id] = { text, group, hash: textHash(text) };
      n++;
    }
    groupCounts[group] = n;
  }

  return {
    schemaVersion: 1,
    upstreamCommit,
    generatedAt: new Date().toISOString(),
    language: detectedLanguage,
    groupCounts,
    tokens,
  };
}
