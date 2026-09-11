// @ts-check
/**
 * スナップショット差分(tools/gen-snapshot-diff.mjs)で比較対象にするフィールドの定義。
 *
 * 「サイトが実際に表示するフィールドだけを差分の対象にする」(architecture.html 第7章)の
 * 実体はここ。粒度は data/updates.json を作る tools/gen-updates.mjs と意図的に揃えている
 * (ヒーロー: startingStats/levelUpBonuses + 署名スキルの properties/upgrades、
 *  アイテム: cost + properties/upgrades)。ここに無いフィールド(内部フラグ・
 * パーティクル参照など)は比較対象にならず、件数だけ集計される。
 *
 * 対象を増やしたいときはこのファイルの EXTRA_* を足す。個々のフィールド名を
 * ホワイトリストで縛るのではなく「どの箱を見るか」を縛る設計。箱の中身
 * (properties/upgrades)は parser(src/parsers/properties.ts)側で既に
 * 内部フラグ等を弾いた後の、ラベル付き数値だけが残っている前提。
 */

const EPS = 1e-9;
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** ability.properties の {name: value} を取り出す。数値でない値は skipped に積む */
export function propValues(ability, skipped) {
  const out = {};
  for (const [name, p] of Object.entries(ability?.properties ?? {})) {
    if (isNum(p?.value)) out[name] = p.value;
    else if (skipped) skipped.push(`${name}=${JSON.stringify(p?.value)}`);
  }
  return out;
}

/** upgrades(段階強化)の {property: 全ティア合計bonus} */
export function upgradeBonuses(ability, skipped) {
  const acc = {};
  for (const tier of ability?.upgrades ?? []) {
    for (const u of tier ?? []) {
      const n = Number.parseFloat(String(u.bonus));
      if (Number.isFinite(n)) acc[`↑${u.property}`] = (acc[`↑${u.property}`] ?? 0) + n;
      else if (skipped) skipped.push(`↑${u.property}=${u.bonus}`);
    }
  }
  return acc;
}

/** 署名スキル(Signature1-4)の実IDを返す */
export function signatureAbilityKeys(hero) {
  return (hero.abilities ?? [])
    .filter((a) => String(a.slot).startsWith("Signature"))
    .map((a) => a.abilityKey);
}

/**
 * ヒーロー1体ぶんの「比較対象フィールド名 → 数値」マップ。
 * キーは "stat.EMaxHealth" / "growth.MODIFIER_VALUE_..." /
 * "<abilityKey>.properties.Damage" / "<abilityKey>.upgrades.↑Damage" の形。
 */
export function heroFieldMap(hero, abilitiesById, skipped) {
  const out = {};
  for (const [k, v] of Object.entries(hero.startingStats ?? {})) {
    if (isNum(v)) out[`stat.${k}`] = v;
  }
  for (const [k, v] of Object.entries(hero.levelUpBonuses ?? {})) {
    if (isNum(v)) out[`growth.${k}`] = v;
  }
  for (const abilityKey of signatureAbilityKeys(hero)) {
    const ab = abilitiesById[abilityKey];
    if (!ab) continue;
    for (const [k, v] of Object.entries(propValues(ab, skipped))) {
      out[`${abilityKey}.properties.${k}`] = v;
    }
    for (const [k, v] of Object.entries(upgradeBonuses(ab, skipped))) {
      out[`${abilityKey}.upgrades.${k}`] = v;
    }
  }
  return out;
}

/** アイテム1件ぶんの「比較対象フィールド名 → 数値」マップ */
export function itemFieldMap(item, skipped) {
  const out = {};
  if (isNum(item.cost)) out["cost"] = item.cost;
  for (const [k, v] of Object.entries(propValues(item, skipped))) {
    out[`properties.${k}`] = v;
  }
  for (const [k, v] of Object.entries(upgradeBonuses(item, skipped))) {
    out[`upgrades.${k}`] = v;
  }
  return out;
}

/** 2つのフィールドマップを比べて changed エントリの配列を返す */
export function diffFieldMaps(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const rows = [];
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (a === undefined || b === undefined) continue; // 片方にしか無い = フィールド自体の増減。ここでは扱わない
    if (Math.abs(a - b) < EPS) continue;
    rows.push({ path: k, before: a, after: b });
  }
  return rows.sort((x, y) => x.path.localeCompare(y.path));
}
