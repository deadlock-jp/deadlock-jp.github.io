/** ローカライズファイルのスキーマ定義 */

export interface LocalizedToken {
  /** 表示テキスト。HTMLタグ(<span class="highlight"> など)を含むことがある */
  text: string;
  /** 取得元のファイルグループ(citadel_gc_mod_names など)。更新時の再読み込みに使う */
  group: string;
  /**
   * text の短いハッシュ。
   * 日本語の対訳辞書(data/i18n/ja.json)は翻訳時のこの値を保持し、
   * 更新でハッシュが変われば「要再翻訳」として自動検出する。
   */
  hash: string;
}

export interface LocalizationFile {
  schemaVersion: number;
  /**
   * どの版から作ったか。data/localization/<lang>.json(常に最新版の1セット)に
   * パーサーが書き足す(src/parsers/main.ts の writeLocalizations)
   */
  clientVersion?: string;
  upstreamCommit: string;
  generatedAt: string;
  /** english / japanese など */
  language: string;
  /** グループごとのトークン数 */
  groupCounts: Record<string, number>;
  /** キーはトークンID */
  tokens: Record<string, LocalizedToken>;
}
