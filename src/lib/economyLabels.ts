/**
 * バランス調整の「システム全体」区分(target: "system")の表示名・単位。
 *
 * ヒーロー・アイテムの変更は Valve 側のプロパティ名にゲーム内の表示名が
 * 対応するが、economy.json(src/parsers/economy.ts。generic_data.vdata から抽出)は
 * こちらで組み立てた合成キーなので、対応するゲーム内トークンが無い。
 * 建造物・オブジェクトの名前だけはゲームのトークン(src/i18n/terms.ts)で引き、
 * それを差し込む文は辞書(src/i18n/ui/ の economy)で組み立てる。
 *
 * tools/gen-updates.mjs(node --experimental-strip-types 経由)と
 * src/lib/data.ts の両方から読む。ツールから呼ぶときは描画の外なので常に日本語。
 * data.ts はこのファイルを読む側になるので、循環参照を避けるため
 * data.ts の関数(souls() 等)はここでは使わない。
 */
import { L } from "../i18n/index.ts";
import { term } from "../i18n/terms.ts";

/** 桁区切りのソウル表示。src/lib/data.ts の souls() と同じ書式 */
const souls = (n: number): string => n.toLocaleString("en-US");

/** economy.json の1フィールドの実IDキー→表示名。objectiveGold は末尾(.goldKill 等)を除いた形で引く */
function objectiveLabel(key: string): string | undefined {
  const e = L().economy;
  switch (key) {
    case "Tier1":
      return e.withTier(term("guardian"), "Tier1");
    case "Tier2":
      return e.withTier(term("walker"), "Tier2");
    case "BaseGuardians":
      return term("baseGuardians");
    case "Shrines":
      return term("shrine");
    case "PatronPhase1":
      return e.withTier(term("patron"), e.patronPhase1);
    default:
      return undefined;
  }
}

export type EconomyBucket = "objective" | "kill" | "rejuv" | "rift" | "breakable";

/** どのカードにまとめるか */
export function economyBucketOf(path: string): EconomyBucket | null {
  if (path === "objectiveGoldNearPlayerSplitPct" || path.startsWith("objectiveGold.")) return "objective";
  if (path.startsWith("trooperKillGoldShareFrac.") || path.startsWith("heroKillGoldShareFrac.")) return "kill";
  if (path.startsWith("rejuv.")) return "rejuv";
  if (path.startsWith("riftComeback.")) return "rift";
  if (path.startsWith("breakableSpawnTimes.")) return "breakable";
  return null;
}

/** カードの見出し */
export function economyBucketLabel(bucket: EconomyBucket): string {
  return bucket === "rejuv" ? term("rejuvenator") : L().economy.bucket[bucket];
}

/** 表示ラベル。economy.json 由来のパスでなければ null */
export function economyFieldLabel(path: string): string | null {
  const e = L().economy;
  if (path === "objectiveGoldNearPlayerSplitPct") return e.nearSplit;

  let m = /^objectiveGold\.(\w+)\.goldKill$/.exec(path);
  if (m) return e.goldKill(objectiveLabel(m[1]!) ?? m[1]!);
  m = /^objectiveGold\.(\w+)\.goldOrbs$/.exec(path);
  if (m) return e.goldOrbs(objectiveLabel(m[1]!) ?? m[1]!);

  m = /^trooperKillGoldShareFrac\.(\d+)$/.exec(path);
  if (m) return e.trooperShare(term("trooper"), m[1]!);
  m = /^heroKillGoldShareFrac\.(\d+)$/.exec(path);
  if (m) return e.heroShare(m[1]!);

  if (path === "rejuv.buffDuration") return e.rejuvBuff(term("rejuvenator"));
  if (path === "rejuv.expirationWarningTiming") return e.rejuvWarn(term("rejuvenator"));
  m = /^rejuv\.trooperHealthMult\.(\d+)$/.exec(path);
  if (m) return e.rejuvTrooperHp(term("rejuvenator"), term("trooper"), m[1]!);
  m = /^rejuv\.playerRespawnMult\.(\d+)$/.exec(path);
  if (m) return e.rejuvRespawn(term("rejuvenator"), m[1]!);

  m = /^riftComeback\.(\w+)$/.exec(path);
  if (m) return e.rift[m[1]!] ?? m[1]!;

  /* ゲーム側の配列に名前が無いので、何番目の配置かだけを出す */
  m = /^breakableSpawnTimes\.(\d+)\.initialSpawnTime$/.exec(path);
  if (m) return e.breakableInitial(m[1]!);
  m = /^breakableSpawnTimes\.(\d+)\.respawnInterval$/.exec(path);
  if (m) return e.breakableRespawn(m[1]!);

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
  if (path === "rejuv.buffDuration" || path === "rejuv.expirationWarningTiming") return `${value}${L().common.sec}`;
  if (path.startsWith("rejuv.trooperHealthMult.") || path.startsWith("rejuv.playerRespawnMult.")) {
    return `×${value}`;
  }
  if (path.startsWith("riftComeback.")) return `${value}%`;
  if (path.startsWith("breakableSpawnTimes.")) return `${value / 60}${L().common.minute}`;
  return String(value);
}
