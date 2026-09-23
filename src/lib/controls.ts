/**
 * キャラクターコントロールのリファレンス(/mechanics/controls/)が読むデータ。
 *
 * ヒーロー別の移動・近接ダメージ系の基礎値は heroes.json の startingStats に
 * 既に抽出済み（src/parsers/heroes.ts）。ここでは表示に使う項目だけ選んで整形する。
 * 操作の説明・テクニックは data/controls-notes.json に手書きする
 * (該当する vdata が無く自動抽出できないため。CLAUDE.md ルール6)。
 * 旧 /mechanics/movement/ (data/movement-notes.json) はここに統合した(2026-09-23)。
 */
import { releasedHeroes, t } from "./data.ts";
import controlsNotesJson from "../../data/controls-notes.json" with { type: "json" };

export interface ControlCategory {
  id: string;
  title: string;
  /** 基礎操作の説明そのもの。無いカテゴリ(ジップライン等)は空配列 */
  basics: string[];
  /** 基礎操作を組み合わせた発展的なテクニック。無いカテゴリ(パリィ等)は空配列 */
  techniques: string[];
}

export function controlCategories(): ControlCategory[] {
  return (controlsNotesJson as unknown as { categories: ControlCategory[] }).categories;
}

export interface HeroControlRow {
  heroId: number;
  name: string;
  iconSmall: string | null;
  /** 通常時の最大移動速度 */
  moveSpeed: number;
  /** スプリント速度(加算) */
  sprintSpeed: number;
  /** スタミナの総量 */
  stamina: number;
  /** スタミナ1あたりの回復秒数 */
  staminaRegenPerSecond: number;
  /** 地上ダッシュの距離(m)・持続(秒) */
  groundDashDistance: number;
  groundDashDuration: number;
  /** 空中ダッシュの距離(m)・持続(秒) */
  airDashDistance: number;
  airDashDuration: number;
  lightMeleeDamage: number;
  heavyMeleeDamage: number;
}

const round = (n: number, digits = 2): number => Math.round(n * 10 ** digits) / 10 ** digits;

export function heroControlStats(): HeroControlRow[] {
  return releasedHeroes().map((h) => {
    const s = h.startingStats;
    return {
      heroId: h.id,
      name: t(h.nameToken, h.key),
      iconSmall: h.images.iconSmall,
      moveSpeed: round(s.EMaxMoveSpeed),
      sprintSpeed: round(s.ESprintSpeed),
      stamina: round(s.EStamina, 1),
      staminaRegenPerSecond: round(s.EStaminaRegenPerSecond, 2),
      groundDashDistance: round(s.EGroundDashDistanceInMeters, 1),
      groundDashDuration: round(s.EGroundDashDuration, 2),
      airDashDistance: round(s.EAirDashDistanceInMeters, 1),
      airDashDuration: round(s.EAirDashDuration, 2),
      lightMeleeDamage: round(s.ELightMeleeDamage, 0),
      heavyMeleeDamage: round(s.EHeavyMeleeDamage, 0),
    };
  });
}
