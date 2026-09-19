/**
 * generic_data.vdata + misc.vdata → economy.json(試合ルール・ソウル関連の定数)
 *
 * misc.vdata を読むのは不安定な裂け目のカムバック補正のためだけ
 * (citadel_koth_cashin)。公式パッチノートの General 節はここの値をよく動かすが、
 * ヒーローにもアイテムにも属さないので、他の全体調整と同じく economy.json に集める。
 */

import type { Kv3Value } from "./kv3.ts";
import { readVdata, num } from "./vdata.ts";
import { arr, obj, str } from "./properties.ts";
import type {
  EconomyFile,
  LaneInfo,
  ObjectiveGold,
  BreakableSpawnTime,
  RiftComeback,
} from "../types/economy.ts";

/**
 * 値が無いときに 0 ではなく null を返す num。
 * 方式が変わってフィールドごと消えることがあるため、「無い」と「0」を区別する。
 */
function optNum(v: Kv3Value | undefined): number | null {
  return v === undefined ? null : num(v);
}

function parseColor(v: Kv3Value | undefined): [number, number, number] | null {
  const a = arr(v);
  if (a.length < 3) return null;
  return [num(a[0]), num(a[1]), num(a[2])];
}

function parseLanes(g: ReturnType<typeof readVdata>): LaneInfo[] {
  return arr(g["m_LaneInfo"]).map((raw) => {
    const e = obj(raw);
    return {
      name: str(e["m_strLaneName"]) ?? "",
      cssClass: str(e["m_strCSSClass"]),
      color: parseColor(e["m_Color"]),
    };
  });
}

/** m_ObjectiveParams のキー→objectiveGold の key。ラベルはサイト側(src/lib)で付ける */
const OBJECTIVE_KEYS: Record<string, string> = {
  Tier1: "m_nTier1Gold",
  Tier2: "m_nTier2Gold",
  BaseGuardians: "m_nBaseGuardiansGold",
  Shrines: "m_nShrinesGold",
  PatronPhase1: "m_nPatronPhase1Gold",
};

function parseObjectiveGold(g: ReturnType<typeof readVdata>): ObjectiveGold[] {
  const p = obj(g["m_ObjectiveParams"]);
  return Object.entries(OBJECTIVE_KEYS).map(([key, prefix]) => ({
    key,
    goldKill: num(p[`${prefix}Kill`]),
    goldOrbs: num(p[`${prefix}Orbs`]),
  }));
}

/** 建造物破壊ソウルのうち、近くのプレイヤーへの配分割合(%)。残りはチーム全体で均等 */
function parseObjectiveGoldNearPlayerSplitPct(g: ReturnType<typeof readVdata>): number {
  return num(obj(g["m_ObjectiveParams"])["m_NearPlayerSplitPct"]);
}

function parseFloatArray(v: Kv3Value | undefined): number[] {
  return arr(v).map((x) => num(x));
}

/** 破壊可能オブジェクトの出現時間。2026-09-16 で追加されたので、古い版には丸ごと無い */
function parseBreakableSpawnTimes(g: ReturnType<typeof readVdata>): BreakableSpawnTime[] {
  return arr(g["m_BreakableSpawnTimeDesc"]).map((raw) => {
    const e = obj(raw);
    return {
      initialSpawnTime: num(e["m_flInitialSpawnTime"]),
      respawnInterval: num(e["m_flRespawnInterval"]),
    };
  });
}

/**
 * 不安定な裂け目の劣勢側補正。misc.vdata の citadel_koth_cashin にある。
 * 耐性はオーラ経由で配られるので、m_ComebackAuraModifier の中の modifier まで降りる。
 */
function parseRiftComeback(misc: ReturnType<typeof readVdata>): RiftComeback {
  const koth = obj(misc["citadel_koth_cashin"]);
  const resist = obj(obj(koth["m_ComebackAuraModifier"])["m_modifierProvidedByAura"]);
  return {
    bounty: optNum(koth["m_iComebackBounty"]),
    techResist: optNum(resist["m_flTechResist"]),
    bulletResist: optNum(resist["m_flBulletResist"]),
    statusResist: optNum(resist["m_flStatusResist"]),
    resistMaxAtStart: optNum(resist["m_flResistMaxAtStart"]),
    resistMaxPerMinute: optNum(resist["m_flResistMaxPerMinute"]),
    resistMaxCap: optNum(resist["m_flResistMaxCap"]),
  };
}

export function parseEconomy(
  genericDataPath: string,
  miscPath: string,
  upstreamCommit: string,
): EconomyFile {
  const g = readVdata(genericDataPath);
  const misc = readVdata(miscPath);
  const rejuv = obj(g["m_RejuvParams"]);

  return {
    schemaVersion: 1,
    upstreamCommit,
    generatedAt: new Date().toISOString(),
    lanes: parseLanes(g),
    objectiveGold: parseObjectiveGold(g),
    trooperKillGoldShareFrac: parseFloatArray(g["m_flTrooperKillGoldShareFrac"]),
    heroKillGoldShareFrac: parseFloatArray(g["m_flHeroKillGoldShareFrac"]),
    objectiveGoldNearPlayerSplitPct: parseObjectiveGoldNearPlayerSplitPct(g),
    rejuv: {
      buffDuration: num(rejuv["m_flRejuvinatorBuffDuration"]),
      expirationWarningTiming: num(rejuv["m_flRejuvinatorExpirationWarningTiming"]),
      trooperHealthMult: parseFloatArray(rejuv["m_TrooperHealthMult"]),
      playerRespawnMult: parseFloatArray(rejuv["m_PlayerRespawnMult"]),
    },
    breakableSpawnTimes: parseBreakableSpawnTimes(g),
    riftComeback: parseRiftComeback(misc),
  };
}
