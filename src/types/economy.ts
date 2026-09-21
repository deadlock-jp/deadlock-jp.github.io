/**
 * economy.json のスキーマ定義(試合ルール・ソウル関連の定数)。
 *
 * 出処は generic_data.vdata と misc.vdata の2つ。
 * riftComeback だけが misc.vdata(citadel_koth_cashin)由来で、残りは generic_data.vdata。
 */

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

/** 破壊可能オブジェクト(クレート)の出現時間。並びはゲーム側の定義順で、どの配置がどれかは名前を持たない */
export interface BreakableSpawnTime {
  /** 試合開始から初回出現までの秒数 */
  initialSpawnTime: number;
  /** 壊されてから再出現するまでの秒数 */
  respawnInterval: number;
}

/** ニュートラルキャンプの出現タイミング(misc.vdata の info_neutral_trooper_camp 派生) */
export interface CampSpawnTime {
  /** "weak" | "medium" | "strong" | "vaults" | "midboss" */
  key: string;
  /** 試合開始から初回出現までの秒数 */
  initialSpawnSeconds: number;
  /** 全滅させてから再出現するまでの秒数(初回の間隔。ミッドボスは撃破ごとに短くなる) */
  respawnIntervalSeconds: number;
  /** ミッドボスのみ: 撃破するたびに再出現間隔が変わる秒数(負値なら短縮)。他は常に0 */
  intervalChangeSeconds: number;
  /** ミッドボスのみ: 再出現間隔が短縮され続ける下限(秒)。他は0(下限なし) */
  intervalMinSeconds: number;
}

/**
 * 不安定な裂け目の、劣勢チームへの補正(misc.vdata の citadel_koth_cashin)。
 *
 * 2026-09-16 に方式が変わり、フィールドごと入れ替わった。どちらの方式の版も
 * 同じ形で持てるように、その版に無いものは null にする（0 で埋めると
 * 「一律耐性が35%から0%になった」という嘘の差分になる）。
 */
export interface RiftComeback {
  /** 劣勢なら付いていた定額のボーナス賞金(%)。2026-09-16 に廃止 */
  bounty: number | null;
  /** 旧方式の一律耐性(%)。スケール方式になって以降は null */
  techResist: number | null;
  bulletResist: number | null;
  statusResist: number | null;
  /** 新方式: 試合開始時点の耐性上限(%) */
  resistMaxAtStart: number | null;
  /** 新方式: 耐性上限の1分あたりの増加(%) */
  resistMaxPerMinute: number | null;
  /** 新方式: 耐性上限が頭打ちになる値(%) */
  resistMaxCap: number | null;
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
  /** 建造物破壊ソウルのうち、破壊に関わった近くのプレイヤーへ配られる割合(%)。残りはチーム全体に均等配分 */
  objectiveGoldNearPlayerSplitPct: number;
  rejuv: RejuvParams;
  /** 2026-09-16 に追加されたフィールド。それより前の版には無いので空配列になる */
  breakableSpawnTimes: BreakableSpawnTime[];
  riftComeback: RiftComeback;
  campSpawnTimes: CampSpawnTime[];
}
