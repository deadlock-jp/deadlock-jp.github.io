/**
 * 戦略のリファレンス(/mechanics/strategy/)が読むデータ。
 *
 * 数値の裏付けを持たない、丸ごと手書きの記事(data/strategy-notes.json)。
 * 他のmechanicsページ(system/objects/souls/controls)は自動抽出データが主役だが、
 * このページだけは解説記事そのもの（CLAUDE.md 2026-09-13のルール1撤回を受けて追加）。
 */
import strategyJson from "../../data/strategy-notes.json" with { type: "json" };

export interface StrategySection {
  id: string;
  title: string;
  paragraphs: string[];
}

export function strategySections(): StrategySection[] {
  return (strategyJson as unknown as { sections: StrategySection[] }).sections;
}
