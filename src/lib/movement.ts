/**
 * 移動テクニックのリファレンス(/mechanics/movement/)が読むデータ。
 *
 * 数値の裏付けを持たない、丸ごと手書きの記事(data/movement-notes.json)。
 * strategy.ts と同じ位置づけで、こちらは基礎操作(data/controls-notes.json)を
 * 組み合わせた発展的なテクニックだけを扱う。
 */
import movementJson from "../../data/movement-notes.json" with { type: "json" };

export interface MovementSection {
  id: string;
  title: string;
  paragraphs: string[];
}

export function movementSections(): MovementSection[] {
  return (movementJson as unknown as { sections: MovementSection[] }).sections;
}
