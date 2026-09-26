/**
 * 「試合の流れ」(/mechanics/match/)の本文に埋め込む数値と、それを組み合わせた計算。
 *
 * 数値はすべてスナップショットから引く(CLAUDE.md ルール6)。
 * - convars.json … 初期ソウル・トルーパー報酬・ウェーブ間隔・ディナイ・裂け目など
 *   (GameTracking-Deadlock の convar ダンプ由来。src/parsers/convars.ts)
 * - economy.json … 建造物報酬・分配率・キャンプ/箱/パワーアップの出現時刻
 * - objects.json … 中立モンスター・罪人の生贄の報酬
 * - heroes.json / items.json / abilities.json … レベル表・アイテム価格・パリィ
 *
 * 「1ウェーブで800を超える」のような結論も、ここで計算して出す。パッチで数値が
 * 変われば結論も自動で変わる。convars.json が無い版では null を返し、ページ側は
 * その文を出さない(推測で埋めない)。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abilitiesFile, heroesFile, itemsFile, releasedHeroes } from "./data.ts";
import type { EconomyFile } from "../types/economy.ts";
import type { ConvarsFile } from "../types/convars.ts";
import type { MapFile } from "../types/map.ts";

const DATA_DIR = join(process.cwd(), "data");
const version = JSON.parse(readFileSync(join(DATA_DIR, "latest.json"), "utf8")).version as string;
const snap = (name: string): string => join(DATA_DIR, "snapshots", version, name);

const economy = JSON.parse(readFileSync(snap("economy.json"), "utf8")) as EconomyFile;
const convarsFile: ConvarsFile | null = existsSync(snap("convars.json"))
  ? (JSON.parse(readFileSync(snap("convars.json"), "utf8")) as ConvarsFile)
  : null;
const objectsFile = JSON.parse(readFileSync(snap("objects.json"), "utf8")) as {
  objects: Record<string, { stats: Record<string, number> }>;
};

/** convar の値。無ければ null */
function cv(name: string): number | null {
  return convarsFile?.values[name] ?? null;
}

const round = (n: number): number => Math.round(n);

/**
 * 地下トンネル(レム・モー＆クリル・キャリコだけが入れる)の箱が属する出現グループ。
 * ゲームデータは出現グループに名前を持たないので、公式ノートで対応を確かめている:
 * 2026-09-16 のノート「Breakables in the underground tunnels initial spawn time increased
 * from 3m to 5m / respawn rate increased from 3m to 5m」と、economy.json の
 * breakableSpawnTimes[1](初回300秒・再出現300秒)が一致する。配置もこのグループだけが
 * 地面より深い場所に集まっている(map.json)。
 */
export const TUNNEL_BREAKABLE_GROUP = 1;

/** 4回目のアビリティ解放(=アルティメット)が来るレベルと、そこまでに稼ぐソウル */
function ultimateUnlock(): { level: number; earnedGold: number } | null {
  const hero = releasedHeroes()[0] ?? Object.values(heroesFile.heroes)[0];
  if (!hero) return null;
  let unlocks = 0;
  for (const l of hero.levels) {
    unlocks += (l as { bonusCurrencies?: Record<string, number> }).bonusCurrencies?.EAbilityUnlocks ?? 0;
    if (unlocks >= 4) return { level: l.level, earnedGold: l.requiredGold };
  }
  return null;
}

function camp(key: string) {
  const c = economy.campSpawnTimes.find((x) => x.key === key);
  return c ? { initial: c.initialSpawnSeconds, interval: c.respawnIntervalSeconds, change: c.intervalChangeSeconds, min: c.intervalMinSeconds } : null;
}

function objReward(id: string): { gold: number; growthPct: number } | null {
  const s = objectsFile.objects[id]?.stats;
  if (!s || s.goldReward === undefined) return null;
  return { gold: s.goldReward, growthPct: s.goldRewardBonusPercentPerMinute ?? 0 };
}

