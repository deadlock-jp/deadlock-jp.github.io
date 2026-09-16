/**
 * バランス調整の型と、バフ/ナーフの分類ルール。
 *
 * サイト側(トップ・アップデートページ)と tools/gen-updates.mjs の両方がここを使う
 * (ツールからは node --experimental-strip-types 経由)。分類の実装を1か所に置くための
 * モジュールなので、スナップショットや localization には依存させない。
 *
 * 項目1つの向き(good)を決めるのは tools/diff/fields.mjs の goodOf()。
 * こちらはその結果を畳んで「このスキルはバフかナーフか」を出す係。
 */

export type AdjustmentKind = "buff" | "nerf" | "mixed" | "neutral" | "rework";

export interface AdjustmentChange {
  /**
   * data/diffs/ と同じパス表記。
   *   ヒーロー  stat.<名前> / growth.<名前>
   *             <abilityKey>.properties.<名前> / <abilityKey>.upgrades.T<段>.<名前>[#n]
   *   アイテム  cost / properties.<名前> / upgrades.T<段>.<名前>[#n]
   */
  path: string;
  /** null = 今回追加されたフィールド */
  from: number | null;
  /** null = 今回削除されたフィールド */
  to: number | null;
  /** 有利な向きか。null = 判定しない(無色・集計対象外) */
  good: boolean | null;
}

export interface Adjustment {
  kind: AdjustmentKind;
  target: "hero" | "item";
  key: string;
  note?: string;
  changes?: AdjustmentChange[];
}

/* ---- パスの読み取り(組み立て側は tools/diff/fields.mjs) ---- */

/** AP強化(upgrades)由来のパスか */
export const isUpgradePath = (path: string): boolean => /(?:^|\.)upgrades\.T\d+\./.test(path);

/** AP強化の段(1-3)。基礎値なら null */
export function upgradeTierOf(path: string): number | null {
  return Number(/(?:^|\.)upgrades\.T(\d+)\./.exec(path)?.[1]) || null;
}

/** 末尾のフィールド名。段・#2・@scale は落とす */
export function fieldNameOf(path: string): string {
  return (path.split(".").pop() ?? "").replace(/#\d+$/, "").replace(/@scale$/, "");
}

/** スピリット倍率(properties.<名前>@scale)の行か */
export const isScalePath = (path: string): boolean => path.endsWith("@scale");

/** 主武器の数値(<abilityKey>.weapon.<...>)なら、その中のパスを返す */
export function weaponFieldOf(path: string): string | null {
  const at = path.indexOf(".weapon.");
  return at === -1 ? null : path.slice(at + ".weapon.".length);
}

/**
 * 主武器の数値のラベルと単位。
 *
 * ability.weapon は properties と違ってローカライズトークンを持たない生の構造体なので、
 * ここだけは対応表を持つ。文言と単位はヒーローページが実際に出しているもの
 * (src/lib/gamestats.ts の weaponRows / weaponHeadline)に合わせる。
 * 距離は Source 2 の 1 unit = 1 inch で保存されているため、表示だけメートルに直す。
 */
export const WEAPON_FIELDS: Record<string, { label: string; unit?: string; meters?: boolean }> = {
  bulletDamage: { label: "弾薬ダメージ" },
  bulletsPerShot: { label: "1トリガーの弾数" },
  cycleTime: { label: "発射間隔", unit: "秒" },
  clipSize: { label: "弾数" },
  reloadDuration: { label: "リロード時間", unit: "秒" },
  bulletSpeed: { label: "弾速", unit: "m／秒", meters: true },
  range: { label: "射程", unit: "m", meters: true },
  burstShotCount: { label: "バースト弾数" },
  burstShotCooldown: { label: "バースト間隔", unit: "秒" },
  "falloff.startRange": { label: "減衰開始距離", unit: "m", meters: true },
  "falloff.endRange": { label: "減衰終了距離", unit: "m", meters: true },
  "falloff.startScale": { label: "減衰開始倍率" },
  "falloff.endScale": { label: "減衰終了倍率" },
  "falloff.bias": { label: "減衰カーブ" },
  "crit.bonusStart": { label: "ヘッドショット倍率" },
  "crit.bonusEnd": { label: "ヘッドショット倍率(遠距離)" },
  "crit.startRange": { label: "ヘッドショット減衰開始", unit: "m", meters: true },
  "crit.endRange": { label: "ヘッドショット減衰終了", unit: "m", meters: true },
  "crit.bonusAgainstNPCs": { label: "対NPCヘッドショット倍率" },
  spread: { label: "拡散" },
  standingSpread: { label: "静止時の拡散" },
};

/**
 * そのパスが属するスキルの実ID。ヒーローの基礎ステータス(stat./growth.)と
 * アイテムのパスには持ち主のスキルが無いので null。
 */
export function abilityKeyOf(path: string): string | null {
  const head = path.split(".")[0] ?? "";
  if (head === "stat" || head === "growth" || head === "cost") return null;
  if (head === "properties" || head === "upgrades") return null; // アイテム
  if (weaponFieldOf(path) !== null) return null; // 主武器は独立したまとまりにする
  return head || null;
}

/* ---- 分類 ---- */

/**
 * 変更項目の集まりを1つの分類に畳む。
 *
 * まず基礎値(properties / stat / growth / cost)だけを数える。AP強化は
 * 買って初めて効き、その段まで振った人にしか効かないので、基礎値と平等に
 * 数えると「T3強化の数値が1つ上がった」が「基礎ダメージが25下がった」を
 * 打ち消してしまう。基礎値の変更が1件も無いときだけ AP強化で判定する。
 *
 * 変化量の大きさでは重み付けしない。秒・m・%・倍率を横並びにできないうえ、
 * 相対変化で見ると "+3%→+4%"(33%増) が "165→140"(15%減) を上回ってしまい、
 * 公式パッチノートの読み方と逆の結論が出る。
 */
export function classifyChanges(changes: readonly AdjustmentChange[]): AdjustmentKind {
  const base = changes.filter((c) => !isUpgradePath(c.path));
  const decided = (rows: readonly AdjustmentChange[]) => rows.filter((c) => c.good !== null);
  const pool = decided(base).length > 0 ? decided(base) : decided(changes);
  if (pool.length === 0) return "neutral";
  const good = pool.filter((c) => c.good === true).length;
  const bad = pool.length - good;
  if (bad === 0) return "buff";
  if (good === 0) return "nerf";
  return "mixed";
}

/** スキルごとの分類を集めてヒーロー1体ぶんの分類にする */
export function combineKinds(kinds: readonly AdjustmentKind[]): AdjustmentKind {
  const seen = kinds.filter((k) => k !== "neutral");
  if (seen.length === 0) return "neutral";
  if (seen.every((k) => k === "buff")) return "buff";
  if (seen.every((k) => k === "nerf")) return "nerf";
  return "mixed";
}

export const ADJUSTMENT_LABEL: Record<AdjustmentKind, string> = {
  buff: "バフ",
  nerf: "ナーフ",
  mixed: "混在",
  neutral: "調整",
  rework: "リワーク",
};
