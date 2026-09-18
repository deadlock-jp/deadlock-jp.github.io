/**
 * バランス調整の「システム全体」区分(target: "system")の表示名・単位。
 *
 * ヒーロー・アイテムの変更は Valve 側のプロパティ名にゲーム内の表示名が
 * 対応するが、economy.json(src/parsers/economy.ts。generic_data.vdata から抽出)は
 * こちらで組み立てた合成キーなので、対応するゲーム内トークンが無い。
 * BASE_STAT_LABEL(data.ts) / property-labels.json と同じ理由で、ここだけ自前で名付ける。
 *
 * tools/gen-updates.mjs(node --experimental-strip-types 経由)と
 * src/lib/data.ts の両方から読む。data.ts はこのファイルを読む側になるので、
 * 循環参照を避けるため data.ts の関数(souls() 等)はここでは使わない。
 */

/** 桁区切りのソウル表示。src/lib/data.ts の souls() と同じ書式 */
const souls = (n: number): string => n.toLocaleString("en-US");

/** economy.json の1フィールドの実IDキー→表示名。objectiveGold は末尾(.goldKill 等)を除いた形で引く */
const OBJECTIVE_LABEL: Record<string, string> = {
  Tier1: "ガーディアン（Tier1）",
  Tier2: "ウォーカー（Tier2）",
  BaseGuardians: "ベース・ガーディアン",
  Shrines: "シュライン",
  PatronPhase1: "パトロン（第1形態）",
};

/** どのカードにまとめるか(建造物破壊ソウル / キルの分配 / リジュビネーター) */
export function economyBucketOf(path: string): "objective" | "kill" | "rejuv" | null {
  if (path === "objectiveGoldNearPlayerSplitPct" || path.startsWith("objectiveGold.")) return "objective";
  if (path.startsWith("trooperKillGoldShareFrac.") || path.startsWith("heroKillGoldShareFrac.")) return "kill";
  if (path.startsWith("rejuv.")) return "rejuv";
  return null;
}

export const ECONOMY_BUCKET_LABEL: Record<"objective" | "kill" | "rejuv", string> = {
  objective: "建造物破壊のソウル",
  kill: "キルのソウル分配",
  rejuv: "リジュビネーター",
};

/** 表示ラベル。economy.json 由来のパスでなければ null */
export function economyFieldLabel(path: string): string | null {
  if (path === "objectiveGoldNearPlayerSplitPct") return "破壊に関わった付近のプレイヤーへの配分率";

  let m = /^objectiveGold\.(\w+)\.goldKill$/.exec(path);
  if (m) return `${OBJECTIVE_LABEL[m[1]!] ?? m[1]}を破壊した際のソウル`;
  m = /^objectiveGold\.(\w+)\.goldOrbs$/.exec(path);
  if (m) return `${OBJECTIVE_LABEL[m[1]!] ?? m[1]}のオーブ配分`;

  m = /^trooperKillGoldShareFrac\.(\d+)$/.exec(path);
  if (m) return `トルーパーキルの取り分（${m[1]}人絡んだ場合）`;
  m = /^heroKillGoldShareFrac\.(\d+)$/.exec(path);
  if (m) return `ヒーローキルの取り分（${m[1]}人絡んだ場合）`;

  if (path === "rejuv.buffDuration") return "リジュビネーターのバフ持続時間";
  if (path === "rejuv.expirationWarningTiming") return "リジュビネーター消滅の警告タイミング";
  m = /^rejuv\.trooperHealthMult\.(\d+)$/.exec(path);
  if (m) return `リジュビネーター中のトルーパーHP倍率（${m[1]}段目）`;
  m = /^rejuv\.playerRespawnMult\.(\d+)$/.exec(path);
  if (m) return `リジュビネーター保持中のリスポーン時間倍率（${m[1]}段目）`;

  return null;
}

/** 値の表示テキスト。単位はフィールドの意味に合わせる(ソウル量・%・秒・倍率) */
export function economyValueText(path: string, value: number | null): string | null {
  if (value === null) return null;
  if (path.startsWith("objectiveGold.")) return souls(value);
  if (path === "objectiveGoldNearPlayerSplitPct") return `${value}%`;
  if (path.startsWith("trooperKillGoldShareFrac.") || path.startsWith("heroKillGoldShareFrac.")) {
    return `${Math.round(value * 100)}%`;
  }
  if (path === "rejuv.buffDuration" || path === "rejuv.expirationWarningTiming") return `${value}秒`;
  if (path.startsWith("rejuv.trooperHealthMult.") || path.startsWith("rejuv.playerRespawnMult.")) {
    return `×${value}`;
  }
  return String(value);
}
