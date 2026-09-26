/**
 * ゲームシステムの手書きの説明(data/game-system-notes.json)。旧 /mechanics/system/ の内容で、
 * 今は試合の流れ(/mechanics/match/)の付録「その他のルール」が読む。数値は持たない(ルール6)。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import gameSystemJson from "../../data/game-system-notes.json" with { type: "json" };
import { resolveImagePath } from "../parsers/image-manifest.ts";

export interface GameSystemIcon {
  /** public/ からの相対パス(先頭スラッシュなし)。ページ側で base を付けて使う */
  src: string;
  label: string;
}
export interface GameSystemSection {
  id: string;
  title: string;
  /** 文章の理解を助ける早見表。無ければ空配列 */
  icons: GameSystemIcon[];
  lines: string[];
}

interface RawSection {
  id: string;
  title: string;
  lines: string[];
  icons?: { icon: string; label: string }[];
}

export function gameSystemSections(): GameSystemSection[] {
  const sections = (gameSystemJson as unknown as { sections: RawSection[] }).sections;
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    lines: s.lines,
    icons: (s.icons ?? []).flatMap((i) => {
      const resolved = resolveImagePath(i.icon);
      if (!resolved || !existsSync(join(process.cwd(), resolved.outPath))) return [];
      return [{ src: resolved.outPath.replace(/^public\//, ""), label: i.label }];
    }),
  }));
}
