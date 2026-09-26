/**
 * レーン戦のソウル推移シナリオ(試合の流れ /mechanics/match/ のグラフ)。
 *
 * 報酬の額・出現時刻・分配率はすべてスナップショットの値(matchFlow / map.json)を使う。
 * 手で決めているのは「どう動いたか」という前提だけで、それは ASSUMPTIONS にまとめて
 * ページにもそのまま出す(推測の数値を事実のように見せない。CLAUDE.md ルール6)。
 *
 * ウェーブ・箱・キャンプは、処理にかかる時間(ASSUMPTIONS)をかけて少しずつ入るように描く。
 * 処理は1つずつ順番に行い、前の処理が終わるまで次には取りかからない。
 * ウェーブの到着はトルーパーの出現時刻とする(実際には移動時間ぶん後になる)。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { matchFlow } from "./matchFlow.ts";
import type { MapFile } from "../types/map.ts";

/** シナリオの前提(ゲームデータではなく、こちらで置いた想定) */
export const ASSUMPTIONS = {
  /** グラフの終わり。①はこの時刻にガーディアンを破壊する */
  endSeconds: 8 * 60,
  /** ②: 箱が出るたびに拾う、レーン沿いの箱の数 */
  laneCratesPerSpawn: 4,
  /** ①: ファーストブラッドを取る時刻 / ③: 取られる時刻 */
  firstBloodSeconds: 3 * 60,
  /** ③: ディナイされるオーブの割合 */
  deniedShare: 0.25,
  /** ウェーブが到着してから倒しきるまで(秒) */
  waveSeconds: 10,
  /** 箱1個を開けるのにかかる時間(秒) */
  crateSeconds: 1,
  /** 小キャンプを倒しきるまで(秒)。キル・ガーディアン破壊は一瞬で入る */
  campSeconds: 10,
} as const;

export interface ScenarioPoint {
  t: number;
  total: number;
  /** その時点で起きたこと(グラフの注記用) */
  note?: string;
}

export interface Scenario {
  key: "ideal" | "basic" | "behind";
  heroKey: string;
  title: string;
  summary: string;
  points: ScenarioPoint[];
  final: number;
  /** 800の倍数・アルティメット解放に届いた時刻(届かなければ null) */
  milestones: { gold: number; t: number | null }[];
}

const DATA_DIR = join(process.cwd(), "data");

function weakCampUnits(): number | null {
  const v = JSON.parse(readFileSync(join(DATA_DIR, "latest.json"), "utf8")).version as string;
  const path = join(DATA_DIR, "snapshots", v, "map.json");
  if (!existsSync(path)) return null;
  const map = JSON.parse(readFileSync(path, "utf8")) as MapFile;
  const weak = map.camps.filter((c) => c.type === "weak");
  if (weak.length === 0) return null;
  // 小キャンプはどれも同じ体数(違えば最小に寄せる)
  return Math.min(...weak.map((c) => c.units));
}

