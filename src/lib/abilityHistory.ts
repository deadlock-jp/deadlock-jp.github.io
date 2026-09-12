/**
 * スキル単体の更新履歴。data/diffs/*.json(機械的なスナップショット間差分。
 * tools/gen-snapshot-diff.mjs が生成)から、このアビリティに関わる行だけを
 * 抜き出してバフ/ナーフ/リワークに分類する。
 *
 * data/updates.json(人手レビュー済みの調整履歴)はヒーロー単位で複数スキルの
 * 変化を1行のnoteにまとめてしまうため、スキル単位の切り出しには使えない。
 * ここでは常に data/diffs/ の生差分を直接読む。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");

interface DiffEntry {
  kind: "added" | "removed" | "changed";
  type: "hero" | "item";
  id: string;
  path?: string;
  before?: number;
  after?: number;
}
interface DiffFile {
  from: string;
  to: string;
  generatedAt: string;
  entries: DiffEntry[];
}

/**
 * 小さいほど良いフィールド(向きの判定)。tools/gen-updates.mjs の
 * LOWER_IS_BETTER と同じ判定基準。どちらかを直したらもう片方も直すこと。
 */
const LOWER_IS_BETTER = [
  "cooldown",
  "reloadtime",
  "reloadduration",
  "chargetime",
  "castdelay",
  "castpoint",
  "spread",
  "recoil",
  "falloffdamage",
  "staminacost",
  "spiritcost",
  "chargedelay",
];
const dirOf = (name: string): 1 | -1 =>
  LOWER_IS_BETTER.some((s) => name.toLowerCase().includes(s)) ? -1 : 1;

export interface AbilityHistoryChange {
  /** 生のプロパティ名("Damage" 等)。表示ラベルはページ側で labelOverride を見て解決する */
  property: string;
  /** true なら段階アップグレードの強化量、false なら基礎プロパティ自体の変化 */
  fromUpgrade: boolean;
  before: number;
  after: number;
  /** ゲーム的に有利な向きへ動いたか */
  good: boolean;
}
export interface AbilityHistoryEntry {
  from: string;
  to: string;
  kind: "buff" | "nerf" | "rework";
  changes: AbilityHistoryChange[];
}

let diffFilesCache: DiffFile[] | null = null;
function loadAllDiffs(): DiffFile[] {
  if (diffFilesCache) return diffFilesCache;
  const dir = join(DATA_DIR, "diffs");
  if (!existsSync(dir)) return (diffFilesCache = []);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  diffFilesCache = files
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as DiffFile)
    // 新しい順(ClientVersionは単調増加する数値)
    .sort((a, b) => Number(b.to) - Number(a.to) || Number(b.from) - Number(a.from));
  return diffFilesCache;
}

/** gen-updates.mjs の classify() と同じ基準 */
function classify(changes: AbilityHistoryChange[]): "buff" | "nerf" | "rework" {
  const good = changes.filter((c) => c.good).length;
  const bad = changes.length - good;
  if (changes.length >= 6 || (good > 0 && bad > 0 && Math.min(good, bad) >= 2)) return "rework";
  return good >= bad ? "buff" : "nerf";
}

export function abilityHistory(abilityKey: string): AbilityHistoryEntry[] {
  const prefix = `${abilityKey}.`;
  const out: AbilityHistoryEntry[] = [];
  for (const diff of loadAllDiffs()) {
    const changes: AbilityHistoryChange[] = [];
    for (const e of diff.entries) {
      if (e.kind !== "changed" || e.type !== "hero" || !e.path?.startsWith(prefix)) continue;
      const rest = e.path.slice(prefix.length); // "properties.Damage" / "upgrades.↑Damage"
      const [section, rawName] = rest.split(".");
      if (e.before === undefined || e.after === undefined) continue;
      const fromUpgrade = section === "upgrades";
      const property = rawName.replace(/^↑/, "");
      const dir = dirOf(property) * Math.sign(e.after - e.before);
      changes.push({ property, fromUpgrade, before: e.before, after: e.after, good: dir > 0 });
    }
    if (changes.length === 0) continue;
    out.push({ from: diff.from, to: diff.to, kind: classify(changes), changes });
  }
  return out;
}
