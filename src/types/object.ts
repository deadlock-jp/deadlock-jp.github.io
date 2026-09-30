/** objects.json のスキーマ定義(タレット・ガーディアン・中立キャンプ等) */

/** npc_units.vdata 上のキー文字列が実ID */
export type GameObjectId = string;

export interface GameObject {
  id: GameObjectId;
  /**
   * Valve側の分類(_class)。npc_trooper / npc_barrack_boss / npc_boss_tier2 など。
   * サイト側のカテゴリ分けはこの値を使う。こちらで独自の分類を作らない。
   */
  className: string | null;
  /** 継承元(_base)。null なら継承なし */
  baseKey: GameObjectId | null;
  /**
   * 数値パラメータ。キーは m_flMaxHealth → maxHealth のように
   * m_ とハンガリアン接頭辞を外したもの。
   */
  stats: Record<string, number>;
  /** 真偽値パラメータ。キーの変換規則は stats と同じ */
  flags: Record<string, boolean>;
  /**
   * ゲーム内の表示名トークン(m_sLocUnitName から先頭の # を除いたもの。例: neutral_specimens_1)。
   * 6712(2026-09-29)のホーントから入った。持たないオブジェクトは null
   */
  nameToken?: string | null;
  /** ゲーム内のユニットアイコン(m_strCustomUnitIcon。file://{images}/... の参照)。無ければ null */
  icon?: string | null;
  /** 中立の強さ(m_eNeutralType。NEUTRAL_NPC_WEAK / _NORMAL / _STRONG)。中立以外は null */
  neutralType?: string | null;
}

export interface ObjectsFile {
  schemaVersion: number;
  upstreamCommit: string;
  generatedAt: string;
  objects: Record<GameObjectId, GameObject>;
}
