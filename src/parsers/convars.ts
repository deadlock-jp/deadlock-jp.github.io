/**
 * convar(ゲームの設定変数) → convars.json
 *
 * 初期所持ソウル・トルーパーの報酬・ウェーブの間隔などは vdata ではなく convar にあり、
 * ゲームクライアントの pak からは取れない(DLL に埋め込まれている)。そこで
 * GameTracking-Deadlock の DumpSource2/convars.txt(SteamDB がビルドごとにダンプしたもの)
 * から、試合の流れのページが使うものだけを読む。
 *
 * どのクライアント版のダンプかを sourceVersion に残す。--local で取り込むとき、
 * GameTracking がまだ新しい版に追いついていないと古い値になるので、
 * その場合は main.ts が警告を出す(値を推測で埋めることはしない。CLAUDE.md ルール6)。
 *
 * convars.txt の1行は「名前 値 (フラグ…)」。説明文はその次の行にタブ始まりで続く。
 */

import { readFileSync } from "node:fs";
import type { ConvarsFile } from "../types/convars.ts";

/** 使う convar。ここに無いものは読まない(数千件あるうち、サイトが使うものだけ) */
export const CONVAR_KEYS = [
  // 初期所持・キル
  "citadel_player_starting_gold",
  "citadel_player_gold_reward_first_kill_bonus",
  "citadel_player_gold_reward_min",
  // レーンのトルーパー
  "citadel_trooper_gold_reward",
  "citadel_trooper_gold_reward_bonus_per_minute",
  "citadel_trooper_instant_gold_ratio_laning",
  "citadel_trooper_instant_gold_ratio_postlaning",
  "citadel_trooper_laning_gold_rules_end_time",
  "citadel_trooper_squad_size",
  "citadel_trooper_spawn_initial",
  "citadel_trooper_spawn_interval_early",
  "citadel_trooper_spawn_interval_late",
  "citadel_trooper_spawn_interval_late_time",
  "citadel_trooper_spawn_interval_very_late",
  "citadel_trooper_spawn_interval_very_late_time",
  // ディナイ(オーブの取り分。1 = 100%)
  "citadel_deny_denier_percentage",
  "citadel_deny_denied_percentage",
  // ティックゴールド(下位2人への補填)
  "citadel_tick_gold_start_time",
  "citadel_tick_gold_payout_for_lowest",
  "citadel_tick_gold_payout_for_second_lowest",
  // カムバック: 敵チーム平均を上回るプレイヤーのカムバック分のうち、下位2人のティックゴールドへ回す割合
  "citadel_comeback_redirect_fraction",
  // 不安定な裂け目(内部名 KOTH)
  "citadel_koth_spawn_initial_delay",
  "citadel_koth_respawn_interval",
  "citadel_koth_reward_base",
  "citadel_koth_reward_time_multiplier",
  // ソウルアーン(内部名 idol)
  "citadel_idol_orbs_to_spawn",
] as const;

export type ConvarKey = (typeof CONVAR_KEYS)[number];

export function parseConvars(convarsTxtPath: string, sourceVersion: string): ConvarsFile {
  const wanted = new Set<string>(CONVAR_KEYS);
  const values: Record<string, number> = {};
  for (const line of readFileSync(convarsTxtPath, "utf8").split(/\r?\n/)) {
    if (line.startsWith("\t")) continue; // 説明文の行
    const m = line.match(/^(\S+) (\S+) \(/);
    if (!m || !wanted.has(m[1])) continue;
    const v = Number(m[2]);
    if (Number.isFinite(v)) values[m[1]] = v;
  }
  const missing = CONVAR_KEYS.filter((k) => !(k in values));
  return {
    schemaVersion: 1,
    sourceVersion,
    generatedAt: new Date().toISOString(),
    values,
    missing,
  };
}
