/**
 * data/snapshots/ の複数バージョンを横断して読むためのヘルパー。
 *
 * src/lib/data.ts はサイト全体が使う「今の最新版」のシングルトンで、
 * それ以外のバージョンは扱わない設計(意図的。architecture.html参照)。
 * ビルドページのバージョン比較(/build/compare/)だけは複数バージョンの
 * 生データを同時に見る必要があるため、ここで別途読む。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HeroesFile } from "../types/hero.ts";
import type { ItemsFile } from "../types/item.ts";
import type { AbilitiesFile } from "../types/ability.ts";
import updatesJson from "../../data/updates.json" with { type: "json" };
import { patchNoteByDate, type PatchNoteEntry } from "./patchNotes.ts";

const DATA_DIR = join(process.cwd(), "data");

/** data/snapshots/ 配下にあるバージョンを新しい順で返す */
export function listSnapshotVersions(): string[] {
  const dir = join(DATA_DIR, "snapshots");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => Number(b) - Number(a));
}

export interface VersionedSnapshot {
  version: string;
  heroesFile: HeroesFile;
  itemsFile: ItemsFile;
  abilitiesFile: AbilitiesFile;
}

const cache = new Map<string, VersionedSnapshot>();

/** 指定バージョンの heroes/items/abilities を生JSONのまま返す(ローカライズは含まない) */
export function loadVersionedSnapshot(version: string): VersionedSnapshot {
  const cached = cache.get(version);
  if (cached) return cached;
  const dir = join(DATA_DIR, "snapshots", version);
  const read = <T>(name: string): T => JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
  const snap: VersionedSnapshot = {
    version,
    heroesFile: read<HeroesFile>("heroes.json"),
    itemsFile: read<ItemsFile>("items.json"),
    abilitiesFile: read<AbilitiesFile>("abilities.json"),
  };
  cache.set(version, snap);
  return snap;
}

/**
 * スナップショット1版ぶんの素性。
 *
 * ClientVersion(6689)はローカル抽出PCの起動タイミングで切られる番号で、
 * 公式マイナーアップデートの日付とは独立している。そのままラベルに出しても
 * 読み手には意味がないので、対応する公式アップデートがあればその日付で出す。
 */
export interface SnapshotInfo {
  version: string;
  /** その版がいつ時点のものか。meta.json の extractedAt(バックフィル版は上流コミット日) */
  date: string | null;
  /** 対応する公式パッチノート。結び付かなければ null */
  note: PatchNoteEntry | null;
  /** 選択肢などに出す表示名 */
  label: string;
}

interface SnapshotMeta {
  clientVersion?: string;
  extractedAt?: string;
  source?: string;
}

function snapshotMeta(version: string): SnapshotMeta | null {
  const path = join(DATA_DIR, "snapshots", version, "meta.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as SnapshotMeta;
}

/**
 * 版と公式アップデートの対応は、日付の近さで推測しない。
 *
 * data/updates.json の toVersion が「そのアップデート後の状態の版」そのもので、
 * tools/gen-updates.mjs が生成時に書いている。日付で寄せると、アップデート直前の
 * 状態として置いてある版(6675 は 8/12 の2日前、6683 は 8/22 の2日前)まで
 * そのアップデートを名乗ってしまう。
 * 対応が無い版は ClientVersion と抽出日で出す。
 */
const updateByToVersion = new Map(
  (updatesJson as unknown as { entries: { date: string; toVersion?: string }[] }).entries
    .filter((e) => e.toVersion)
    .map((e) => [e.toVersion as string, e.date]),
);

export function snapshotInfo(version: string): SnapshotInfo {
  const date = snapshotMeta(version)?.extractedAt?.slice(0, 10) ?? null;
  const updateDate = updateByToVersion.get(version);
  const note = updateDate ? (patchNoteByDate(updateDate) ?? null) : null;
  const label = note
    ? `${note.date} ${note.title.replace(/\s*-\s*\d{4}年.*$/, "")}`
    : `build ${version}${date ? `・${date} 抽出` : ""}`;
  return { version, date, note, label };
}

/** 新しい順。data/snapshots/ にある全版 */
export function snapshotInfos(): SnapshotInfo[] {
  return listSnapshotVersions().map(snapshotInfo);
}

/**
 * ビルド比較の選択肢に出す版。
 *
 * 公式アップデートに対応する版と、最新の抽出版だけ。中間ビルド(公式アップデートの
 * 直前の状態として差分用に置いてあるだけの版)を選べても意味が薄いうえ、
 * 比較ページは全版のデータを埋め込む作りなので、選択肢を絞るとページも軽くなる。
 */
export function comparableSnapshots(): SnapshotInfo[] {
  const all = snapshotInfos();
  const latest = all[0];
  return all.filter((s, i) => s.note !== null || (latest && i === 0));
}