export function laneScenarios(): Scenario[] | null {
  const f = matchFlow();
  const tr = f.trooper;
  if (!tr || f.startingGold === null || !f.firstWave) return null;
  const A = ASSUMPTIONS;
  const share = f.firstWave.shareDuo;
  const minute = (t: number) => t / 60;
  const perTrooper = (t: number) => tr.gold + tr.goldPerMinute * minute(t);
  const waveGold = (t: number, keep = 1) => tr.squadSize * perTrooper(t) * share * keep;

  // ウェーブの出現時刻(序盤は一定間隔)
  const waves: number[] = [];
  for (let t = tr.firstWaveSeconds ?? 0; t <= A.endSeconds; t += tr.intervalEarly) waves.push(t);

  // 小キャンプ: 出現してすぐ倒し、倒した時点から再出現を待つ
  const units = weakCampUnits();
  const weak = f.camps.weak;
  const weakReward = f.neutralReward.weak;
  const campTimes: number[] = [];
  if (weak && units) for (let t = weak.initial; t <= A.endSeconds; t += weak.interval) campTimes.push(t);
  const campGold = (t: number) => (units && weakReward ? units * weakReward.gold * (1 + (weakReward.growthPct / 100) * minute(t)) : 0);

  // 箱: 地上の箱の出現ごとに、期待値(落とす確率 × 額)で数える
  const b = f.breakable;
  const crateTimes: number[] = [];
  if (b.firstSeconds !== null && b.respawnSeconds) for (let t = b.firstSeconds; t <= A.endSeconds; t += b.respawnSeconds) crateTimes.push(t);
  const crateGold = (t: number) =>
    b.gold !== null && b.dropChancePct !== null
      ? A.laneCratesPerSpawn * (b.dropChancePct / 100) * (b.gold + (b.goldPerMinute ?? 0) * minute(t))
      : 0;

  // ガーディアン: 近くのプレイヤー(レーンの2人)への配分 + チーム全体(6人)への均等配分
  const guardian = f.objectives.find((o) => o.key === "Tier1")?.gold ?? 0;
  const near = f.objectiveNearPlayerPct / 100;
  const guardianGold = guardian * near / 2 + (guardian * (1 - near)) / 6;

  const killGold = (f.heroKillMin ?? 0) + (f.firstKillBonus ?? 0);

  /** dur = 処理にかかる秒数(0 なら一瞬で入る) */
  type Ev = { t: number; gold: number; dur: number; note?: string };
  const build = (events: Ev[]): ScenarioPoint[] => {
    let total = f.startingGold!;
    let busy = 0;
    const pts: ScenarioPoint[] = [{ t: 0, total }];
    for (const e of [...events].sort((a, b) => a.t - b.t)) {
      // 処理中なら終わってから取りかかる(一瞬で入るものは待たない)
      const start = e.dur > 0 ? Math.max(e.t, busy) : e.t;
      pts.push({ t: start, total: Math.round(total) });
      total += e.gold;
      const end = start + e.dur;
      pts.push({ t: end, total: Math.round(total), note: e.note });
      if (e.dur > 0) busy = end;
    }
    pts.push({ t: Math.max(A.endSeconds, pts.at(-1)!.t), total: Math.round(total) });
    return pts;
  };

  const goals = [...f.buySteps, ...(f.ultimate?.totalGold ? [f.ultimate.totalGold] : [])];
  const finish = (s: Omit<Scenario, "final" | "milestones">): Scenario => {
    const final = s.points.at(-1)!.total;
    // 段の途中で届いた場合は、処理時間の中で比例配分した時刻にする
    const milestones = goals.map((gold) => {
      const i = s.points.findIndex((p) => p.total >= gold);
      if (i < 0) return { gold, t: null };
      if (i === 0) return { gold, t: 0 };
      const a = s.points[i - 1]!, b = s.points[i]!;
      const t = b.total === a.total ? b.t : a.t + ((gold - a.total) / (b.total - a.total)) * (b.t - a.t);
      return { gold, t: Math.round(t) };
    });
    return { ...s, final, milestones };
  };

  // ① 理想: ディナイされない + 小キャンプ + ファーストブラッド + 終わりにガーディアン破壊
  const ideal = finish({
    key: "ideal",
    heroKey: "hero_inferno",
    title: "理想のレーン",
    summary: `ディナイされない・小キャンプを毎回回収・${Math.floor(A.firstBloodSeconds / 60)}分にファーストブラッド・${Math.floor(A.endSeconds / 60)}分にガーディアン破壊`,
    points: build([
      ...waves.map((t) => ({ t, gold: waveGold(t), dur: A.waveSeconds })),
      ...campTimes.map((t) => ({ t, gold: campGold(t), dur: A.campSeconds, note: "小キャンプ" })),
      { t: A.firstBloodSeconds, gold: killGold, dur: 0, note: "ファーストブラッド" },
      { t: A.endSeconds, gold: guardianGold, dur: 0, note: "ガーディアン破壊" },
    ]),
  });

  // ② 基本: ウェーブを倒し、レーン沿いの箱を拾うだけ
  const basic = finish({
    key: "basic",
    heroKey: "hero_forge",
    title: "ウェーブと箱だけ",
    summary: `ウェーブを倒し、レーン沿いの箱（${A.laneCratesPerSpawn}個）を出るたびに拾う`,
    points: build([
      ...waves.map((t) => ({ t, gold: waveGold(t), dur: A.waveSeconds })),
      ...crateTimes.map((t) => ({ t, gold: crateGold(t), dur: A.crateSeconds * A.laneCratesPerSpawn, note: "箱" })),
    ]),
  });

  // ③ 劣勢: オーブの1/4をディナイされ続け、ファーストブラッドを取られてウェーブを1周失う
  const keep = tr.instantRatio + (1 - tr.instantRatio) * (1 - A.deniedShare);
  const lostWave = waves.find((t) => t >= A.firstBloodSeconds);
  const behind = finish({
    key: "behind",
    heroKey: "hero_atlas",
    title: "押されるレーン",
    summary: `オーブの${Math.round(A.deniedShare * 100)}%をディナイされ続け、${Math.floor(A.firstBloodSeconds / 60)}分にファーストブラッドを取られて1ウェーブ失う`,
    points: build(waves.filter((t) => t !== lostWave).map((t) => ({ t, gold: waveGold(t, keep), dur: A.waveSeconds }))),
  });

  return [ideal, basic, behind];
}
