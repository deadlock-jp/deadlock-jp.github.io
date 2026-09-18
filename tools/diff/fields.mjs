// @ts-check
/**
 * スナップショット差分で比較対象にするフィールドの定義と、変化の向きの判定。
 *
 * 「サイトが実際に表示するフィールドだけを差分の対象にする」(architecture.html 第7章)の
 * 実体はここ。tools/gen-snapshot-diff.mjs(data/diffs/)と tools/gen-updates.mjs
 * (data/updates.json)の両方がこのファイルを使う。以前は同じ計算が両方に書かれていて、
 * 片方だけ直すと粒度がずれる状態だった。
 *
 * 対象を増やしたいときはこのファイルを足す。個々のフィールド名を
 * ホワイトリストで縛るのではなく「どの箱を見るか」を縛る設計。箱の中身
 * (properties/upgrades)は parser(src/parsers/properties.ts)側で既に
 * 内部フラグ等を弾いた後の、ラベル付き数値だけが残っている前提。
 *
 * パス表記(data/diffs/ と data/updates.json で共通):
 *   ヒーロー  stat.<名前> / growth.<名前>
 *             <abilityKey>.properties.<名前>
 *             <abilityKey>.upgrades.T<段>.<名前>       (同じ段に同名が複数あれば末尾に #2, #3)
 *   アイテム  cost / properties.<名前> / upgrades.T<段>.<名前>
 */

const EPS = 1e-9;
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * ability.properties の {name: value} を取り出す。数値でない値は skipped に積む。
 *
 * スピリット倍率(scale.statScale)は "<名前>@scale" として別の項目に分ける。
 * ここを見ないと「シャイニングワンダーのスピリットスケーリングが0.9から0.6に低下」
 * のような、値ではなく倍率だけが動く調整を取りこぼす(2026-08-22 に実例)。
 */
export function propValues(ability, skipped) {
  const out = {};
  for (const [name, p] of Object.entries(ability?.properties ?? {})) {
    if (isNum(p?.value)) out[name] = p.value;
    else if (skipped) skipped.push(`${name}=${JSON.stringify(p?.value)}`);
    if (isNum(p?.scale?.statScale)) out[`${name}@scale`] = p.scale.statScale;
  }
  return out;
}

/**
 * upgrades(AP強化)の {"T<段>.<プロパティ>": bonus}。
 *
 * 段をまたいで合算してはいけない。同じ段の中に同名が複数入ることもある
 * (セレステ ダズリングトリックの T2 は CombatBarrier=70 と CombatBarrier=0.76 の2行で、
 *  前者がバリア量・後者がスピリットスケーリング)。合算すると 70.76 という
 * 存在しない数になり、公式パッチノートの「バリア量を+80→+70、スケーリングを+0.7→+0.76」が
 * 表現できなくなる。段と出現順を鍵に含めて1行ずつ持つ。
 */
export function upgradeFields(ability, skipped) {
  const out = {};
  const tiers = ability?.upgrades ?? [];
  for (let i = 0; i < tiers.length; i++) {
    /** 同じ段の同名プロパティの出現回数。2つ目以降だけ #n を付ける */
    const seen = {};
    for (const u of tiers[i] ?? []) {
      const n = Number.parseFloat(String(u.bonus));
      if (!Number.isFinite(n)) {
        if (skipped) skipped.push(`T${i + 1}.${u.property}=${u.bonus}`);
        continue;
      }
      const count = (seen[u.property] = (seen[u.property] ?? 0) + 1);
      out[`T${i + 1}.${u.property}${count > 1 ? `#${count}` : ""}`] = n;
    }
  }
  return out;
}

/** 署名スキル(Signature1-4)の実IDを返す */
export function signatureAbilityKeys(hero) {
  return (hero.abilities ?? [])
    .filter((a) => String(a.slot).startsWith("Signature"))
    .map((a) => a.abilityKey);
}

/** 主武器の実ID。ヒーローページが weaponRows で表示している数値の出どころ */
export function primaryWeaponKey(hero) {
  return (hero.abilities ?? []).find((a) => a.slot === "Weapon_Primary")?.abilityKey ?? null;
}

/**
 * 主武器の「比較対象フィールド名 → 数値」。ability.weapon は properties と違って
 * 入れ子の素のオブジェクトなので、再帰でたどって "weapon.falloff.endRange" の形にする。
 * ここを見ないと「ラッシュの減衰距離が20m→58mから18m→54mに低下」のような
 * 武器だけの調整を取りこぼす(2026-08-12 に実例)。
 */
export function weaponFieldMap(ability) {
  const out = {};
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (isNum(v)) out[`${prefix}${k}`] = v;
      else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, `${prefix}${k}.`);
    }
  };
  walk(ability?.weapon, "");
  return out;
}