export interface MatchFlow {
  /** convar の元になったダンプの版(convars.json が無ければ null) */
  convarVersion: string | null;
  startingGold: number | null;
  firstKillBonus: number | null;
  trooper: {
    gold: number;
    goldPerMinute: number;
    /** 倒した瞬間に入る割合(残りは浮き上がるソウルオーブ) */
    instantRatio: number;
    squadSize: number;
    firstWaveSeconds: number | null;
    intervalEarly: number;
    intervalLate: number;
    intervalLateMinutes: number;
    intervalVeryLate: number;
    intervalVeryLateMinutes: number;
  } | null;
  /** キルに絡んだ人数ごとの分配率(添字0が1人) */
  trooperShare: number[];
  deny: { denierPct: number; deniedPct: number } | null;
  /** 2人レーンで最初のウェーブから入るソウル(ディナイなし / オーブを全部ディナイされた場合) */
  firstWave: {
    shareDuo: number;
    full: number;
    allDenied: number;
    afterFull: number;
    afterAllDenied: number;
  } | null;
  tier1Price: number;
  /** レーン中の買い物の節目(ティア1アイテムの価格の倍数) */
  buySteps: number[];
  ultimate: { level: number; earnedGold: number; totalGold: number | null } | null;
  parry: { stunSeconds: number | null; bossNoMeleeSeconds: number | null };
  objectives: { key: string; gold: number }[];
  objectiveNearPlayerPct: number;
  camps: {
    weak: ReturnType<typeof camp>;
    medium: ReturnType<typeof camp>;
    strong: ReturnType<typeof camp>;
    vaults: ReturnType<typeof camp>;
    midboss: ReturnType<typeof camp>;
  };
  neutralReward: {
    weak: ReturnType<typeof objReward>;
    normal: ReturnType<typeof objReward>;
    strong: ReturnType<typeof objReward>;
    vault: ReturnType<typeof objReward>;
  };
  breakable: {
    firstSeconds: number | null;
    respawnSeconds: number | null;
    dropChancePct: number | null;
    gold: number | null;
    goldPerMinute: number | null;
  };
  powerup: { initial: number | null; interval: number | null };
  tickGoldStartSeconds: number | null;
  rift: { initial: number; interval: number; rewardBase: number } | null;
  urnOrbs: number | null;
  /** カムバック(劣勢側への補正)のうち convar で分かるもの */
  comeback: { redirectPct: number | null; tickStartSeconds: number | null; lowestPct: number | null; secondLowestPct: number | null };
  /** 地下トンネル(3人専用)の箱。map.json が無い版は null */
  tunnel: { crates: number; statues: number; firstSeconds: number | null; respawnSeconds: number | null } | null;
  /** 経過時間ごとのトルーパー1ウェーブ(全員分)のソウル */
  waveByMinute: { minute: number; perTrooper: number; perWave: number }[];
}

