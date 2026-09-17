/** generic_data.vdata → economy.json(試合ルール・ソウル関連の定数) */

import type { Kv3Value } from "./kv3.ts";
import { readVdata, num } from "./vdata.ts";
import { arr, obj, str } from "./properties.ts";
import type { EconomyFile, LaneInfo, ObjectiveGold } from "../types/economy.ts";

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

function parseFloatArray(v: Kv3Value | undefined): number[] {
  return arr(v).map((x) => num(x));
}

export function parseEconomy(genericDataPath: string, upstreamCommit: string): EconomyFile {
  const g = readVdata(genericDataPath);
  const rejuv = obj(g["m_RejuvParams"]);

  return {
    schemaVersion: 1,
    upstreamCommit,
    generatedAt: new Date().toISOString(),
    lanes: parseLanes(g),
    objectiveGold: parseObjectiveGold(g),
    trooperKillGoldShareFrac: parseFloatArray(g["m_flTrooperKillGoldShareFrac"]),
    heroKillGoldShareFrac: parseFloatArray(g["m_flHeroKillGoldShareFrac"]),
    rejuv: {
      buffDuration: num(rejuv["m_flRejuvinatorBuffDuration"]),
      expirationWarningTiming: num(rejuv["m_flRejuvinatorExpirationWarningTiming"]),
      trooperHealthMult: parseFloatArray(rejuv["m_TrooperHealthMult"]),
      playerRespawnMult: parseFloatArray(rejuv["m_PlayerRespawnMult"]),
    },
  };
}
