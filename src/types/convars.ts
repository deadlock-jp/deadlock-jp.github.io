/**
 * convars.json のスキーマ(src/parsers/convars.ts)。
 * GameTracking-Deadlock の DumpSource2/convars.txt から、サイトが使う convar だけを数値で持つ。
 */
export interface ConvarsFile {
  schemaVersion: number;
  /** 値を読んだダンプのクライアント版(steam.inf の ClientVersion) */
  sourceVersion: string;
  generatedAt: string;
  /** convar 名 → 既定値 */
  values: Record<string, number>;
  /** CONVAR_KEYS のうちダンプに見つからなかったもの(改名・削除の検知用) */
  missing: string[];
}
