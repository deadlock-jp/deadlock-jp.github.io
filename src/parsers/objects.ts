/** npc_units.vdata → objects.json */

import type { Kv3Object } from "./kv3.ts";
import { readVdata, resolveEntry } from "./vdata.ts";
import { str } from "./properties.ts";
import type { GameObject, ObjectsFile } from "../types/object.ts";

/**
 * m_flMaxHealth → maxHealth のように、m_ とハンガリアン接頭辞を外す。
 * 接頭辞が無いものはそのまま先頭を小文字にする。
 */
export function normalizeFieldName(raw: string): string {
  let name = raw.startsWith("m_") ? raw.slice(2) : raw;
  // fl(float) n/i(int) b(bool) un(unsigned) e(enum) h(handle) など
  const m = /^(fl|un|str|sz|vec|ar|map|col|[nibseh])(?=[A-Z])/.exec(name);
  if (m) name = name.slice(m[0].length);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function parseObjects(npcUnitsPath: string, upstreamCommit: string): ObjectsFile {
  const root = readVdata(npcUnitsPath);

  const objects: Record<string, GameObject> = {};
  for (const key of Object.keys(root)) {
    const raw = root[key];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;

    let e: Kv3Object;
    try {
      e = resolveEntry(root, key);
    } catch {
      // 継承元が解決できないエントリは飛ばす
      continue;
    }

    const stats: Record<string, number> = {};
    const flags: Record<string, boolean> = {};
    for (const [field, value] of Object.entries(e)) {
      // 内部フィールドは出力しない
      if (field.startsWith("_")) continue;
      // 文字列(モデル・パーティクル・サウンドのパス)とオブジェクトは落とす
      if (typeof value === "number") stats[normalizeFieldName(field)] = value;
      else if (typeof value === "boolean") flags[normalizeFieldName(field)] = value;
    }

    // 数値もフラグも持たないエントリは実質空なので出力しない
    if (Object.keys(stats).length === 0 && Object.keys(flags).length === 0) continue;

    objects[key] = {
      id: key,
      className: str(e["_class"]),
      baseKey: str(root[key] !== null && typeof root[key] === "object" ? (root[key] as Kv3Object)["_base"] : undefined),
      stats,
      flags,
      nameToken: str(e["m_sLocUnitName"])?.replace(/^#/, "") ?? null,
      icon: str(e["m_strCustomUnitIcon"]),
      neutralType: str(e["m_eNeutralType"]),
    };
  }

  return {
    schemaVersion: 1,
    upstreamCommit,
    generatedAt: new Date().toISOString(),
    objects,
  };
}

export interface HauntSpecies {
  /** 名前トークンの共通部分(neutral_specimens など)。_1/_2/_3 が小・中・大 */
  tokenBase: string;
  /** 小・中・大それぞれの名前トークン(データに無い段は含まない) */
  tokens: string[];
  /** マップに配置されている体数(map.json のキャンプの内訳の合計) */
  placed: number;
  /** 代表のアイコン参照(マップに一番多く置かれているユニットのもの)。無ければ null */
  icon: string | null;
}

/**
 * ホーント(6712 で入れ替わった中立モンスター)を種類ごとにまとめる。
 * npc_units のキーは種類とモデルの組み合わせで分かれている(neutral_barrel_01 / _02 など)ので、
 * ゲーム内の表示名トークン(neutral_barrel_1 → 小)の共通部分で束ねる。
 * マップに1体も置かれていない種類は、試合で見かけないので落とす。
 */
export function groupHaunts(
  objects: Record<string, GameObject>,
  campHaunts: Record<string, number>[],
): HauntSpecies[] {
  const placedByUnit: Record<string, number> = {};
  for (const h of campHaunts) for (const [k, n] of Object.entries(h)) placedByUnit[k] = (placedByUnit[k] ?? 0) + n;

  const groups = new Map<string, { tokens: Set<string>; units: GameObject[] }>();
  for (const o of Object.values(objects)) {
    if (o.className !== "npc_trooper_neutral" || !o.nameToken) continue;
    const m = /^(.+)_(\d)$/.exec(o.nameToken);
    if (!m) continue;
    const g = groups.get(m[1]!) ?? { tokens: new Set<string>(), units: [] };
    g.tokens.add(o.nameToken);
    g.units.push(o);
    groups.set(m[1]!, g);
  }
  return [...groups.entries()]
    .map(([tokenBase, g]) => {
      const placed = g.units.reduce((s, u) => s + (placedByUnit[u.id] ?? 0), 0);
      const top = [...g.units].filter((u) => u.icon).sort((a, b) => (placedByUnit[b.id] ?? 0) - (placedByUnit[a.id] ?? 0))[0];
      return { tokenBase, tokens: [...g.tokens].sort(), placed, icon: top?.icon ?? null };
    })
    .filter((s) => s.placed > 0)
    .sort((a, b) => b.placed - a.placed);
}