export function matchFlow(): MatchFlow {
  const startingGold = cv("citadel_player_starting_gold");
  const tg = cv("citadel_trooper_gold_reward");
  const trooper =
    tg !== null
      ? {
          gold: tg,
          goldPerMinute: cv("citadel_trooper_gold_reward_bonus_per_minute") ?? 0,
          instantRatio: cv("citadel_trooper_instant_gold_ratio_laning") ?? 0,
          squadSize: cv("citadel_trooper_squad_size") ?? 0,
          firstWaveSeconds: cv("citadel_trooper_spawn_initial"),
          intervalEarly: cv("citadel_trooper_spawn_interval_early") ?? 0,
          intervalLate: cv("citadel_trooper_spawn_interval_late") ?? 0,
          intervalLateMinutes: cv("citadel_trooper_spawn_interval_late_time") ?? 0,
          intervalVeryLate: cv("citadel_trooper_spawn_interval_very_late") ?? 0,
          intervalVeryLateMinutes: cv("citadel_trooper_spawn_interval_very_late_time") ?? 0,
        }
      : null;
  const trooperShare = economy.trooperKillGoldShareFrac;
  const denier = cv("citadel_deny_denier_percentage");
  const denied = cv("citadel_deny_denied_percentage");
  const deny = denier !== null && denied !== null ? { denierPct: round(denier * 100), deniedPct: round(denied * 100) } : null;

  const tier1Price = itemsFile.itemPricePerTier[1] ?? 0;

  // 2人レーン: 近くにいる2人で分ける。オーブ分も同じ割合で入るものとして計算する
  let firstWave: MatchFlow["firstWave"] = null;
  if (trooper && startingGold !== null && trooperShare[1] !== undefined) {
    const shareDuo = trooperShare[1];
    const full = round(trooper.squadSize * trooper.gold * shareDuo);
    const allDenied = round(trooper.squadSize * trooper.gold * trooper.instantRatio * shareDuo);
    firstWave = { shareDuo, full, allDenied, afterFull: startingGold + full, afterAllDenied: startingGold + allDenied };
  }

  const ult = ultimateUnlock();
  const parryAbility = abilitiesFile.abilities["citadel_ability_melee_parry"];

  // 地上の箱(グループ0)。トンネルの箱は tunnel に分ける
  const breakFirst = economy.breakableSpawnTimes[0]?.initialSpawnTime ?? null;
  const breakRespawn = economy.breakableSpawnTimes[0]?.respawnInterval ?? null;

  const riftInitial = cv("citadel_koth_spawn_initial_delay");
  const riftInterval = cv("citadel_koth_respawn_interval");
  const riftBase = cv("citadel_koth_reward_base");

  return {
    convarVersion: convarsFile?.sourceVersion ?? null,
    startingGold,
    firstKillBonus: cv("citadel_player_gold_reward_first_kill_bonus"),
    trooper,
    trooperShare,
    deny,
    firstWave,
    tier1Price,
    buySteps: [1, 2, 3, 4].map((n) => n * tier1Price),
    ultimate: ult ? { ...ult, totalGold: startingGold !== null ? startingGold + ult.earnedGold : null } : null,
    parry: {
      stunSeconds: parryAbility?.properties["ParriedStunTime"]?.value ?? null,
      bossNoMeleeSeconds: parryAbility?.parryBoss?.noMeleeTime ?? null,
    },
    objectives: economy.objectiveGold.map((o) => ({ key: o.key, gold: o.goldKill })),
    objectiveNearPlayerPct: economy.objectiveGoldNearPlayerSplitPct,
    camps: {
      weak: camp("weak"),
      medium: camp("medium"),
      strong: camp("strong"),
      vaults: camp("vaults"),
      midboss: camp("midboss"),
    },
    neutralReward: {
      weak: objReward("neutral_trooper_weak"),
      normal: objReward("neutral_trooper_normal"),
      strong: objReward("neutral_trooper_strong"),
      vault: objReward("neutral_sinners_sacrifice"),
    },
    breakable: {
      firstSeconds: breakFirst,
      respawnSeconds: breakRespawn,
      dropChancePct: economy.breakableGold?.dropChancePct ?? null,
      gold: economy.breakableGold?.goldAmount ?? null,
      goldPerMinute: economy.breakableGold?.goldPerMinute ?? null,
    },
    powerup: {
      initial: economy.powerupSpawn?.initialSpawnSeconds ?? null,
      interval: economy.powerupSpawn?.respawnIntervalSeconds ?? null,
    },
    tickGoldStartSeconds: cv("citadel_tick_gold_start_time"),
    rift: riftInitial !== null && riftInterval !== null && riftBase !== null
      ? { initial: riftInitial, interval: riftInterval, rewardBase: riftBase }
      : null,
    urnOrbs: cv("citadel_idol_orbs_to_spawn"),
    comeback: {
      redirectPct: (() => { const v = cv("citadel_comeback_redirect_fraction"); return v === null ? null : round(v * 100); })(),
      tickStartSeconds: cv("citadel_tick_gold_start_time"),
      lowestPct: (() => { const v = cv("citadel_tick_gold_payout_for_lowest"); return v === null ? null : Math.round(v * 1000) / 10; })(),
      secondLowestPct: (() => { const v = cv("citadel_tick_gold_payout_for_second_lowest"); return v === null ? null : Math.round(v * 1000) / 10; })(),
    },
    tunnel: (() => {
      if (!existsSync(snap("map.json"))) return null;
      const map = JSON.parse(readFileSync(snap("map.json"), "utf8")) as MapFile;
      const inTunnel = map.breakables.filter((b) => b.group === TUNNEL_BREAKABLE_GROUP);
      const t = economy.breakableSpawnTimes[TUNNEL_BREAKABLE_GROUP];
      return {
        crates: inTunnel.filter((b) => b.kind === "crate").length,
        statues: inTunnel.filter((b) => b.kind === "statue").length,
        firstSeconds: t?.initialSpawnTime ?? null,
        respawnSeconds: t?.respawnInterval ?? null,
      };
    })(),
    waveByMinute: trooper
      ? [0, 10, 20, 30].map((minute) => {
          const perTrooper = trooper.gold + trooper.goldPerMinute * minute;
          return { minute, perTrooper, perWave: perTrooper * trooper.squadSize };
        })
      : [],
  };
}

/** 秒を「2:00」「12:00」の形にする */
export function clock(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 秒を「85秒」「5分」「4分50秒」の形にする */
export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s === 0 ? `${m}分` : `${m}分${s}秒`;
}
