/**
 * ゲームシステムのリファレンス(/mechanics/system/)が読むデータ。
 *
 * 「勝利までの進行」は data/snapshots/<版>/economy.json（m_ObjectiveParams。
 * src/parsers/economy.ts）から自動で組み立てる。仕組みの説明（勝利条件・レーンのルール）は
 * 数値を伴わないため data/game-system-notes.json に手書きで置く（CLAUDE.md ルール3・6）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import gameSystemJson from "../../data/game-system-notes.json" with { type: "json" };
import type { EconomyFile } from "../types/economy.ts";

const DATA_DIR = join(process.cwd(), "data");

const economyFile: EconomyFile = (() => {
  const v = JSON.parse(readFileSync(join(DATA_DIR, "latest.json"), "utf8")).version as string;
  return JSON.parse(readFileSync(join(DATA_DIR, "snapshots", v, "economy.json"), "utf8")) as EconomyFile;
})();

export interface GameSystemSection {
  id: string;
  title: string;
  lines: string[];
}

export function gameSystemSections(): GameSystemSection[] {
  return (gameSystemJson as unknown as { sections: GameSystemSection[] }).sections;
}

export interface WinProgressionStep {
  key: string;
  label: string;
  goldKill: number;
}

/** 勝利までの進行順(m_ObjectiveParams の並び=ゲーム側の定義順をそのまま使う) */
const STEP_LABEL: Record<string, string> = {
  Tier1: "ガーディアン（Tier1）を破壊",
  Tier2: "ウォーカー（Tier2）を破壊",
  BaseGuardians: "ベース・ガーディアンを破壊",
  Shrines: "シュラインを両方破壊（パトロンが弱体化）",
  PatronPhase1: "パトロンを破壊（勝利）",
};

export function winProgression(): WinProgressionStep[] {
  return economyFile.objectiveGold.map((o) => ({
    key: o.key,
    label: STEP_LABEL[o.key] ?? o.key,
    goldKill: o.goldKill,
  }));
}
