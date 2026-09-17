/** economy.json のスキーマ定義(generic_data.vdata の試合ルール・ソウル関連の定数) */

export interface LaneInfo {
  name: string;
  cssClass: string | null;
  color: [number, number, number] | null;
}

/** 建造物を破壊した際に直接入るソウル(キル報酬)。オーブでの分配分は別 */
export interface ObjectiveGold {
  key: string;
  goldKill: number;
  goldOrbs: number;
}

export interface RejuvParams {
  /** バフの持続時間(秒) */
  buffDuration: number;
  /** 消滅までの警告タイミング(秒) */
  expirationWarningTiming: number;
  /** ミッドボスの撃破回数に応じたトルーパーHP倍率(スタック段階ごと) */
  trooperHealthMult: number[];
  /** 保持中に倒された際のリスポーン時間倍率(スタック段階ごと) */
  playerRespawnMult: number[];
}

export interface EconomyFile {
  schemaVersion: number;
  upstreamCommit: string;
  generatedAt: string;
  lanes: LaneInfo[];
  objectiveGold: ObjectiveGold[];
  /** キルに絡んだ人数によるソウル分配率(添字0が1人、1が2人…) */
  trooperKillGoldShareFrac: number[];
  heroKillGoldShareFrac: number[];
  rejuv: RejuvParams;
}