/** ヒーロー1体ぶんの「比較対象フィールド名 → 数値」マップ */
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
    for (const [k, v] of Object.entries(upgradeFields(ab, skipped))) {
      out[`${abilityKey}.upgrades.${k}`] = v;
    }
  }
  const weaponKey = primaryWeaponKey(hero);
  if (weaponKey) {
    for (const [k, v] of Object.entries(weaponFieldMap(abilitiesById[weaponKey]))) {
      out[`${weaponKey}.weapon.${k}`] = v;
    }
  }
  return out;
}

/** アイテム1件ぶんの「比較対象フィールド名 → 数値」マップ */
export function itemFieldMap(item, skipped) {
  const out = {};
  if (isNum(item.cost)) out["cost"] = item.cost;
  /*
   * 構成素材の組み替え(2026-09-16の「シャドウウィーブはスプリントブーツから作る/
   * ベールウォーカーは作らない」)は数値ではないが、公式ノートに載る立派な調整。
   * ここは数値マップなので「その素材を使っていれば1」という在否で表し、
   * 追加なら null→1、削除なら 1→null として差分に出す。
   */
  for (const c of item.componentItems ?? []) out[`components.${c}`] = 1;
  for (const [k, v] of Object.entries(propValues(item, skipped))) {
    out[`properties.${k}`] = v;
  }
  for (const [k, v] of Object.entries(upgradeFields(item, skipped))) {
    out[`upgrades.${k}`] = v;
  }
  return out;
}

/**
 * economy.json(generic_data.vdata 由来。src/parsers/economy.ts) 1版ぶんの
 * 「比較対象フィールド名 → 数値」マップ。
 *
 * ヒーロー・アイテムに属さない、勝利条件・ソウル獲得まわりの全体調整
 * (例: 2026-09-16 の「ガーディアン撃破報酬+10%」「オブジェクトのソウル配分 30%→25%」)を
 * 拾うためのもの。表示名は src/lib/economyLabels.ts、向き(バフ/ナーフ)の判定は
 * どちらのチームにも中立に効く値なので付けない(呼び出し側で good を null にする)。
 *
 * lanes(レーン名・色の定義)は数値ではなく、バランス調整として意味を持たないので対象外。
 */
export function economyFieldMap(economy) {
  const out = {};
  if (isNum(economy?.objectiveGoldNearPlayerSplitPct)) {
    out["objectiveGoldNearPlayerSplitPct"] = economy.objectiveGoldNearPlayerSplitPct;
  }
  for (const o of economy?.objectiveGold ?? []) {
    if (isNum(o.goldKill)) out[`objectiveGold.${o.key}.goldKill`] = o.goldKill;
    if (isNum(o.goldOrbs)) out[`objectiveGold.${o.key}.goldOrbs`] = o.goldOrbs;
  }
  (economy?.trooperKillGoldShareFrac ?? []).forEach((v, i) => {
    if (isNum(v)) out[`trooperKillGoldShareFrac.${i + 1}`] = v;
  });
  (economy?.heroKillGoldShareFrac ?? []).forEach((v, i) => {
    if (isNum(v)) out[`heroKillGoldShareFrac.${i + 1}`] = v;
  });
  const rejuv = economy?.rejuv ?? {};
  if (isNum(rejuv.buffDuration)) out["rejuv.buffDuration"] = rejuv.buffDuration;
  if (isNum(rejuv.expirationWarningTiming)) out["rejuv.expirationWarningTiming"] = rejuv.expirationWarningTiming;
  (rejuv.trooperHealthMult ?? []).forEach((v, i) => {
    if (isNum(v)) out[`rejuv.trooperHealthMult.${i + 1}`] = v;
  });
  (rejuv.playerRespawnMult ?? []).forEach((v, i) => {
    if (isNum(v)) out[`rejuv.playerRespawnMult.${i + 1}`] = v;
  });
  return out;
}

