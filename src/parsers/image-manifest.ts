/**
 * 画像マニフェストの生成
 *
 * data/*.json が参照している画像パスから、
 * 「VPK内のどのファイルを、どこに出力するか」の一覧を作る。
 *
 * ゲーム本体からの抽出作業は、この一覧と突き合わせれば
 * 漏れ・取り違えを機械的に検出できる。
 *
 * パスの対応(pak01_dir.txt で実物を確認済み):
 *   データ    file://{images}/items/weapon/basic_magazine.psd
 *   VPK内     panorama/images/items/weapon/basic_magazine_psd.vtex_c
 *   出力先    public/images/items/weapon/basic_magazine.png
 *
 * 注意: ラスタ画像は拡張子が消えずに "_psd" としてファイル名に残るが、
 * SVGは残らない(icon_speed.svg → icon_speed.vsvg_c)。両方ともVPKの一覧で確認済み。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ItemsFile } from "../types/item.ts";
import type { AbilitiesFile } from "../types/ability.ts";
import type { HeroesFile } from "../types/hero.ts";

export interface ImageEntry {
  /** データ側の参照パス */
  ref: string;
  /** VPK内のパス */
  vpkPath: string;
  /** public/ 以下の出力先 */
  outPath: string;
  /** vtex_c(ラスタ) か vsvg_c(ベクタ) か */
  kind: "vtex" | "vsvg";
  /** 何がこの画像を使うか */
  usedBy: string[];
}

export interface ImageManifest {
  schemaVersion: number;
  generatedAt: string;
  /** ゲーム本体側のVPK。ここから抽出する */
  sourceVpk: string;
  entries: ImageEntry[];
}

/** file://{images}/a/b.psd → panorama/images/a/b_psd.vtex_c と public/images/a/b.png */
export function resolveImagePath(
  ref: string,
): { vpkPath: string; outPath: string; kind: "vtex" | "vsvg" } | null {
  const m = /^file:\/\/\{images\}\/(.+)$/.exec(ref);
  if (!m) return null;
  const rel = m[1];
  const ext = /\.([a-z0-9]+)$/i.exec(rel)?.[1]?.toLowerCase() ?? "";
  // 拡張子はファイル名に "_psd" のように残る
  const stem = rel.replace(/\.[a-z0-9]+$/i, "");
  const kind = ext === "svg" ? "vsvg" : "vtex";
  // ラスタは "basic_magazine_psd.vtex_c" と拡張子が名前に残るが、
  // SVGは "icon_speed.vsvg_c" で残らない。VPKの一覧で確認済み。
  const vpkStem = kind === "vsvg" ? stem : `${stem}_${ext}`;
  return {
    vpkPath: `panorama/images/${vpkStem}.${kind}_c`,
    outPath: `public/images/${stem}.${kind === "vsvg" ? "svg" : "png"}`,
    kind,
  };
}

export function buildImageManifest(dataDir: string): ImageManifest {
  const items = JSON.parse(
    readFileSync(join(dataDir, "items.json"), "utf8"),
  ) as ItemsFile;
  const abilities = JSON.parse(
    readFileSync(join(dataDir, "abilities.json"), "utf8"),
  ) as AbilitiesFile;
  const heroes = JSON.parse(
    readFileSync(join(dataDir, "heroes.json"), "utf8"),
  ) as HeroesFile;

  const byRef = new Map<string, ImageEntry>();
  const add = (ref: string | null, user: string): void => {
    if (!ref) return;
    const resolved = resolveImagePath(ref);
    if (!resolved) return;
    const existing = byRef.get(ref);
    if (existing) {
      existing.usedBy.push(user);
      return;
    }
    byRef.set(ref, { ref, ...resolved, usedBy: [user] });
  };

  for (const item of Object.values(items.items)) {
    if (item.inShop) add(item.shopIcon, `item:${item.id}`);
  }
  for (const ab of Object.values(abilities.abilities)) {
    add(ab.image, `ability:${ab.id}`);
  }
  // 未実装ヒーローの絵は取り込まない。VPKに無いこともあるため
  for (const h of Object.values(heroes.heroes)) {
    if (!h.released) continue;
    add(h.images.iconSmall, `hero:${h.key}:sm`);
    add(h.images.heroCard, `hero:${h.key}:card`);
    add(h.images.minimap, `hero:${h.key}:mm`);
  }

  const entries = [...byRef.values()].sort((a, b) => a.vpkPath.localeCompare(b.vpkPath));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceVpk: "game/citadel/pak01_dir.vpk",
    entries,
  };
}

/**
 * 抽出結果の照合。public/ に出力されたファイルと一覧を突き合わせ、
 * 足りないものを返す。
 */
export function verifyExtraction(
  manifest: ImageManifest,
  repoRoot: string,
): { present: number; missing: ImageEntry[] } {
  const missing = manifest.entries.filter((e) => !existsSync(join(repoRoot, e.outPath)));
  return { present: manifest.entries.length - missing.length, missing };
}

function main(): void {
  const repoRoot = process.argv[2] ?? ".";
  const manifest = buildImageManifest(join(repoRoot, "data"));
  mkdirSync(join(repoRoot, "data"), { recursive: true });
  writeFileSync(
    join(repoRoot, "data/image-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  const vtex = manifest.entries.filter((e) => e.kind === "vtex").length;
  const vsvg = manifest.entries.filter((e) => e.kind === "vsvg").length;
  console.log(`data/image-manifest.json を生成しました`);
  console.log(`  必要な画像 ${manifest.entries.length} 件 (vtex_c ${vtex} / vsvg_c ${vsvg})`);

  const { present, missing } = verifyExtraction(manifest, repoRoot);
  console.log(`  public/ に存在 ${present} 件 / 未取得 ${missing.length} 件`);
  for (const m of missing.slice(0, 5)) console.log(`    未取得: ${m.outPath}`);
  if (missing.length > 5) console.log(`    ... ほか ${missing.length - 5} 件`);
}

if (process.argv[1]?.endsWith("image-manifest.ts")) main();
