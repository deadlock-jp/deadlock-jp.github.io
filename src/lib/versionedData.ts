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