/**
 * 2つのフィールドマップを比べて変化した行を返す。
 * 片方にしか無いフィールドは before/after の一方を null にして返す
 * (2026-08-22 の「T2強化にスピリットスケーリング+0.45を追加」がこれに当たる。
 *  以前は両方に有る項目しか見ておらず、追加・削除が丸ごと落ちていた)。
 */
export function diffFieldMaps(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const rows = [];
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (a === undefined && b === undefined) continue;
    if (a !== undefined && b !== undefined && Math.abs(a - b) < EPS) continue;
    rows.push({ path: k, before: a ?? null, after: b ?? null });
  }
  return rows.sort((x, y) => x.path.localeCompare(y.path));
}

/* ------------------------------------------------------------------ *
 * 変化の向き(バフ/ナーフ)の判定
 * ------------------------------------------------------------------ */

/** 小さいほどゲーム的に有利なステータス(名前の一部で判定) */
const LOWER_IS_BETTER = [
  "cycletime",
  "cooldown",
  "reloadtime",
  "reloadduration",
  "chargetime",
  "castdelay",
  "castpoint",
  "spread",
  "recoil",
  "falloffdamage",
  "staminacost",
  "spiritcost",
  "resourcecost",
  "chargedelay",
  "cost",
];

/**
 * 向きを機械判定しない項目。
 *
 * 「相手を弱らせる値」と「自分が負う代償」が同じ名前の形をしていて、
 * データからはどちらか分からないものがある。たとえば負の値で持たれる
 * BulletArmorReduction(敵の防御を下げる = 下がるほど有利)と
 * SideMoveSpeedReduction(自分の移動が鈍る = 下がるほど不利)は、
 * 名前からは区別できない。推測でどちらかに倒すより無色で出す。
 *
 * ここに挙げるのは「名前の一部 + 値が両方とも0以下」の組み合わせ。
 * 実データと公式パッチノートの突き合わせ(tools/reconcile-patch-notes.mjs)で
 * 判定が逆だと分かった項目を、このリストに足していく。
 */
const UNDETERMINED_WHEN_NEGATIVE = ["reduction", "reduce", "penalty", "shred"];

/** 「無効」を表す番兵。-1 と実数の間の変化は、数値の調整ではなく機能の入り切り */
const SENTINEL = -1;

/** パスの末尾のフィールド名(段・#n・@scale を落としたもの) */
export function fieldNameOf(path) {
  const last = String(path).split(".").pop() ?? "";
  return last.replace(/#\d+$/, "").replace(/@scale$/, "");
}

/** スピリット倍率の行か */
export const isScalePath = (path) => String(path).endsWith("@scale");

/** そのパスが AP強化(upgrades)由来か */
export const isUpgradePath = (path) => /(^|\.)upgrades\.T\d+\./.test(String(path));

/** AP強化の段(1-3)。基礎値なら null */
export function upgradeTierOf(path) {
  return Number(/(?:^|\.)upgrades\.T(\d+)\./.exec(String(path))?.[1]) || null;
}

/**
 * 1項目の変化がゲーム的に有利な向きかどうか。
 *   true  有利  / false 不利 / null 判定しない(無色・集計対象外)
 */
export function goodOf(path, before, after) {
  const name = fieldNameOf(path).toLowerCase();

  // 追加・削除。番兵との出入りも含め、値そのものの大小では語れない
  if (before === null || after === null) {
    const value = before === null ? after : before;
    if (!isNum(value) || value === 0) return null;
    const lower = LOWER_IS_BETTER.some((s) => name.includes(s));
    // 「有利な項目が増えた」= 有利。削除ならその逆
    const favourable = lower ? value < 0 : value > 0;
    return before === null ? favourable : !favourable;
  }
  if (before === SENTINEL || after === SENTINEL) return null;

  if (before <= 0 && after <= 0 && UNDETERMINED_WHEN_NEGATIVE.some((s) => name.includes(s))) {
    return null;
  }

  const dir = LOWER_IS_BETTER.some((s) => name.includes(s)) ? -1 : 1;
  return dir * Math.sign(after - before) > 0;
}
