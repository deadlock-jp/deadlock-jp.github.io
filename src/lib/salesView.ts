/**
 * 売却と強化の表示(アイテムページの ItemSales.astro・ヒーローページの HeroSales.astro)で共通の書式。
 */

/** 割合を「35.0%」に。分母が 0 なら「—」 */
export const salesPct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

/** 秒を「28:37」に */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * 時刻の帯の右端(分)。渡された秒(購入・売却の 75% など)のうち一番遅いものを5分単位で切り上げ、30〜60分に収める。
 * 同じセクションの中では同じ値を使い、帯どうしを見比べられるようにする
 */
export function salesAxisMinutes(seconds: (number | null | undefined)[]): number {
  const latest = Math.max(0, ...seconds.filter((s): s is number => typeof s === "number"));
  return Math.min(60, Math.max(30, Math.ceil(latest / 60 / 5) * 5));
}

/** 秒 → 帯の左端からの位置(%)。右端を超えるものは右端に寄せる */
export const salesPos = (sec: number, axisMinutes: number) => `${Math.min(100, (sec / 60 / axisMinutes) * 100).toFixed(2)}%`;
